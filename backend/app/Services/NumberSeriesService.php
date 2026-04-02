<?php

namespace App\Services;

use App\Models\NumberSeriesModel;
use CodeIgniter\Database\BaseConnection;
use CodeIgniter\Database\Exceptions\DatabaseException;
use RuntimeException;

/**
 * NumberSeriesService — จัดการเลขที่เอกสารอัตโนมัติ
 *
 * Business Rules:
 * - 1 โครงการ : 1 series ต่อ document type
 * - ใช้ SELECT ... FOR UPDATE ป้องกัน race condition
 * - reset_cycle: YEARLY/MONTHLY/NEVER
 * - year_format: YYYY_BE/YYYY_AD/YY_BE/YY_AD/NONE
 * - ทุกการ generate จะบันทึก number_series_logs
 */
class NumberSeriesService
{
    private BaseConnection $db;
    private NumberSeriesModel $model;

    // ─── ค่า default สำหรับ number series แต่ละ document type ──────────
    public const DEFAULT_SERIES = [
        [
            'document_type'  => 'SALE',
            'prefix'         => 'SO',
            'separator'      => '-',
            'year_format'    => 'YYYY_BE',
            'year_separator' => '-',
            'running_digits' => 4,
            'reset_cycle'    => 'YEARLY',
        ],
        [
            'document_type'  => 'BUDGET_MOVE',
            'prefix'         => 'BM',
            'separator'      => '-',
            'year_format'    => 'YYYY_BE',
            'year_separator' => '-',
            'running_digits' => 4,
            'reset_cycle'    => 'YEARLY',
        ],
        [
            'document_type'  => 'BOTTOM_LINE',
            'prefix'         => 'BL',
            'separator'      => '-',
            'year_format'    => 'YYYY_BE',
            'year_separator' => '-',
            'running_digits' => 4,
            'reset_cycle'    => 'YEARLY',
        ],
        [
            'document_type'  => 'UNIT_ALLOC',
            'prefix'         => 'UA',
            'separator'      => '-',
            'year_format'    => 'YYYY_BE',
            'year_separator' => '-',
            'running_digits' => 4,
            'reset_cycle'    => 'YEARLY',
        ],
    ];

    // ─── Document type labels (ภาษาไทย) ──────────────────────────────
    public const DOCUMENT_TYPE_LABELS = [
        'SALE'        => 'บันทึกขาย',
        'BUDGET_MOVE' => 'เคลื่อนไหวงบประมาณ',
        'BOTTOM_LINE' => 'นำเข้าราคาต้นทุน',
        'UNIT_ALLOC'  => 'ตั้งงบผูกยูนิต',
    ];

    public function __construct()
    {
        $this->db    = \Config\Database::connect();
        $this->model = new NumberSeriesModel();
    }

    // =====================================================================
    //  1. generate() — ออกเลขที่เอกสารใหม่ (ใช้ row lock ป้องกัน race condition)
    // =====================================================================

    /**
     * ออกเลขที่เอกสารอัตโนมัติ
     *
     * *** CRITICAL: ใช้ SELECT ... FOR UPDATE ใน transaction ***
     *
     * @param int         $projectId      รหัสโครงการ
     * @param string      $documentType   ประเภทเอกสาร (SALE, BUDGET_MOVE, BOTTOM_LINE, UNIT_ALLOC)
     * @param int|null    $referenceId    ID ของ record ที่ใช้เลขนี้
     * @param string|null $referenceTable ชื่อตารางอ้างอิง
     * @param int|null    $generatedBy    User ID ที่ออกเลข
     * @return string เลขที่เอกสารที่ generate แล้ว
     */
    public function generate(
        int $projectId,
        string $documentType,
        ?int $referenceId = null,
        ?string $referenceTable = null,
        ?int $generatedBy = null
    ): string {
        $this->db->transBegin();

        try {
            // ─── 1. SELECT ... FOR UPDATE เพื่อ lock row ────────────
            $series = $this->db->query(
                'SELECT * FROM number_series
                 WHERE project_id = ? AND document_type = ? AND is_active = 1
                 FOR UPDATE',
                [$projectId, $documentType]
            )->getRowArray();

            // ─── 2. ถ้าไม่พบ → ใช้ fallback default pattern ──────────
            if (!$series) {
                $this->db->transCommit();
                return $this->generateFallback($documentType);
            }

            $now   = date('Y-m-d');
            $nextNumber    = (int) $series['next_number'];
            $lastResetDate = $series['last_reset_date'];

            // ─── 3. ตรวจ reset cycle ─────────────────────────────────
            $needsReset = $this->checkReset(
                $series['reset_cycle'],
                $series['year_format'],
                $lastResetDate,
                $now
            );

            if ($needsReset) {
                $nextNumber = 1;
            }

            // ─── 4. ประกอบเลขที่เอกสาร ──────────────────────────────
            $generatedNumber = $this->buildNumber($series, $nextNumber, $now);

            // ─── 5. อัปเดต next_number + last_reset_date ────────────
            $this->db->table('number_series')
                ->where('id', $series['id'])
                ->update([
                    'next_number'     => $nextNumber + 1,
                    'last_reset_date' => $now,
                    'updated_at'      => date('Y-m-d H:i:s'),
                ]);

            // ─── 6. บันทึก number_series_logs ────────────────────────
            $this->db->table('number_series_logs')->insert([
                'number_series_id' => $series['id'],
                'generated_number' => $generatedNumber,
                'reference_id'     => $referenceId,
                'reference_table'  => $referenceTable,
                'generated_by'     => $generatedBy,
                'generated_at'     => date('Y-m-d H:i:s'),
            ]);

            $this->db->transCommit();

            return $generatedNumber;

        } catch (DatabaseException $e) {
            $this->db->transRollback();
            throw new RuntimeException('เกิดข้อผิดพลาดในการออกเลขที่เอกสาร: ' . $e->getMessage());
        }
    }

    // =====================================================================
    //  2. getByProject() — ดึง series ทั้งหมดของโครงการ
    // =====================================================================

    /**
     * ดึง number series ทั้งหมดของโครงการ พร้อมคำนวณ sample_output แบบ real-time
     */
    public function getByProject(int $projectId): array
    {
        $series = $this->db->table('number_series')
            ->where('project_id', $projectId)
            ->orderBy('document_type', 'ASC')
            ->get()
            ->getResultArray();

        $now = date('Y-m-d');

        foreach ($series as &$item) {
            // คำนวณ sample_output real-time จากค่า config ปัจจุบัน
            $item['sample_output'] = $this->buildNumber($item, (int) $item['next_number'], $now);
            $item['document_type_label'] = self::DOCUMENT_TYPE_LABELS[$item['document_type']] ?? $item['document_type'];

            // นับจำนวน logs ที่เคยออกเลข
            $item['total_generated'] = (int) $this->db->table('number_series_logs')
                ->where('number_series_id', $item['id'])
                ->countAllResults();
        }
        unset($item);

        return $series;
    }

    // =====================================================================
    //  3. update() — อัปเดตการตั้งค่า series
    // =====================================================================

    /**
     * อัปเดต number series configuration
     * ถ้า series มี logs (เคยออกเลขแล้ว) → บันทึก audit log
     *
     * @return array ข้อมูล series ที่อัปเดตแล้ว
     */
    public function update(int $id, array $data): array
    {
        $series = $this->model->find($id);
        if (!$series) {
            throw new RuntimeException('ไม่พบ number series');
        }

        // ─── กรอง field ที่อนุญาตให้แก้ไข ─────────────────────────────
        $allowedKeys = [
            'prefix', 'separator', 'year_format', 'year_separator',
            'running_digits', 'reset_cycle', 'next_number', 'is_active',
        ];

        $updateData = ['updated_at' => date('Y-m-d H:i:s')];
        foreach ($allowedKeys as $key) {
            if (array_key_exists($key, $data)) {
                $updateData[$key] = $data[$key];
            }
        }

        // ─── คำนวณ sample_output ใหม่ ─────────────────────────────────
        $mergedConfig = array_merge($series, $updateData);
        $nextNumber   = (int) ($updateData['next_number'] ?? $series['next_number']);
        $updateData['sample_output'] = $this->buildNumber($mergedConfig, $nextNumber, date('Y-m-d'));

        // ─── ตรวจว่า series เคยออกเลขแล้วหรือไม่ (สำหรับ audit log) ──
        $hasLogs = $this->db->table('number_series_logs')
            ->where('number_series_id', $id)
            ->countAllResults() > 0;

        $this->model->update($id, $updateData);

        // ─── ถ้าเคยออกเลขแล้ว → บันทึก audit log ────────────────────
        if ($hasLogs) {
            $this->logConfigChange($id, $series, $updateData);
        }

        $updated = $this->model->find($id);
        $updated['document_type_label'] = self::DOCUMENT_TYPE_LABELS[$updated['document_type']] ?? $updated['document_type'];
        $updated['total_generated'] = (int) $this->db->table('number_series_logs')
            ->where('number_series_id', $id)
            ->countAllResults();

        return $updated;
    }

    // =====================================================================
    //  4. preview() — แสดงตัวอย่างเลขที่จาก config ที่กำหนด (ไม่บันทึก)
    // =====================================================================

    /**
     * Preview เลขที่เอกสารจาก config ที่กำหนด
     *
     * @param array $config  ค่า prefix, separator, year_format, year_separator,
     *                       running_digits, reset_cycle, next_number, reference_date
     * @return array pattern_display, samples[], reset_sample
     */
    public function preview(array $config): array
    {
        $referenceDate = $config['reference_date'] ?? date('Y-m-d');
        $nextNumber    = (int) ($config['next_number'] ?? 1);

        // ─── สร้าง pattern_display (อ่านง่าย) ────────────────────────
        $patternDisplay = $this->buildPatternDisplay($config);

        // ─── สร้าง samples 3 ตัวอย่าง ─────────────────────────────────
        $samples = [];
        for ($i = 0; $i < 3; $i++) {
            $label = $i === 0 ? 'เลขถัดไป' : 'เลขถัดไป+' . $i;
            $samples[] = [
                'label'  => $label,
                'number' => $this->buildNumber($config, $nextNumber + $i, $referenceDate),
            ];
        }

        // ─── สร้าง reset_sample (ถ้ามี reset) ────────────────────────
        $resetSample = null;
        $resetCycle  = $config['reset_cycle'] ?? 'NEVER';

        if ($resetCycle !== 'NEVER') {
            $resetDate  = $this->getNextResetDate($referenceDate, $resetCycle);
            $resetLabel = $resetCycle === 'YEARLY' ? 'หลัง reset (ปีถัดไป)' : 'หลัง reset (เดือนถัดไป)';

            $resetSample = [
                'label'  => $resetLabel,
                'number' => $this->buildNumber($config, 1, $resetDate),
            ];
        }

        return [
            'pattern_display' => $patternDisplay,
            'samples'         => $samples,
            'reset_sample'    => $resetSample,
        ];
    }

    // =====================================================================
    //  5. createDefaultSeries() — สร้าง default 4 series เมื่อสร้างโครงการใหม่
    // =====================================================================

    /**
     * สร้าง default number series 4 รายการสำหรับโครงการใหม่
     * เรียกทันทีหลัง INSERT project — ควรอยู่ใน DB transaction เดียวกัน
     */
    public function createDefaultSeries(int $projectId): void
    {
        $now = date('Y-m-d H:i:s');

        foreach (self::DEFAULT_SERIES as $config) {
            $sample = $this->buildNumber($config, 1, date('Y-m-d'));

            $this->model->insert([
                'project_id'      => $projectId,
                'document_type'   => $config['document_type'],
                'prefix'          => $config['prefix'],
                'separator'       => $config['separator'],
                'year_format'     => $config['year_format'],
                'year_separator'  => $config['year_separator'],
                'running_digits'  => $config['running_digits'],
                'reset_cycle'     => $config['reset_cycle'],
                'next_number'     => 1,
                'last_reset_date' => null,
                'sample_output'   => $sample,
                'is_active'       => true,
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);
        }
    }

    // =====================================================================
    //  Private helper: ประกอบเลขที่เอกสาร
    // =====================================================================

    /**
     * ประกอบเลขที่เอกสารจาก config + running number + date
     *
     * สูตร: {prefix}{separator}{yearPart}{monthPart}{year_separator}{running}
     */
    private function buildNumber(array $config, int $number, string $date): string
    {
        $yearPart  = $this->formatYear($date, $config['year_format'] ?? 'YYYY_BE');
        $monthPart = ($config['reset_cycle'] ?? 'YEARLY') === 'MONTHLY'
            ? date('m', strtotime($date))
            : '';

        $runningDigits = (int) ($config['running_digits'] ?? 4);
        $runningPart   = str_pad((string) $number, $runningDigits, '0', STR_PAD_LEFT);

        $prefix        = $config['prefix'] ?? '';
        $separator     = $config['separator'] ?? '';
        $yearSeparator = $config['year_separator'] ?? '-';

        // ประกอบ: prefix + separator + yearPart + monthPart + year_separator + running
        $result = $prefix . $separator . $yearPart . $monthPart;

        // ถ้ามี yearPart หรือ monthPart → ใส่ year_separator ก่อน running
        if ($yearPart !== '' || $monthPart !== '') {
            $result .= $yearSeparator;
        }

        $result .= $runningPart;

        return $result;
    }

    /**
     * แปลงวันที่เป็นส่วนปีตาม year_format
     */
    private function formatYear(string $date, string $yearFormat): string
    {
        $adYear = (int) date('Y', strtotime($date));
        $beYear = $adYear + 543;

        return match ($yearFormat) {
            'YYYY_BE' => (string) $beYear,
            'YYYY_AD' => (string) $adYear,
            'YY_BE'   => substr((string) $beYear, -2),
            'YY_AD'   => substr((string) $adYear, -2),
            'NONE'    => '',
            default   => (string) $beYear,
        };
    }

    // =====================================================================
    //  Private helper: ตรวจ reset cycle
    // =====================================================================

    /**
     * ตรวจว่าต้อง reset เลขลำดับหรือไม่
     *
     * @return bool true = ต้อง reset next_number = 1
     */
    private function checkReset(string $resetCycle, string $yearFormat, ?string $lastResetDate, string $currentDate): bool
    {
        if ($resetCycle === 'NEVER') {
            return false;
        }

        if ($lastResetDate === null) {
            return false; // ยังไม่เคย generate → ไม่ต้อง reset (เริ่มจาก 1 อยู่แล้ว)
        }

        if ($resetCycle === 'YEARLY') {
            // ตรวจปีตาม year_format (BE/AD) ให้สม่ำเสมอ
            $currentYear = $this->getYearValue($currentDate, $yearFormat);
            $lastYear    = $this->getYearValue($lastResetDate, $yearFormat);
            return $currentYear !== $lastYear;
        }

        if ($resetCycle === 'MONTHLY') {
            $currentMonth = date('Y-m', strtotime($currentDate));
            $lastMonth    = date('Y-m', strtotime($lastResetDate));
            return $currentMonth !== $lastMonth;
        }

        return false;
    }

    /**
     * ดึงค่าปีตาม year_format (BE หรือ AD) สำหรับเปรียบเทียบ reset
     */
    private function getYearValue(string $date, string $yearFormat): int
    {
        $adYear = (int) date('Y', strtotime($date));

        // ถ้าเป็น BE format → ใช้ปี พ.ศ. ในการเปรียบเทียบ
        if (in_array($yearFormat, ['YYYY_BE', 'YY_BE'], true)) {
            return $adYear + 543;
        }

        return $adYear;
    }

    // =====================================================================
    //  Private helper: Fallback default pattern
    // =====================================================================

    /**
     * Fallback: ถ้าไม่พบ series ที่ active → ใช้ pattern default
     * รูปแบบ: {TYPE}{YYYYMMDD}{0001}
     */
    private function generateFallback(string $documentType): string
    {
        return $documentType . date('Ymd') . '0001';
    }

    // =====================================================================
    //  Private helper: Pattern display (อ่านง่ายสำหรับ UI)
    // =====================================================================

    /**
     * สร้าง pattern display string เช่น "SO-{ปีพ.ศ.4หลัก}-{เลข4หลัก}"
     */
    private function buildPatternDisplay(array $config): string
    {
        $prefix    = $config['prefix'] ?? '';
        $separator = $config['separator'] ?? '';
        $yearSep   = $config['year_separator'] ?? '-';
        $digits    = (int) ($config['running_digits'] ?? 4);
        $yearFmt   = $config['year_format'] ?? 'YYYY_BE';
        $cycle     = $config['reset_cycle'] ?? 'YEARLY';

        $yearLabel = match ($yearFmt) {
            'YYYY_BE' => 'ปีพ.ศ.4หลัก',
            'YYYY_AD' => 'ปีค.ศ.4หลัก',
            'YY_BE'   => 'ปีพ.ศ.2หลัก',
            'YY_AD'   => 'ปีค.ศ.2หลัก',
            'NONE'    => '',
            default   => 'ปี',
        };

        $parts = $prefix . $separator;

        if ($yearLabel !== '') {
            $parts .= '{' . $yearLabel . '}';
            if ($cycle === 'MONTHLY') {
                $parts .= '{เดือน}';
            }
            $parts .= $yearSep;
        }

        $digitDisplay = str_repeat('#', $digits);
        $parts .= '{เลข' . $digits . 'หลัก}';

        return $parts;
    }

    // =====================================================================
    //  Private helper: Next reset date (สำหรับ preview)
    // =====================================================================

    /**
     * คำนวณวันที่ที่จะ reset ถัดไป (ใช้ใน preview)
     */
    private function getNextResetDate(string $referenceDate, string $resetCycle): string
    {
        $ts = strtotime($referenceDate);

        if ($resetCycle === 'YEARLY') {
            // ปีถัดไป วันที่ 1 มกราคม
            $nextYear = (int) date('Y', $ts) + 1;
            return $nextYear . '-01-01';
        }

        if ($resetCycle === 'MONTHLY') {
            // เดือนถัดไป วันที่ 1
            return date('Y-m-01', strtotime('+1 month', $ts));
        }

        return $referenceDate;
    }

    // =====================================================================
    //  Private helper: Log config change (audit trail)
    // =====================================================================

    /**
     * บันทึก audit log เมื่อเปลี่ยน config ของ series ที่มี logs แล้ว
     */
    private function logConfigChange(int $seriesId, array $oldConfig, array $newData): void
    {
        $changes = [];
        $trackFields = ['prefix', 'separator', 'year_format', 'year_separator', 'running_digits', 'reset_cycle', 'next_number', 'is_active'];

        foreach ($trackFields as $field) {
            if (array_key_exists($field, $newData) && (string) $oldConfig[$field] !== (string) $newData[$field]) {
                $changes[] = "{$field}: {$oldConfig[$field]} → {$newData[$field]}";
            }
        }

        if (!empty($changes)) {
            // บันทึกเป็น log entry พิเศษ (reference_table = 'config_change')
            $this->db->table('number_series_logs')->insert([
                'number_series_id' => $seriesId,
                'generated_number' => 'CONFIG_CHANGE: ' . implode(', ', $changes),
                'reference_id'     => $seriesId,
                'reference_table'  => 'config_change',
                'generated_at'     => date('Y-m-d H:i:s'),
            ]);
        }
    }
}
