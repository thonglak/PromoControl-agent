<?php

declare(strict_types=1);

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use PhpOffice\PhpSpreadsheet\IOFactory;
use RuntimeException;

/**
 * ImportConfigService — business logic สำหรับการตั้งค่า Import แบบ generic
 *
 * กฎสำคัญ:
 * 1. config_name ต้อง unique ภายใน project เดียวกัน
 * 2. set-default ต้องยกเลิก default เดิมของ project+import_type ก่อน
 * 3. preview คำนวณ column_totals เฉพาะ data_type = 'number' หรือ 'decimal'
 * 4. cascade delete columns เมื่อลบ config (FK CASCADE)
 */
class ImportConfigService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // List configs ของ project (กรอง import_type ถ้าระบุ)
    // ═══════════════════════════════════════════════════════════════════════

    public function list(int $projectId, ?string $importType = null): array
    {
        $builder = $this->db->table('import_configs ic')
            ->select('ic.id, ic.project_id, ic.config_name, ic.import_type, ic.target_table, ic.file_type, ic.sheet_name, ic.header_row, ic.data_start_row, ic.is_default, ic.created_at, ic.updated_at, u.name AS created_by_name')
            ->join('users u', 'u.id = ic.created_by', 'left')
            ->where('ic.project_id', $projectId)
            ->orderBy('ic.is_default', 'DESC')
            ->orderBy('ic.config_name', 'ASC');

        if ($importType !== null) {
            $builder->where('ic.import_type', $importType);
        }

        $rows = $builder->get()->getResultArray();

        foreach ($rows as &$row) {
            $row['is_default'] = (bool) $row['is_default'];
        }

        return $rows;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ดึง config เดียว พร้อม columns
    // ═══════════════════════════════════════════════════════════════════════

    public function getById(int $id): ?array
    {
        $config = $this->db->table('import_configs ic')
            ->select('ic.*, u.name AS created_by_name')
            ->join('users u', 'u.id = ic.created_by', 'left')
            ->where('ic.id', $id)
            ->get()->getRowArray();

        if (!$config) {
            return null;
        }

        $config['is_default'] = (bool) $config['is_default'];
        $config['columns']    = $this->getColumns($id);

        return $config;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // สร้าง config ใหม่ พร้อม columns (transaction)
    // ═══════════════════════════════════════════════════════════════════════

    public function create(array $data): int
    {
        $projectId  = (int) $data['project_id'];
        $configName = trim((string) ($data['config_name'] ?? ''));

        // ตรวจ unique config_name ภายใน project
        $this->assertUniqueConfigName($projectId, $configName);

        $isDefault = !empty($data['is_default']);
        $now       = date('Y-m-d H:i:s');

        $this->db->transBegin();

        try {
            // ถ้า is_default → ยกเลิก default เดิมของ project+import_type นั้น
            if ($isDefault) {
                $this->clearDefault($projectId, (string) $data['import_type']);
            }

            $this->db->table('import_configs')->insert([
                'project_id'     => $projectId,
                'config_name'    => $configName,
                'import_type'    => $data['import_type'],
                'target_table'   => $data['target_table'] ?? '',
                'file_type'      => $data['file_type'] ?? 'xlsx',
                'sheet_name'     => $data['sheet_name'] ?? null,
                'header_row'     => (int) ($data['header_row'] ?? 1),
                'data_start_row' => (int) ($data['data_start_row'] ?? 2),
                'is_default'     => $isDefault ? 1 : 0,
                'created_by'     => (int) ($data['created_by'] ?? 0),
                'created_at'     => $now,
                'updated_at'     => $now,
            ]);

            $configId = $this->db->insertID();

            // Insert columns
            if (!empty($data['columns']) && is_array($data['columns'])) {
                $this->insertColumns($configId, $data['columns'], $now);
            }

            $this->db->transCommit();

        } catch (\Throwable $e) {
            $this->db->transRollback();
            log_message('error', '[ImportConfigService::create] ' . $e->getMessage());
            throw new RuntimeException('สร้าง config ไม่สำเร็จ');
        }

        return (int) $configId;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // แก้ไข config + columns (transaction)
    // ═══════════════════════════════════════════════════════════════════════

    public function update(int $id, array $data): bool
    {
        $existing = $this->db->table('import_configs')->where('id', $id)->get()->getRowArray();
        if (!$existing) {
            return false;
        }

        $projectId  = (int) $existing['project_id'];
        $configName = trim((string) ($data['config_name'] ?? ''));

        // ตรวจ unique config_name — ยกเว้น record ตัวเอง
        $this->assertUniqueConfigName($projectId, $configName, $id);

        $isDefault  = !empty($data['is_default']);
        $importType = (string) ($data['import_type'] ?? $existing['import_type']);

        $this->db->transBegin();

        try {
            if ($isDefault) {
                $this->clearDefault($projectId, $importType, $id);
            }

            $this->db->table('import_configs')->where('id', $id)->update([
                'config_name'    => $configName,
                'import_type'    => $importType,
                'target_table'   => $data['target_table'] ?? $existing['target_table'],
                'file_type'      => $data['file_type'] ?? $existing['file_type'],
                'sheet_name'     => $data['sheet_name'] ?? $existing['sheet_name'],
                'header_row'     => (int) ($data['header_row'] ?? $existing['header_row']),
                'data_start_row' => (int) ($data['data_start_row'] ?? $existing['data_start_row']),
                'is_default'     => $isDefault ? 1 : 0,
                'updated_at'     => date('Y-m-d H:i:s'),
            ]);

            // ลบ columns เดิม แล้ว insert ใหม่
            if (isset($data['columns']) && is_array($data['columns'])) {
                $this->db->table('import_config_columns')
                    ->where('import_config_id', $id)
                    ->delete();

                $this->insertColumns($id, $data['columns'], date('Y-m-d H:i:s'));
            }

            $this->db->transCommit();

        } catch (\Throwable $e) {
            $this->db->transRollback();
            log_message('error', '[ImportConfigService::update] ' . $e->getMessage());
            throw new RuntimeException('แก้ไข config ไม่สำเร็จ');
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ลบ config (columns cascade ด้วย FK)
    // ═══════════════════════════════════════════════════════════════════════

    public function delete(int $id): bool
    {
        $existing = $this->db->table('import_configs')->where('id', $id)->get()->getRowArray();
        if (!$existing) {
            return false;
        }

        $this->db->table('import_configs')->where('id', $id)->delete();
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ตั้งเป็น default — ยกเลิก default เดิมก่อน
    // ═══════════════════════════════════════════════════════════════════════

    public function setDefault(int $id): bool
    {
        $existing = $this->db->table('import_configs')->where('id', $id)->get()->getRowArray();
        if (!$existing) {
            return false;
        }

        $projectId  = (int) $existing['project_id'];
        $importType = (string) $existing['import_type'];

        $this->db->transBegin();

        try {
            // ยกเลิก default เดิมของ project+import_type นั้น (ยกเว้นตัวเอง)
            $this->clearDefault($projectId, $importType, $id);

            $this->db->table('import_configs')->where('id', $id)->update([
                'is_default' => 1,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);

            $this->db->transCommit();

        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('ตั้งค่า default ไม่สำเร็จ: ' . $e->getMessage());
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Preview — อ่าน Excel + apply column mapping → return structured data
    // ═══════════════════════════════════════════════════════════════════════

    public function preview(array $file, ?int $configId, int $projectId): array
    {
        $filePath = $file['tmp_name'] ?? '';
        $fileName = $file['name'] ?? 'unknown';

        if (!$filePath || !file_exists($filePath)) {
            throw new RuntimeException('ไม่พบไฟล์ที่อัปโหลด');
        }

        $spreadsheet = IOFactory::load($filePath);
        $sheetNames  = $spreadsheet->getSheetNames();

        // โหลด config (ถ้ามี config_id)
        $config  = null;
        $columns = [];

        if ($configId) {
            $config = $this->db->table('import_configs')
                ->where('id', $configId)
                ->where('project_id', $projectId)
                ->get()->getRowArray();

            if ($config) {
                $columns = $this->getColumns($configId);
            }
        }

        // เลือก sheet
        $sheetName = $config['sheet_name'] ?? $sheetNames[0] ?? 'Sheet1';
        $sheet     = $spreadsheet->getSheetByName($sheetName);
        if (!$sheet) {
            $sheet     = $spreadsheet->getActiveSheet();
            $sheetName = $sheet->getTitle();
        }

        $headerRow    = (int) ($config['header_row'] ?? 1);
        $dataStartRow = (int) ($config['data_start_row'] ?? ($headerRow + 1));
        $highestRow   = $sheet->getHighestRow();
        $highestCol   = $sheet->getHighestColumn();
        $totalRows    = max(0, $highestRow - $dataStartRow + 1);

        // Detect columns พร้อม header และ samples
        $detectedColumns = [];
        $col = 'A';
        while (true) {
            $header  = (string) ($sheet->getCell($col . $headerRow)->getCalculatedValue() ?? '');
            $samples = [];
            for ($r = $dataStartRow; $r < $dataStartRow + 3 && $r <= $highestRow; $r++) {
                $v = $sheet->getCell($col . $r)->getCalculatedValue();
                if ($v !== null && $v !== '') {
                    $samples[] = $v;
                }
            }
            $detectedColumns[$col] = [
                'header'  => $header,
                'samples' => $samples,
            ];
            if ($col === $highestCol) break;
            $col++;
        }

        // สร้าง column map: target_field → source_column + data_type
        $fieldMap = [];
        foreach ($columns as $colCfg) {
            $fieldMap[$colCfg['target_field']] = [
                'source' => strtoupper($colCfg['source_column']),
                'type'   => $colCfg['data_type'],
            ];
        }

        // Preview 5 แถวแรก
        $previewRows = [];
        for ($r = $dataStartRow; $r < $dataStartRow + 5 && $r <= $highestRow; $r++) {
            if ($fieldMap) {
                // ใช้ mapping ที่กำหนด
                $row = ['row_number' => $r];
                foreach ($fieldMap as $field => $cfg) {
                    $raw       = $sheet->getCell($cfg['source'] . $r)->getCalculatedValue();
                    $row[$field] = $this->castValue($raw, $cfg['type']);
                }
            } else {
                // ไม่มี mapping — ใช้ column letter เป็น key
                $row = ['row_number' => $r];
                foreach (array_keys($detectedColumns) as $c) {
                    $row[$c] = $sheet->getCell($c . $r)->getCalculatedValue();
                }
            }
            $previewRows[] = $row;
        }

        // คำนวณ column_totals เฉพาะ number/decimal (จากทุกแถว)
        $columnTotals = [];
        foreach ($columns as $colCfg) {
            if (!in_array($colCfg['data_type'], ['number', 'decimal'], true)) {
                continue;
            }
            $field  = $colCfg['target_field'];
            $src    = strtoupper($colCfg['source_column']);
            $sum    = 0.0;
            $count  = 0;
            $min    = null;
            $max    = null;

            for ($r = $dataStartRow; $r <= $highestRow; $r++) {
                $raw = $sheet->getCell($src . $r)->getCalculatedValue();
                if ($raw === null || $raw === '') continue;
                $val = (float) $raw;
                $sum += $val;
                $count++;
                if ($min === null || $val < $min) $min = $val;
                if ($max === null || $val > $max) $max = $val;
            }

            if ($count > 0) {
                $columnTotals[$field] = [
                    'sum'   => $sum,
                    'count' => $count,
                    'min'   => $min,
                    'max'   => $max,
                ];
            }
        }

        return [
            'file_info' => [
                'file_name'  => $fileName,
                'sheets'     => $sheetNames,
                'total_rows' => $totalRows,
            ],
            'detected_columns' => $detectedColumns,
            'preview_rows'     => $previewRows,
            'column_totals'    => $columnTotals,
            'mapping_used'     => $config ? ['id' => (int) $config['id'], 'config_name' => $config['config_name']] : null,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private helpers
    // ═══════════════════════════════════════════════════════════════════════

    private function getColumns(int $configId): array
    {
        return $this->db->table('import_config_columns')
            ->where('import_config_id', $configId)
            ->orderBy('sort_order', 'ASC')
            ->get()->getResultArray();
    }

    private function insertColumns(int $configId, array $columns, string $now): void
    {
        if (empty($columns)) return;

        $batch = [];
        foreach ($columns as $i => $col) {
            $batch[] = [
                'import_config_id' => $configId,
                'source_column'    => strtoupper(trim((string) ($col['source_column'] ?? ''))),
                'target_field'     => trim((string) ($col['target_field'] ?? '')),
                'field_label'      => trim((string) ($col['field_label'] ?? '')),
                'data_type'        => $col['data_type'] ?? 'string',
                'is_required'      => !empty($col['is_required']) ? 1 : 0,
                'is_key_field'     => !empty($col['is_key_field']) ? 1 : 0,
                'sort_order'       => (int) ($col['sort_order'] ?? $i),
                'created_at'       => $now,
            ];
        }
        $this->db->table('import_config_columns')->insertBatch($batch);
    }

    /**
     * ยกเลิก default เดิมของ project+import_type นั้น
     * ถ้าระบุ $exceptId จะยกเว้น record นั้น
     */
    private function clearDefault(int $projectId, string $importType, ?int $exceptId = null): void
    {
        $builder = $this->db->table('import_configs')
            ->where('project_id', $projectId)
            ->where('import_type', $importType)
            ->where('is_default', 1);

        if ($exceptId !== null) {
            $builder->where('id !=', $exceptId);
        }

        $builder->update(['is_default' => 0]);
    }

    /**
     * ตรวจ config_name unique ภายใน project (ยกเว้น $exceptId ถ้าระบุ)
     */
    private function assertUniqueConfigName(int $projectId, string $configName, ?int $exceptId = null): void
    {
        $builder = $this->db->table('import_configs')
            ->where('project_id', $projectId)
            ->where('config_name', $configName);

        if ($exceptId !== null) {
            $builder->where('id !=', $exceptId);
        }

        if ($builder->countAllResults() > 0) {
            throw new RuntimeException("ชื่อ config '{$configName}' มีอยู่แล้วในโครงการนี้");
        }
    }

    /**
     * แปลงค่าตาม data_type
     */
    private function castValue(mixed $value, string $dataType): mixed
    {
        if ($value === null || $value === '') return null;

        return match ($dataType) {
            'number'  => (int) $value,
            'decimal' => (float) $value,
            'date'    => is_numeric($value)
                ? date('Y-m-d', \PhpOffice\PhpSpreadsheet\Shared\Date::excelToTimestamp((float) $value))
                : (string) $value,
            default   => (string) $value,
        };
    }
}
