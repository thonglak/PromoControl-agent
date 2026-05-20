<?php

namespace App\Services;

use App\Services\PromotionItemService;
use CodeIgniter\Database\BaseConnection;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use RuntimeException;

/**
 * PremiumImportService — อ่านไฟล์ Premium.xlsx เข้าตาราง staging
 *
 * โครงสร้างไฟล์ (เหมือนกันทุกชีต — 1 ชีต = 1 โครงการ):
 *   - แถวบนสุดมีช่อง "โครงการ" → รหัสโครงการอยู่ช่องถัดไป
 *   - หัวตาราง 2 ชั้น: ชั้นบนมี "ลำดับ/เลขแปลง/เนื้อที่ดิน/แบบบ้าน/ราคา/Premium"
 *                      ชั้นล่างมี "Bottom Line" + ชื่อของแถมแต่ละรายการ
 *   - ข้อมูลเริ่มแถวถัดจากหัวชั้นล่าง 1 แถว
 *   - ท้ายชีตมีแถวว่าง + แถวรวมยอด (เลขแปลงว่าง) → ข้ามอัตโนมัติ
 *
 * กฎสำคัญ:
 * 1. คอลัมน์ของแถมไม่คงที่ → เก็บแบบ long-format ใน premium_import_values
 * 2. หมวดของแถมแยกตามกฎ 3 หมวด: discount / premium / expense_support
 * 3. import = staging เท่านั้น ยังไม่แตะ project_units (จับคู่/sync เป็นขั้นถัดไป)
 * 4. Error messages เป็นภาษาไทย
 */
class PremiumImportService
{
    private BaseConnection $db;

    /** จำนวนแถวบนสุดที่ใช้ค้นหาหัวตาราง/รหัสโครงการ */
    private const HEADER_SCAN_LIMIT = 15;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Preview — อ่านไฟล์เพื่อแสดงตัวอย่างก่อน import (ไม่เขียน DB)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * อ่านทุกชีต → คืนผลวิเคราะห์โครงสร้างสำหรับ preview
     */
    public function parseFile(string $filePath, string $fileName): array
    {
        $spreadsheet = IOFactory::load($filePath);
        $sheets      = [];

        foreach ($spreadsheet->getSheetNames() as $sheetName) {
            $sheet  = $spreadsheet->getSheetByName($sheetName);
            $layout = $this->detectLayout($sheet);

            $project = $layout['project_code']
                ? $this->findProjectByCode($layout['project_code'])
                : null;

            $rows = $this->extractRows($sheet, $layout);

            $sheets[] = [
                'sheet_name'     => $sheetName,
                'project_code'   => $layout['project_code'],
                'project_id'     => $project['id'] ?? null,
                'project_name'   => $project['name'] ?? null,
                'data_rows'      => count($rows),
                'premium_labels' => array_map(static fn ($p) => [
                    'label'        => $p['label'],
                    'category'     => $p['category'],
                    'column_index' => $p['column_index'],
                ], $layout['premium_columns']),
                'sample_rows'    => array_slice($rows, 0, 5),
                'importable'     => $project !== null && count($rows) > 0,
            ];
        }

        return [
            'file_name' => $fileName,
            'sheets'    => $sheets,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Import — เขียนข้อมูลลงตาราง staging
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * นำเข้าชีตที่เลือกลง staging — 1 batch ต่อ 1 ชีต
     *
     * @param string[]|null $sheetNames ชื่อชีตที่ต้องการ import (null = ทุกชีต)
     * @param int[]|null    $allowedProjectIds โครงการที่ผู้ใช้มีสิทธิ์ (null = ทุกโครงการ)
     * @return array{batches: array, skipped: array}
     */
    public function importToStaging(
        string $filePath,
        string $fileName,
        int $userId,
        ?array $sheetNames = null,
        ?array $allowedProjectIds = null
    ): array {
        $spreadsheet = IOFactory::load($filePath);
        $targets     = $sheetNames ?: $spreadsheet->getSheetNames();

        $batches = [];
        $skipped = [];

        foreach ($targets as $sheetName) {
            $sheet = $spreadsheet->getSheetByName($sheetName);
            if (!$sheet) {
                $skipped[] = ['sheet_name' => $sheetName, 'reason' => 'ไม่พบชีตนี้ในไฟล์'];
                continue;
            }

            $layout  = $this->detectLayout($sheet);
            $project = $layout['project_code']
                ? $this->findProjectByCode($layout['project_code'])
                : null;

            if (!$project) {
                $skipped[] = [
                    'sheet_name' => $sheetName,
                    'reason'     => 'ไม่พบโครงการรหัส "' . ($layout['project_code'] ?? '-') . '" ในระบบ',
                ];
                continue;
            }
            if ($allowedProjectIds !== null && !in_array((int) $project['id'], $allowedProjectIds, true)) {
                $skipped[] = [
                    'sheet_name' => $sheetName,
                    'reason'     => 'ไม่มีสิทธิ์เข้าถึงโครงการ ' . $layout['project_code'],
                ];
                continue;
            }

            $rows = $this->extractRows($sheet, $layout);
            if (empty($rows)) {
                $skipped[] = ['sheet_name' => $sheetName, 'reason' => 'ไม่พบข้อมูลแปลงในชีตนี้'];
                continue;
            }

            $batches[] = $this->writeBatch(
                $sheetName,
                $fileName,
                (int) $project['id'],
                $layout['project_code'],
                $rows,
                $userId
            );
        }

        if (empty($batches)) {
            throw new RuntimeException('ไม่มีชีตที่นำเข้าได้: ' . implode('; ', array_column($skipped, 'reason')));
        }

        return ['batches' => $batches, 'skipped' => $skipped];
    }

    /**
     * เขียน 1 ชีต → premium_import_batches + premium_import_units + premium_import_values
     */
    private function writeBatch(
        string $sheetName,
        string $fileName,
        int $projectId,
        string $projectCode,
        array $rows,
        int $userId
    ): array {
        $now = date('Y-m-d H:i:s');

        $this->db->transStart();

        $this->db->table('premium_import_batches')->insert([
            'project_id'       => $projectId,
            'source_file_name' => $fileName,
            'sheet_name'       => $sheetName,
            'project_code'     => $projectCode,
            'total_rows'       => count($rows),
            'matched_rows'     => 0,
            'unmatched_rows'   => 0,
            'synced_rows'      => 0,
            'status'           => 'pending',
            'imported_by'      => $userId,
            'imported_at'      => $now,
            'created_at'       => $now,
            'updated_at'       => $now,
        ]);
        $batchId = (int) $this->db->insertID();

        $valueRows = [];
        foreach ($rows as $row) {
            $this->db->table('premium_import_units')->insert([
                'batch_id'          => $batchId,
                'seq'               => $row['seq'],
                'plot_no'           => $row['plot_no'],
                'land_area_sqw'     => $row['land_area_sqw'],
                'house_model_code'  => $row['house_model_code'],
                'bottom_line_price' => $row['bottom_line_price'],
                'raw_row_index'     => $row['raw_row_index'],
                'match_status'      => 'unmatched',
                'created_at'        => $now,
            ]);
            $unitId = (int) $this->db->insertID();

            foreach ($row['premiums'] as $premium) {
                $valueRows[] = [
                    'import_unit_id'   => $unitId,
                    'premium_label'    => $premium['label'],
                    'premium_category' => $premium['category'],
                    'amount'           => $premium['amount'],
                    'column_index'     => $premium['column_index'],
                    'created_at'       => $now,
                ];
            }
        }

        if (!empty($valueRows)) {
            $this->db->table('premium_import_values')->insertBatch($valueRows);
        }

        $this->db->transComplete();

        if ($this->db->transStatus() === false) {
            throw new RuntimeException('บันทึกข้อมูลชีต ' . $sheetName . ' ไม่สำเร็จ');
        }

        return [
            'batch_id'     => $batchId,
            'sheet_name'   => $sheetName,
            'project_id'   => $projectId,
            'project_code' => $projectCode,
            'total_rows'   => count($rows),
            'value_rows'   => count($valueRows),
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Validate — จับคู่ staging กับฐานข้อมูลจริง (ยังไม่เขียนทับ project_units)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * จับคู่ข้อมูล staging ของ batch:
     *   - plot_no          ↔ project_units.unit_number (ในโครงการเดียวกัน)
     *   - house_model_code ↔ house_models.code
     *   - premium_label    ↔ promotion_item_master.name
     *
     * ไม่แตะ project_units — แค่เติมฟิลด์ matched_* และเปลี่ยน status เป็น validated
     */
    public function validateBatch(int $batchId): array
    {
        $batch = $this->getBatchOrFail($batchId);
        if ($batch['status'] === 'synced') {
            throw new RuntimeException('batch นี้ sync ไปแล้ว ไม่สามารถ validate ซ้ำได้');
        }

        $projectId = (int) $batch['project_id'];

        // map: unit_number → [unit_id, ...] (อาจซ้ำ → ambiguous)
        $unitMap = [];
        foreach ($this->db->table('project_units')
                     ->select('id, unit_number')
                     ->where('project_id', $projectId)
                     ->get()->getResultArray() as $u) {
            $unitMap[(string) $u['unit_number']][] = (int) $u['id'];
        }

        // map: house_model code → id
        $modelMap = [];
        foreach ($this->db->table('house_models')
                     ->select('id, code')
                     ->where('project_id', $projectId)
                     ->get()->getResultArray() as $m) {
            $modelMap[(string) $m['code']] = (int) $m['id'];
        }

        $units = $this->db->table('premium_import_units')
            ->where('batch_id', $batchId)
            ->get()->getResultArray();

        $matched = $unmatched = $ambiguous = 0;

        foreach ($units as $u) {
            $candidates = $unitMap[(string) $u['plot_no']] ?? [];
            if (count($candidates) === 1) {
                $status = 'matched';
                $unitId = $candidates[0];
                $matched++;
            } elseif (count($candidates) > 1) {
                $status = 'ambiguous';
                $unitId = null;
                $ambiguous++;
            } else {
                $status = 'unmatched';
                $unitId = null;
                $unmatched++;
            }

            $this->db->table('premium_import_units')
                ->where('id', $u['id'])
                ->update([
                    'matched_unit_id'        => $unitId,
                    'matched_house_model_id' => $modelMap[(string) $u['house_model_code']] ?? null,
                    'match_status'           => $status,
                ]);
        }

        // จับคู่ premium_label ↔ promotion_item_master (ยังไม่สร้าง item ใหม่)
        $labels = $this->resolvePremiumLabels($batchId, $projectId, false);

        $this->db->table('premium_import_batches')
            ->where('id', $batchId)
            ->update([
                'matched_rows'   => $matched,
                'unmatched_rows' => $unmatched + $ambiguous,
                'status'         => 'validated',
                'updated_at'     => date('Y-m-d H:i:s'),
            ]);

        return [
            'batch_id'          => $batchId,
            'total_rows'        => count($units),
            'matched_rows'      => $matched,
            'unmatched_rows'    => $unmatched,
            'ambiguous_rows'    => $ambiguous,
            'resolved_labels'   => $labels['resolved'],
            'unresolved_labels' => $labels['unresolved'],
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Sync — เขียนข้อมูลจาก staging ลงฐานข้อมูลจริง
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Sync batch ที่ validate แล้ว:
     *   - bottom_line_price → project_units.unit_cost
     *   - land_area_sqw     → project_units.land_area_sqw
     *   - จำนวนเงินของแถม   → promotion_item_unit_values (upsert)
     *   - premium_label ที่ยังไม่มี → auto-create promotion_item_master
     *
     * sync เฉพาะ unit ที่ match_status = matched เท่านั้น
     */
    public function syncBatch(int $batchId): array
    {
        $batch = $this->getBatchOrFail($batchId);
        if ($batch['status'] === 'pending') {
            throw new RuntimeException('กรุณา validate batch ก่อน sync');
        }
        if ($batch['status'] === 'synced') {
            throw new RuntimeException('batch นี้ sync ไปแล้ว');
        }

        $projectId = (int) $batch['project_id'];

        // 1. จับคู่ + auto-create promotion item (นอก transaction หลัก
        //    เพราะ PromotionItemService::create มี transaction ของตัวเอง)
        $labels   = $this->resolvePremiumLabels($batchId, $projectId, true);
        $labelMap = $labels['map'];

        // 2. ดึงเฉพาะ unit ที่จับคู่สำเร็จ
        $units = $this->db->table('premium_import_units')
            ->where('batch_id', $batchId)
            ->where('match_status', 'matched')
            ->get()->getResultArray();

        if (empty($units)) {
            throw new RuntimeException('ไม่มี unit ที่จับคู่สำเร็จใน batch นี้');
        }

        $now = date('Y-m-d H:i:s');
        $this->db->transStart();

        $syncedCount = 0;
        foreach ($units as $u) {
            $unitId = (int) $u['matched_unit_id'];

            // 2.1 อัปเดต project_units เฉพาะค่าที่มีในไฟล์
            $unitUpdate = [];
            if ($u['bottom_line_price'] !== null) {
                $unitUpdate['unit_cost'] = $u['bottom_line_price'];
            }
            if ($u['land_area_sqw'] !== null) {
                $unitUpdate['land_area_sqw'] = $u['land_area_sqw'];
            }
            if (!empty($unitUpdate)) {
                $unitUpdate['updated_at'] = $now;
                $this->db->table('project_units')->where('id', $unitId)->update($unitUpdate);
            }

            // 2.2 upsert จำนวนเงินของแถมรายยูนิต
            $values = $this->db->table('premium_import_values')
                ->where('import_unit_id', $u['id'])
                ->get()->getResultArray();

            foreach ($values as $v) {
                $itemId = $labelMap[trim((string) $v['premium_label'])] ?? null;
                if (!$itemId) {
                    continue;
                }

                $existing = $this->db->table('promotion_item_unit_values')
                    ->where('promotion_item_id', $itemId)
                    ->where('unit_id', $unitId)
                    ->get()->getRowArray();

                if ($existing) {
                    $this->db->table('promotion_item_unit_values')
                        ->where('id', $existing['id'])
                        ->update([
                            'amount'          => $v['amount'],
                            'source_batch_id' => $batchId,
                            'updated_at'      => $now,
                        ]);
                } else {
                    $this->db->table('promotion_item_unit_values')->insert([
                        'promotion_item_id' => $itemId,
                        'unit_id'           => $unitId,
                        'amount'            => $v['amount'],
                        'source_batch_id'   => $batchId,
                        'created_at'        => $now,
                        'updated_at'        => $now,
                    ]);
                }
            }

            $this->db->table('premium_import_units')
                ->where('id', $u['id'])
                ->update(['match_status' => 'synced']);
            $syncedCount++;
        }

        $this->db->table('premium_import_batches')
            ->where('id', $batchId)
            ->update([
                'synced_rows' => $syncedCount,
                'status'      => 'synced',
                'synced_at'   => $now,
                'updated_at'  => $now,
            ]);

        $this->db->transComplete();
        if ($this->db->transStatus() === false) {
            throw new RuntimeException('sync ข้อมูลไม่สำเร็จ');
        }

        return [
            'batch_id'      => $batchId,
            'synced_units'  => $syncedCount,
            'skipped_units' => (int) $batch['total_rows'] - $syncedCount,
            'created_items' => $labels['created'],
        ];
    }

    /**
     * จับคู่ premium_label ทั้งหมดของ batch กับ promotion_item_master.name
     * และเขียน promotion_item_id กลับลง premium_import_values
     *
     * @param bool $autoCreate true = สร้าง item ที่ยังไม่มี (ใช้ตอน sync)
     * @return array{map: array<string,int>, resolved: string[], unresolved: string[], created: array}
     */
    private function resolvePremiumLabels(int $batchId, int $projectId, bool $autoCreate): array
    {
        // distinct label + category ของ batch นี้
        $labels = $this->db->table('premium_import_values v')
            ->select('v.premium_label, v.premium_category')
            ->join('premium_import_units u', 'u.id = v.import_unit_id')
            ->where('u.batch_id', $batchId)
            ->groupBy('v.premium_label, v.premium_category')
            ->get()->getResultArray();

        // promotion item ของโครงการ — key by name (ไม่กรอง is_active กัน auto-create ซ้ำ)
        $itemMap = [];
        foreach ($this->db->table('promotion_item_master')
                     ->select('id, name')
                     ->where('project_id', $projectId)
                     ->get()->getResultArray() as $it) {
            $itemMap[trim((string) $it['name'])] = (int) $it['id'];
        }

        $map = [];
        $resolved = $unresolved = $created = [];

        foreach ($labels as $row) {
            $label  = trim((string) $row['premium_label']);
            $itemId = $itemMap[$label] ?? null;

            if ($itemId === null && $autoCreate) {
                $item = (new PromotionItemService())->create($projectId, [
                    'name'          => $label,
                    'category'      => $row['premium_category'],
                    'value_mode'    => 'fixed',
                    'default_value' => 0,
                ]);
                $itemId            = (int) $item['id'];
                $itemMap[$label]   = $itemId;
                $created[]         = [
                    'label'             => $label,
                    'category'          => $row['premium_category'],
                    'promotion_item_id' => $itemId,
                ];
            }

            if ($itemId) {
                $map[$label] = $itemId;
                $resolved[]  = $label;
                // เขียน promotion_item_id กลับ staging
                $this->db->query(
                    'UPDATE premium_import_values v
                     JOIN premium_import_units u ON u.id = v.import_unit_id
                     SET v.promotion_item_id = ?
                     WHERE u.batch_id = ? AND v.premium_label = ?',
                    [$itemId, $batchId, $label]
                );
            } else {
                $unresolved[] = $label;
            }
        }

        return ['map' => $map, 'resolved' => $resolved, 'unresolved' => $unresolved, 'created' => $created];
    }

    private function getBatchOrFail(int $batchId): array
    {
        $batch = $this->db->table('premium_import_batches')
            ->where('id', $batchId)
            ->get()->getRowArray();

        if (!$batch) {
            throw new RuntimeException('ไม่พบรายการ import นี้');
        }
        return $batch;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Excel parsing helpers
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ตรวจหาตำแหน่งหัวตาราง + คอลัมน์ของแถม จากโครงสร้างชีต
     *
     * @return array{
     *   project_code: ?string, header_row: int, data_start_row: int,
     *   seq_col: int, plot_col: int, land_col: int, model_col: int, price_col: int,
     *   premium_columns: array<array{column_index:int,label:string,category:string}>
     * }
     */
    private function detectLayout($sheet): array
    {
        $highestRow = min($sheet->getHighestDataRow(), self::HEADER_SCAN_LIMIT);
        $highestCol = Coordinate::columnIndexFromString($sheet->getHighestDataColumn());

        // หาแถวหัวตารางชั้นบน (แถวที่มีคำว่า "ลำดับ")
        $headerRow = 0;
        $cols      = ['seq' => 0, 'plot' => 0, 'land' => 0, 'model' => 0, 'price' => 0];

        for ($r = 1; $r <= $highestRow; $r++) {
            for ($c = 1; $c <= $highestCol; $c++) {
                if ($this->cellText($sheet, $c, $r) === 'ลำดับ') {
                    $headerRow = $r;
                    break 2;
                }
            }
        }
        if ($headerRow === 0) {
            throw new RuntimeException('ไม่พบหัวตาราง (ช่อง "ลำดับ") ในชีตนี้');
        }

        // จับคู่คอลัมน์หลักจากหัวตารางชั้นบน
        $labelMap = ['ลำดับ' => 'seq', 'เลขแปลง' => 'plot', 'เนื้อที่ดิน' => 'land', 'แบบบ้าน' => 'model', 'ราคา' => 'price'];
        for ($c = 1; $c <= $highestCol; $c++) {
            $key = $labelMap[$this->cellText($sheet, $c, $headerRow)] ?? null;
            if ($key !== null) {
                $cols[$key] = $c;
            }
        }
        foreach (['plot' => 'เลขแปลง', 'land' => 'เนื้อที่ดิน', 'model' => 'แบบบ้าน', 'price' => 'ราคา'] as $key => $thaiLabel) {
            if ($cols[$key] === 0) {
                throw new RuntimeException('ไม่พบคอลัมน์ "' . $thaiLabel . '" ในหัวตาราง');
            }
        }

        // คอลัมน์ของแถม = ช่องในหัวชั้นล่างที่อยู่ขวาของคอลัมน์ "ราคา" และไม่ใช่ "Bottom Line"
        $subHeaderRow    = $headerRow + 1;
        $premiumColumns  = [];
        for ($c = $cols['price'] + 1; $c <= $highestCol; $c++) {
            $label = $this->cellText($sheet, $c, $subHeaderRow);
            if ($label === '' || $label === 'Bottom Line') {
                continue;
            }
            $premiumColumns[] = [
                'column_index' => $c,
                'label'        => $label,
                'category'     => $this->classifyCategory($label),
            ];
        }

        return [
            'project_code'    => $this->detectProjectCode($sheet, $headerRow, $highestCol),
            'header_row'      => $headerRow,
            'data_start_row'  => $subHeaderRow + 1,
            'seq_col'         => $cols['seq'],
            'plot_col'        => $cols['plot'],
            'land_col'        => $cols['land'],
            'model_col'       => $cols['model'],
            'price_col'       => $cols['price'],
            'premium_columns' => $premiumColumns,
        ];
    }

    /**
     * อ่านรหัสโครงการจากช่องถัดจากคำว่า "โครงการ" (เหนือแถวหัวตาราง)
     */
    private function detectProjectCode($sheet, int $headerRow, int $highestCol): ?string
    {
        for ($r = 1; $r < $headerRow; $r++) {
            for ($c = 1; $c <= $highestCol; $c++) {
                if ($this->cellText($sheet, $c, $r) === 'โครงการ') {
                    $code = $this->cellText($sheet, $c + 1, $r);
                    return $code !== '' ? $code : null;
                }
            }
        }
        return null;
    }

    /**
     * อ่านข้อมูลทุกแปลง — ข้ามแถวที่ไม่มีเลขแปลง (แถวว่าง/แถวรวมยอด)
     *
     * @return array<array{
     *   raw_row_index:int, seq:?int, plot_no:string, land_area_sqw:?float,
     *   house_model_code:?string, bottom_line_price:?float, premiums:array
     * }>
     */
    private function extractRows($sheet, array $layout): array
    {
        $rows       = [];
        $highestRow = $sheet->getHighestDataRow();

        for ($r = $layout['data_start_row']; $r <= $highestRow; $r++) {
            $plotNo = $this->cellText($sheet, $layout['plot_col'], $r);
            if ($plotNo === '') {
                continue; // แถวว่างหรือแถวรวมยอด
            }

            $premiums = [];
            foreach ($layout['premium_columns'] as $pc) {
                $premiums[] = [
                    'column_index' => $pc['column_index'],
                    'label'        => $pc['label'],
                    'category'     => $pc['category'],
                    'amount'       => $this->cellNumber($sheet, $pc['column_index'], $r) ?? 0,
                ];
            }

            $seq   = $this->cellNumber($sheet, $layout['seq_col'], $r);
            $model = $this->cellText($sheet, $layout['model_col'], $r);

            $rows[] = [
                'raw_row_index'     => $r,
                'seq'               => $seq !== null ? (int) $seq : null,
                'plot_no'           => $plotNo,
                'land_area_sqw'     => $this->cellNumber($sheet, $layout['land_col'], $r),
                'house_model_code'  => $model !== '' ? $model : null,
                'bottom_line_price' => $this->cellNumber($sheet, $layout['price_col'], $r),
                'premiums'          => $premiums,
            ];
        }

        return $rows;
    }

    /**
     * จัดหมวดของแถมตามชื่อคอลัมน์ ให้ตรงกับ 3 หมวดของระบบ
     */
    private function classifyCategory(string $label): string
    {
        if (mb_strpos($label, 'คชจ') !== false
            || mb_strpos($label, 'ค่าใช้จ่าย') !== false
            || mb_strpos($label, 'ฟรี') !== false) {
            return 'expense_support';
        }
        if (mb_strpos($label, 'ลด') !== false) {
            return 'discount';
        }
        return 'premium';
    }

    private function findProjectByCode(string $code): ?array
    {
        $project = $this->db->table('projects')
            ->select('id, code, name')
            ->where('code', $code)
            ->get()
            ->getRowArray();

        return $project ?: null;
    }

    /** อ่านค่าช่องเป็นข้อความ (trim แล้ว) */
    private function cellText($sheet, int $colIndex, int $rowIndex): string
    {
        $coord = Coordinate::stringFromColumnIndex($colIndex) . $rowIndex;
        $value = $sheet->getCell($coord)->getValue();

        return $value === null ? '' : trim((string) $value);
    }

    /** อ่านค่าช่องเป็นตัวเลข — คืน null ถ้าว่างหรือไม่ใช่ตัวเลข */
    private function cellNumber($sheet, int $colIndex, int $rowIndex): ?float
    {
        $coord = Coordinate::stringFromColumnIndex($colIndex) . $rowIndex;
        $value = $sheet->getCell($coord)->getValue();

        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric($value)) {
            return null;
        }

        return (float) $value;
    }
}
