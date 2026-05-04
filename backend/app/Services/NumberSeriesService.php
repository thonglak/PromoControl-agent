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

            // ─── 2. ถ้าไม่พบ → auto-provision series row จาก default config ──
            //     (เลี่ยง generateFallback เก่าที่คืนเลขซ้ำเสมอ → duplicate key)
            if (!$series) {
                $this->db->transRollback();
                $this->autoProvisionSeries($projectId, $documentType);
                return $this->generate($projectId, $documentType, $referenceId, $referenceTable, $generatedBy);
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
    //  6. provisionMissingSeries — สร้าง series rows ที่ยังขาดให้ครบ
    // =====================================================================

    /**
     * ตรวจ DEFAULT_SERIES ทุกตัว แล้วสร้าง row ที่ยังไม่มีให้ครบ
     * ใช้สำหรับโครงการที่สร้างผ่าน import หรือสร้างก่อนระบบ number series
     *
     * @return array{created: int, types: string[]} จำนวน + รายการ document_type ที่สร้างใหม่
     */
    public function provisionMissingSeries(int $projectId): array
    {
        $existing = $this->db->table('number_series')
            ->select('document_type')
            ->where('project_id', $projectId)
            ->get()->getResultArray();
        $existingTypes = array_column($existing, 'document_type');

        $createdTypes = [];
        foreach (self::DEFAULT_SERIES as $config) {
            if (in_array($config['document_type'], $existingTypes, true)) {
                continue;
            }
            $this->autoProvisionSeries($projectId, $config['document_type']);
            $createdTypes[] = $config['document_type'];
        }

        return [
            'created' => count($createdTypes),
            'types'   => $createdTypes,
        ];
    }

    /**
     * สแกนทุกโครงการ → provision number_series ที่ยังขาด
     * ใช้ในหน้า Fix Error สำหรับ admin
     *
     * @return array{
     *   total_projects: int, fixed_projects: int, total_created: int,
     *   details: array<int, array{project_id:int, project_code:string, project_name:string, created:int, types:string[]}>
     * }
     */
    public function provisionMissingSeriesAll(): array
    {
        $projects = $this->db->table('projects')
            ->select('id, code, name')
            ->orderBy('id', 'ASC')
            ->get()->getResultArray();

        $details      = [];
        $fixedCount   = 0;
        $totalCreated = 0;

        foreach ($projects as $p) {
            $result = $this->provisionMissingSeries((int) $p['id']);
            if ($result['created'] > 0) {
                $fixedCount++;
                $totalCreated += $result['created'];
                $details[] = [
                    'project_id'   => (int) $p['id'],
                    'project_code' => (string) $p['code'],
                    'project_name' => (string) $p['name'],
                    'created'      => $result['created'],
                    'types'        => $result['types'],
                ];
            }
        }

        return [
            'total_projects' => count($projects),
            'fixed_projects' => $fixedCount,
            'total_created'  => $totalCreated,
            'details'        => $details,
        ];
    }

    // =====================================================================
    //  Private helper: Auto-provision missing series
    // =====================================================================

    /**
     * สร้าง number_series row อัตโนมัติเมื่อโครงการไม่มี series ของ document_type นี้
     * (เกิดจากโครงการเก่าที่สร้างก่อนระบบ number series หรือถูกลบทิ้ง)
     *
     * ใช้ INSERT IGNORE — ถ้า race condition ทำให้อีก request สร้างไปก่อนแล้ว
     * (UNIQUE KEY project_id+document_type) ก็จะ no-op และให้ผู้เรียก recurse
     */
    private function autoProvisionSeries(int $projectId, string $documentType): void
    {
        $config = null;
        foreach (self::DEFAULT_SERIES as $c) {
            if ($c['document_type'] === $documentType) { $config = $c; break; }
        }
        if (!$config) {
            throw new RuntimeException("ไม่พบ default config สำหรับ document_type: {$documentType}");
        }

        $now    = date('Y-m-d H:i:s');
        $sample = $this->buildNumber($config, 1, date('Y-m-d'));

        // หมายเหตุ: `separator` เป็น reserved word ใน MySQL 8 — ต้องใส่ backtick ทุก column
        $this->db->query(
            'INSERT IGNORE INTO `number_series`
             (`project_id`, `document_type`, `prefix`, `separator`, `year_format`, `year_separator`,
              `running_digits`, `reset_cycle`, `next_number`, `last_reset_date`, `sample_output`,
              `is_active`, `created_at`, `updated_at`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, 1, ?, ?)',
            [
                $projectId,
                $config['document_type'],
                $config['prefix'],
                $config['separator'],
                $config['year_format'],
                $config['year_separator'],
                $config['running_digits'],
                $config['reset_cycle'],
                $sample,
                $now,
                $now,
            ]
        );
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
