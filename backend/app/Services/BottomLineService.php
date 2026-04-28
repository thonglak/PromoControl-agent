<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use PhpOffice\PhpSpreadsheet\IOFactory;
use RuntimeException;

/**
 * BottomLineService — business logic สำหรับ Import ราคาต้นทุน
 *
 * กฎสำคัญ:
 * 1. ต้อง backup ก่อน import เสมอ
 * 2. สร้าง dynamic table ทุกครั้ง (snapshot ข้อมูลดิบ)
 * 3. Match ด้วย unit_code ภายใน project เดียวกัน
 * 4. อัปเดต: unit_cost, appraisal_price, bottom_line_key
 * 5. import_key generate จาก number_series (document_type: BOTTOM_LINE)
 * 6. Error messages เป็นภาษาไทย
 */
class BottomLineService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Upload & Parse Excel
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * อ่าน Excel file → return preview data + detected columns
     */
    public function parseUploadedFile(string $filePath, string $fileName, int $projectId, ?int $mappingId = null): array
    {
        $spreadsheet = IOFactory::load($filePath);
        $sheetNames  = $spreadsheet->getSheetNames();

        // โหลด mapping preset (ถ้ามี)
        $mapping = null;
        if ($mappingId) {
            $mapping = $this->loadMappingPreset($mappingId, $projectId);
        }

        // เลือก sheet
        $sheetName = $mapping['sheet_name'] ?? $sheetNames[0] ?? 'Sheet1';
        $sheet     = $spreadsheet->getSheetByName($sheetName);
        if (!$sheet) {
            $sheet     = $spreadsheet->getActiveSheet();
            $sheetName = $sheet->getTitle();
        }

        $headerRow    = (int) ($mapping['header_row'] ?? 1);
        $dataStartRow = (int) ($mapping['data_start_row'] ?? ($headerRow + 1));
        $highestRow   = $sheet->getHighestRow();
        $highestCol   = $sheet->getHighestColumn();
        $totalRows    = max(0, $highestRow - $dataStartRow + 1);

        // Detect columns — อ่าน sample data จากทุก column
        $detectedColumns = [];
        $col = 'A';
        while (true) {
            $samples = [];
            for ($r = $dataStartRow; $r < $dataStartRow + 5 && $r <= $highestRow; $r++) {
                $v = $sheet->getCell($col . $r)->getCalculatedValue();
                if ($v !== null && $v !== '') $samples[] = (string) $v;
            }
            $detectedColumns[$col] = implode(', ', $samples);
            if ($col === $highestCol) break;
            $col++;
        }

        // Preview 5 rows
        $previewRows = [];
        for ($r = $dataStartRow; $r < $dataStartRow + 5 && $r <= $highestRow; $r++) {
            $row = ['row' => $r];
            foreach (array_keys($detectedColumns) as $c) {
                $row[$c] = $sheet->getCell($c . $r)->getCalculatedValue();
            }
            $previewRows[] = $row;
        }

        $result = [
            'file_name'        => $fileName,
            'sheets'           => $sheetNames,
            'total_rows'       => $totalRows,
            'detected_columns' => $detectedColumns,
            'preview_rows'     => $previewRows,
            'mapping_used'     => null,
        ];

        if ($mapping) {
            $result['mapping_used'] = [
                'id'          => $mappingId,
                'preset_name' => $mapping['preset_name'],
            ];
        }

        return $result;
    }

    /**
     * Re-parse Excel ตาม mapping config ที่กำหนด
     * ใช้สำหรับ preview เมื่อเปลี่ยน header_row / data_start_row / column ใน Step 2
     */
    public function previewMapping(string $filePath, array $mappingConfig): array
    {
        $spreadsheet = IOFactory::load($filePath);

        $sheetName    = $mappingConfig["sheet_name"] ?? $spreadsheet->getActiveSheet()->getTitle();
        $sheet        = $spreadsheet->getSheetByName($sheetName) ?? $spreadsheet->getActiveSheet();
        $headerRow    = max(1, (int) ($mappingConfig["header_row"] ?? 1));
        $dataStartRow = max($headerRow + 1, (int) ($mappingConfig["data_start_row"] ?? ($headerRow + 1)));
        $highestRow   = $sheet->getHighestRow();
        $highestCol   = $sheet->getHighestColumn();
        $totalRows    = max(0, $highestRow - $dataStartRow + 1);

        $ucCol  = $mappingConfig["unit_code_column"] ?? "A";
        $blCol  = $mappingConfig["bottom_line_price_column"] ?? "B";
        $apCol  = $mappingConfig["appraisal_price_column"] ?? "C";
        $sbCol  = $mappingConfig["standard_budget_column"] ?? null;
        $bpCol  = $mappingConfig["base_price_column"] ?? null;

        // Detect columns
        $detectedColumns = [];
        $col = "A";
        while (true) {
            $samples = [];
            for ($r = $dataStartRow; $r < $dataStartRow + 5 && $r <= $highestRow; $r++) {
                $v = $sheet->getCell($col . $r)->getCalculatedValue();
                if ($v !== null && $v !== "") $samples[] = (string) $v;
            }
            $detectedColumns[$col] = implode(", ", $samples);
            if ($col === $highestCol) break;
            $col++;
        }

        // Preview 5 rows ตาม mapping
        $previewRows = [];
        for ($r = $dataStartRow; $r < $dataStartRow + 5 && $r <= $highestRow; $r++) {
            $row = [
                "row"                => $r,
                "unit_code"          => $sheet->getCell($ucCol . $r)->getCalculatedValue(),
                "bottom_line_price"  => (float) ($sheet->getCell($blCol . $r)->getCalculatedValue() ?? 0),
                "appraisal_price"    => (float) ($sheet->getCell($apCol . $r)->getCalculatedValue() ?? 0),
            ];
            if ($sbCol) {
                $row["standard_budget"] = (float) ($sheet->getCell($sbCol . $r)->getCalculatedValue() ?? 0);
            }
            if ($bpCol) {
                $row["base_price"] = (float) ($sheet->getCell($bpCol . $r)->getCalculatedValue() ?? 0);
            }
            $previewRows[] = $row;
        }

        return [
            "total_rows"       => $totalRows,
            "detected_columns" => $detectedColumns,
            "preview_rows"     => $previewRows,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Import (ยืนยัน import → backup → create table → update units)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ทำการ import ราคาต้นทุนจาก Excel → อัปเดต project_units
     *
     * ทุกขั้นตอนอยู่ใน database transaction — ถ้า error rollback ทั้งหมด
     */
    public function executeImport(
        string  $filePath,
        string  $fileName,
        int     $projectId,
        array   $mappingConfig,
        int     $userId,
        ?string $saveMappingAs = null,
        bool    $setAsDefault  = false,
        ?string $note = null
    ): array {
        // 1. Generate import_key จาก NumberSeries (document_type: BOTTOM_LINE)
        $importKey = $this->generateImportKey($projectId);
        $safeKey   = $this->sanitizeKey($importKey);

        // อ่าน Excel
        $spreadsheet = IOFactory::load($filePath);
        $sheetName   = $mappingConfig['sheet_name'] ?? $spreadsheet->getActiveSheet()->getTitle();
        $sheet       = $spreadsheet->getSheetByName($sheetName) ?? $spreadsheet->getActiveSheet();

        $headerRow    = (int) ($mappingConfig['header_row'] ?? 1);
        $dataStartRow = (int) ($mappingConfig['data_start_row'] ?? ($headerRow + 1));
        $highestRow   = $sheet->getHighestRow();

        $unitCodeCol        = $mappingConfig['unit_code_column'] ?? 'A';
        $bottomLinePriceCol = $mappingConfig['bottom_line_price_column'] ?? 'B';
        $appraisalPriceCol  = $mappingConfig['appraisal_price_column'] ?? 'C';
        $stdBudgetCol       = $mappingConfig['standard_budget_column'] ?? null;
        $basePriceCol       = $mappingConfig['base_price_column'] ?? null;

        // โหลด unit codes ของ project
        $existingUnits = $this->db->table('project_units')
            ->select('id, unit_code, unit_cost, appraisal_price, standard_budget, base_price')
            ->where('project_id', $projectId)
            ->get()->getResultArray();

        $unitMap = [];
        foreach ($existingUnits as $u) {
            $unitMap[strtoupper(trim($u['unit_code']))] = $u;
        }

        // Parse Excel rows
        $rows      = [];
        $matched   = 0;
        $unmatched = 0;

        for ($r = $dataStartRow; $r <= $highestRow; $r++) {
            $unitCode        = trim((string) ($sheet->getCell($unitCodeCol . $r)->getCalculatedValue() ?? ''));
            $bottomLinePrice = (float) ($sheet->getCell($bottomLinePriceCol . $r)->getCalculatedValue() ?? 0);
            $appraisalPrice  = (float) ($sheet->getCell($appraisalPriceCol . $r)->getCalculatedValue() ?? 0);
            $standardBudget  = $stdBudgetCol ? (float) ($sheet->getCell($stdBudgetCol . $r)->getCalculatedValue() ?? 0) : null;
            $basePrice       = $basePriceCol ? (float) ($sheet->getCell($basePriceCol . $r)->getCalculatedValue() ?? 0) : null;

            if ($unitCode === '') continue;

            $key      = strtoupper($unitCode);
            $existing = $unitMap[$key] ?? null;

            if ($existing) {
                $matched++;
                $status = 'matched';
            } else {
                $unmatched++;
                $status = 'unmatched';
            }

            $row = [
                'row_number'          => $r,
                'unit_code'           => $unitCode,
                'bottom_line_price'   => $bottomLinePrice,
                'appraisal_price'     => $appraisalPrice,
                'matched_unit_id'     => $existing['id'] ?? null,
                'old_unit_cost'       => $existing['unit_cost'] ?? null,
                'old_appraisal'       => $existing['appraisal_price'] ?? null,
                'status'              => $status,
            ];

            if ($standardBudget !== null) {
                $row['standard_budget']     = $standardBudget;
                $row['old_standard_budget'] = $existing['standard_budget'] ?? null;
            }
            if ($basePrice !== null) {
                $row['base_price']     = $basePrice;
                $row['old_base_price'] = $existing['base_price'] ?? null;
            }

            $rows[] = $row;
        }

        $totalRows = count($rows);
        $updated   = 0;

        // ── Database Transaction ───────────────────────────────────────

        $backupTableName = "project_units_backup_{$safeKey}";
        $dynamicTable    = "bottom_line_{$safeKey}";

        $this->db->transBegin();

        try {
            // 2. Backup project_units
            $this->db->query(
                "CREATE TABLE `{$backupTableName}` AS SELECT * FROM `project_units` WHERE `project_id` = ?",
                [$projectId]
            );

            // 3. สร้าง dynamic table
            $extraCols = '';
            if ($stdBudgetCol) {
                $extraCols .= "`standard_budget` DECIMAL(15,2) NULL, `old_standard_budget` DECIMAL(15,2) NULL,";
            }
            if ($basePriceCol) {
                $extraCols .= "`base_price` DECIMAL(15,2) NULL, `old_base_price` DECIMAL(15,2) NULL,";
            }

            $this->db->query("
                CREATE TABLE `{$dynamicTable}` (
                    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    `row_number` INT NOT NULL,
                    `unit_code` VARCHAR(50) NOT NULL,
                    `bottom_line_price` DECIMAL(15,2) NOT NULL DEFAULT 0,
                    `appraisal_price` DECIMAL(15,2) NOT NULL DEFAULT 0,
                    {$extraCols}
                    `matched_unit_id` BIGINT UNSIGNED NULL,
                    `old_unit_cost` DECIMAL(15,2) NULL,
                    `old_appraisal` DECIMAL(15,2) NULL,
                    `status` ENUM('matched','unmatched','updated','skipped') NOT NULL DEFAULT 'unmatched'
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            // 4. Insert ทุก row เข้า dynamic table
            foreach ($rows as $row) {
                $this->db->table($dynamicTable)->insert($row);
            }

            // 5. อัปเดต project_units (เฉพาะ matched rows)
            foreach ($rows as $row) {
                if ($row['status'] !== 'matched' || !$row['matched_unit_id']) continue;

                $updateData = [
                    'unit_cost'       => $row['bottom_line_price'],
                    'appraisal_price' => $row['appraisal_price'],
                    'bottom_line_key' => $importKey,
                ];
                if (isset($row['standard_budget'])) {
                    $updateData['standard_budget'] = $row['standard_budget'];
                }
                if (isset($row['base_price'])) {
                    $updateData['base_price'] = $row['base_price'];
                }

                $this->db->table('project_units')
                    ->where('id', $row['matched_unit_id'])
                    ->update($updateData);

                $this->db->table($dynamicTable)
                    ->where('matched_unit_id', $row['matched_unit_id'])
                    ->update(['status' => 'updated']);

                $updated++;
            }

            // 6. บันทึก mapping preset (ถ้าร้องขอ)
            $mappingPresetId = null;
            if ($saveMappingAs) {
                $mappingPresetId = $this->saveMappingPreset(
                    $projectId, $saveMappingAs, $mappingConfig, $userId, $setAsDefault
                );
            }

            // 7. บันทึกประวัติ import
            $this->db->table('bottom_lines')->insert([
                'import_key'        => $importKey,
                'project_id'        => $projectId,
                'file_name'         => $fileName,
                'total_rows'        => $totalRows,
                'matched_rows'      => $matched,
                'unmatched_rows'    => $unmatched,
                'updated_rows'      => $updated,
                'backup_table_name' => $backupTableName,
                'mapping_preset_id' => $mappingPresetId,
                'status'            => 'completed',
                'note'              => $note,
                'imported_by'       => $userId,
                'imported_at'       => date('Y-m-d H:i:s'),
            ]);

            $this->db->transCommit();

        } catch (\Throwable $e) {
            $this->db->transRollback();

            // ลบ tables ที่อาจสร้างไว้ก่อน rollback
            $this->db->query("DROP TABLE IF EXISTS `{$backupTableName}`");
            $this->db->query("DROP TABLE IF EXISTS `{$dynamicTable}`");

            // บันทึก failed record
            $this->db->table('bottom_lines')->insert([
                'import_key'     => $importKey,
                'project_id'     => $projectId,
                'file_name'      => $fileName,
                'total_rows'     => $totalRows,
                'matched_rows'   => $matched,
                'unmatched_rows' => $unmatched,
                'updated_rows'   => 0,
                'status'         => 'failed',
                'note'           => $e->getMessage(),
                'imported_by'    => $userId,
                'imported_at'    => date('Y-m-d H:i:s'),
            ]);

            throw new RuntimeException('Import ไม่สำเร็จ: ' . $e->getMessage());
        }

        return [
            'import_key'     => $importKey,
            'status'         => 'completed',
            'total_rows'     => $totalRows,
            'matched_rows'   => $matched,
            'unmatched_rows' => $unmatched,
            'updated_rows'   => $updated,
            'backup_table'   => $backupTableName,
            'dynamic_table'  => $dynamicTable,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // History (paginated)
    // ═══════════════════════════════════════════════════════════════════════

    public function getHistory(int $projectId, array $filters = []): array
    {
        $page    = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 20)));
        $offset  = ($page - 1) * $perPage;

        $builder = $this->db->table('bottom_lines bl')
            ->select('bl.*, u.name AS imported_by_name')
            ->join('users u', 'u.id = bl.imported_by', 'left')
            ->where('bl.project_id', $projectId);

        if (!empty($filters['status'])) {
            $builder->where('bl.status', $filters['status']);
        }
        if (!empty($filters['date_from'])) {
            $builder->where('bl.imported_at >=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $builder->where('bl.imported_at <=', $filters['date_to'] . ' 23:59:59');
        }

        // Count total
        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults(false);

        // Fetch page
        $data = $builder
            ->orderBy('bl.imported_at', 'DESC')
            ->limit($perPage, $offset)
            ->get()->getResultArray();

        return [
            'items'    => $data,
            'total'    => $total,
            'page'     => $page,
            'per_page' => $perPage,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Show Detail
    // ═══════════════════════════════════════════════════════════════════════

    public function getImportDetail(string $importKey): ?array
    {
        $record = $this->db->table('bottom_lines bl')
            ->select('bl.*, u.name AS imported_by_name')
            ->join('users u', 'u.id = bl.imported_by', 'left')
            ->where('bl.import_key', $importKey)
            ->get()->getRowArray();

        if (!$record) return null;

        // อ่าน dynamic table (ถ้ามี)
        $safeKey      = $this->sanitizeKey($importKey);
        $dynamicTable = "bottom_line_{$safeKey}";
        $rows         = [];

        try {
            if ($this->db->tableExists($dynamicTable)) {
                $rows = $this->db->table($dynamicTable)
                    ->orderBy('row_number', 'ASC')
                    ->get()->getResultArray();
            }
        } catch (\Throwable $e) {
            // table อาจไม่มี (กรณี failed import)
        }

        $record['rows'] = $rows;
        return $record;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Rollback
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Rollback: restore project_units จาก backup table
     * ใช้ UPDATE JOIN เพื่อคืน unit_cost, appraisal_price, bottom_line_key
     * ไม่ DELETE+INSERT เพราะมี FK references
     */
    public function rollback(string $importKey): array
    {
        $record = $this->db->table('bottom_lines')
            ->where('import_key', $importKey)
            ->get()->getRowArray();

        if (!$record) {
            throw new RuntimeException('ไม่พบประวัติ import นี้');
        }
        if ($record['status'] === 'rolled_back') {
            throw new RuntimeException('รายการนี้ถูก Rollback ไปแล้ว');
        }
        if ($record['status'] !== 'completed') {
            throw new RuntimeException('ไม่สามารถ Rollback รายการที่ไม่สำเร็จได้');
        }

        $backupTable = $record['backup_table_name'];
        $projectId   = (int) $record['project_id'];

        if (!$backupTable || !$this->db->tableExists($backupTable)) {
            throw new RuntimeException('ไม่พบข้อมูล backup');
        }

        $this->db->transBegin();

        try {
            // UPDATE JOIN: คืนค่า unit_cost, appraisal_price, standard_budget, base_price, bottom_line_key จาก backup
            $restoredRows = $this->db->query("
                UPDATE `project_units` pu
                JOIN `{$backupTable}` bt ON pu.id = bt.id
                SET pu.unit_cost        = bt.unit_cost,
                    pu.appraisal_price  = bt.appraisal_price,
                    pu.standard_budget  = bt.standard_budget,
                    pu.base_price       = bt.base_price,
                    pu.bottom_line_key  = bt.bottom_line_key
                WHERE pu.project_id = ?
            ", [$projectId]);

            $affectedRows = $this->db->affectedRows();

            // อัปเดตสถานะเป็น rolled_back
            $this->db->table('bottom_lines')
                ->where('import_key', $importKey)
                ->update(['status' => 'rolled_back']);

            $this->db->transCommit();

        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('Rollback ไม่สำเร็จ: ' . $e->getMessage());
        }

        return [
            'import_key'    => $importKey,
            'status'        => 'rolled_back',
            'message'       => 'Rollback สำเร็จ คืนค่ายูนิตเรียบร้อย',
            'restored_rows' => $affectedRows,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private helpers
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Generate import_key จาก number_series (document_type: BOTTOM_LINE)
     * ตัวอย่าง: BL-2569-0001
     */
    private function generateImportKey(int $projectId): string
    {
        $series = $this->db->table('number_series')
            ->where('project_id', $projectId)
            ->where('document_type', 'BOTTOM_LINE')
            ->where('is_active', 1)
            ->get()->getRowArray();

        if (!$series) {
            throw new RuntimeException('ไม่พบการตั้งค่าเลขที่เอกสาร BOTTOM_LINE สำหรับโครงการนี้');
        }

        // ตรวจ reset cycle
        $nextNumber    = (int) $series['next_number'];
        $lastResetDate = $series['last_reset_date'];
        $today         = date('Y-m-d');

        if ($series['reset_cycle'] === 'YEARLY') {
            $lastYear = $lastResetDate ? date('Y', strtotime($lastResetDate)) : null;
            if ($lastYear !== date('Y')) {
                $nextNumber = 1;
            }
        } elseif ($series['reset_cycle'] === 'MONTHLY') {
            $lastMonth = $lastResetDate ? date('Y-m', strtotime($lastResetDate)) : null;
            if ($lastMonth !== date('Y-m')) {
                $nextNumber = 1;
            }
        }

        // สร้าง year part
        $yearPart = '';
        switch ($series['year_format']) {
            case 'YYYY_BE':
                $yearPart = (string) ((int) date('Y') + 543);
                break;
            case 'YYYY_AD':
                $yearPart = date('Y');
                break;
            case 'YY_BE':
                $yearPart = substr((string) ((int) date('Y') + 543), -2);
                break;
            case 'YY_AD':
                $yearPart = date('y');
                break;
            case 'NONE':
                $yearPart = '';
                break;
        }

        // ประกอบ key: prefix + separator + yearPart + yearSeparator + running
        $running = str_pad((string) $nextNumber, (int) $series['running_digits'], '0', STR_PAD_LEFT);

        $parts = [$series['prefix']];
        if ($yearPart !== '') {
            $parts[] = $yearPart;
        }
        $parts[] = $running;

        $key = implode($series['separator'], $parts);

        // อัปเดต next_number + last_reset_date
        $this->db->table('number_series')
            ->where('id', $series['id'])
            ->update([
                'next_number'     => $nextNumber + 1,
                'last_reset_date' => $today,
                'updated_at'      => date('Y-m-d H:i:s'),
            ]);

        return $key;
    }

    /**
     * Sanitize key สำหรับใช้เป็น table name (ลบ - เปลี่ยนเป็น _)
     */
    private function sanitizeKey(string $key): string
    {
        return preg_replace('/[^a-zA-Z0-9_]/', '_', $key);
    }

    /**
     * โหลด mapping preset
     */
    private function loadMappingPreset(int $mappingId, int $projectId): ?array
    {
        $preset = $this->db->table('bottom_line_mappings')
            ->where('id', $mappingId)
            ->where('project_id', $projectId)
            ->get()->getRowArray();

        if (!$preset) return null;

        $config = json_decode($preset['mapping_config'] ?? '{}', true) ?: [];
        $config['preset_name'] = $preset['preset_name'];

        return $config;
    }

    /**
     * บันทึก mapping preset ใหม่
     */
    private function saveMappingPreset(int $projectId, string $presetName, array $mappingConfig, int $userId, bool $setAsDefault = false): int
    {
        $now = date('Y-m-d H:i:s');

        // ถ้า set_as_default → clear default อื่นใน project
        if ($setAsDefault) {
            $this->db->table('bottom_line_mappings')
                ->where('project_id', $projectId)
                ->update(['is_default' => 0]);
        }

        $this->db->table('bottom_line_mappings')->insert([
            'project_id'     => $projectId,
            'preset_name'    => $presetName,
            'mapping_config' => json_encode($mappingConfig, JSON_UNESCAPED_UNICODE),
            'is_default'     => $setAsDefault ? 1 : 0,
            'created_by'     => $userId,
            'created_at'     => $now,
            'updated_at'     => $now,
        ]);

        return $this->db->insertID();
    }
}
