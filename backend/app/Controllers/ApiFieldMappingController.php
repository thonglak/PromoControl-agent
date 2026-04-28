<?php

namespace App\Controllers;

use App\Models\ApiFieldMappingPresetModel;
use App\Models\ApiFieldMappingColumnModel;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * ApiFieldMappingController — จับคู่ field จาก API snapshot กับ project_units
 *
 * เฉพาะ admin และ manager เท่านั้น (filter อยู่ใน Routes.php)
 */
class ApiFieldMappingController extends BaseController
{
    private ApiFieldMappingPresetModel $presetModel;
    private ApiFieldMappingColumnModel $columnModel;

    public function __construct()
    {
        $this->presetModel = new ApiFieldMappingPresetModel();
        $this->columnModel = new ApiFieldMappingColumnModel();
    }

    private function userId(): int
    {
        return (int) ($this->request->user_id ?? 0);
    }

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) return true;
        return in_array($projectId, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    /**
     * แนบ columns เข้าไปใน preset array
     */
    private function attachColumns(array $preset): array
    {
        $preset['columns'] = $this->columnModel->getByPreset((int) $preset['id']);
        return $preset;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/api-field-mappings?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * รายการ presets ของโครงการ พร้อม columns count
     */
    public function index(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (! $this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $db = \Config\Database::connect();

        $rows = $db->table('api_field_mapping_presets p')
            ->select('p.*, COUNT(c.id) AS columns_count')
            ->join('api_field_mapping_columns c', 'c.preset_id = p.id', 'left')
            ->where('p.project_id', $projectId)
            ->groupBy('p.id')
            ->orderBy('p.created_at', 'DESC')
            ->get()->getResultArray();

        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $rows]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/api-field-mappings/{id}
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * preset detail พร้อม columns ทั้งหมด
     */
    public function show(int $id): ResponseInterface
    {
        $preset = $this->presetModel->find($id);
        if (! $preset) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ mapping preset นี้']);
        }
        if (! $this->canAccessProject((int) $preset['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $this->attachColumns($preset)]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/api-field-mappings
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * สร้าง preset ใหม่พร้อม columns
     * Body: { project_id, name, is_default?, columns: [...] }
     */
    public function create(): ResponseInterface
    {
        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);
        $name      = trim($body['name'] ?? '');

        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if ($name === '') {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุชื่อ preset']);
        }
        if (! $this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $isDefault      = isset($body['is_default']) ? (bool) $body['is_default'] : false;
        $columns        = is_array($body['columns'] ?? null) ? $body['columns'] : [];
        $targetTable    = trim($body['target_table'] ?? 'project_units');
        $upsertKey      = trim($body['upsert_key'] ?? 'unit_code');
        $projectIdMode  = trim($body['project_id_mode'] ?? 'from_snapshot');
        $projectIdField = isset($body['project_id_field']) ? trim($body['project_id_field']) : null;

        $db = \Config\Database::connect();
        $db->transStart();

        // ถ้าตั้งเป็น default → ยกเลิก default เดิมของโครงการ
        if ($isDefault) {
            $this->presetModel->clearDefault($projectId);
        }

        $presetId = $this->presetModel->insert([
            'project_id'      => $projectId,
            'name'            => $name,
            'target_table'    => $targetTable,
            'upsert_key'      => $upsertKey,
            'project_id_mode'  => $projectIdMode,
            'project_id_field' => $projectIdField,
            'is_default'      => $isDefault ? 1 : 0,
            'created_by'      => $this->userId(),
        ]);

        $this->insertColumns((int) $presetId, $columns);

        $db->transComplete();

        if (! $db->transStatus()) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง']);
        }

        $preset = $this->presetModel->find($presetId);
        return $this->response->setStatusCode(201)
            ->setJSON(['data' => $this->attachColumns($preset)]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/api-field-mappings/{id}
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * แก้ไข preset พร้อม columns
     * ลบ columns เดิมทั้งหมดแล้ว insert ใหม่
     */
    public function update(int $id): ResponseInterface
    {
        $preset = $this->presetModel->find($id);
        if (! $preset) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ mapping preset นี้']);
        }
        if (! $this->canAccessProject((int) $preset['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $body    = $this->request->getJSON(true) ?? [];
        $columns = is_array($body['columns'] ?? null) ? $body['columns'] : [];

        $updateData = [];

        if (isset($body['name'])) {
            $name = trim($body['name']);
            if ($name === '') {
                return $this->response->setStatusCode(400)
                    ->setJSON(['error' => 'ชื่อ preset ต้องไม่ว่าง']);
            }
            $updateData['name'] = $name;
        }

        if (isset($body['is_default'])) {
            $updateData['is_default'] = (bool) $body['is_default'] ? 1 : 0;
        }

        if (isset($body['target_table'])) {
            $updateData['target_table'] = trim($body['target_table']);
        }

        if (isset($body['upsert_key'])) {
            $updateData['upsert_key'] = trim($body['upsert_key']);
        }

        if (isset($body['project_id_mode'])) {
            $updateData['project_id_mode'] = trim($body['project_id_mode']);
        }
        if (array_key_exists('project_id_field', $body)) {
            $updateData['project_id_field'] = isset($body['project_id_field']) ? trim($body['project_id_field']) : null;
        }

        $db = \Config\Database::connect();
        $db->transStart();

        // ถ้าตั้งเป็น default → ยกเลิก default เดิมของโครงการ (ยกเว้น preset นี้)
        if (!empty($updateData['is_default'])) {
            $this->presetModel->clearDefault((int) $preset['project_id'], $id);
        }

        if (! empty($updateData)) {
            $this->presetModel->update($id, $updateData);
        }

        // ลบ columns เดิมทั้งหมดแล้ว insert ใหม่
        $this->columnModel->deleteByPreset($id);
        $this->insertColumns($id, $columns);

        $db->transComplete();

        if (! $db->transStatus()) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง']);
        }

        $updated = $this->presetModel->find($id);
        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $this->attachColumns($updated)]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/api-field-mappings/{id}
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ลบ preset (cascade ลบ columns อัตโนมัติผ่าน FK หรือ manual delete)
     */
    public function delete(int $id): ResponseInterface
    {
        $preset = $this->presetModel->find($id);
        if (! $preset) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ mapping preset นี้']);
        }
        if (! $this->canAccessProject((int) $preset['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $db = \Config\Database::connect();
        $db->transStart();

        $this->columnModel->deleteByPreset($id);
        $this->presetModel->delete($id);

        $db->transComplete();

        if (! $db->transStatus()) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง']);
        }

        return $this->response->setStatusCode(200)
            ->setJSON(['message' => 'ลบ mapping preset สำเร็จ']);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/api-field-mappings/target-fields
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * รายการ field ของ target table ที่ map ได้
     * รับ ?target_table= (default: project_units)
     */
    public function targetFields(): ResponseInterface
    {
        $targetTable = trim($this->request->getGet('target_table') ?? 'project_units');

        $db = \Config\Database::connect();

        // ตรวจว่า target table อยู่ใน sync_target_tables ที่ active
        $allowed = $db->table('sync_target_tables')
            ->where('table_name', $targetTable)
            ->where('is_active', 1)
            ->get()->getRowArray();

        if (!$allowed) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'ไม่พบ target table นี้ หรือยังไม่ได้เปิดใช้งาน']);
        }

        // ดึง columns จาก DB schema
        if (!$db->tableExists($targetTable)) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'ไม่พบตาราง ' . $targetTable . ' ในฐานข้อมูล']);
        }

        $columnsRaw = $db->query('SHOW COLUMNS FROM `' . $targetTable . '`')->getResultArray();

        // filter ออก system columns
        $excludeColumns = ['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'];

        $fields = [];
        foreach ($columnsRaw as $col) {
            $fieldName = $col['Field'];
            if (in_array($fieldName, $excludeColumns, true)) {
                continue;
            }
            $fields[] = [
                'field' => $fieldName,
                'type'  => $this->simplifyColumnType($col['Type']),
                'label' => $fieldName, // frontend can override
            ];
        }

        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $fields]);
    }

    /**
     * แปลง MySQL type เป็นชื่อง่ายๆ
     */
    private function simplifyColumnType(string $mysqlType): string
    {
        $type = strtolower($mysqlType);
        if (str_contains($type, 'tinyint(1)') || str_contains($type, 'boolean')) return 'boolean';
        if (str_contains($type, 'int'))      return 'integer';
        if (str_contains($type, 'decimal') || str_contains($type, 'float') || str_contains($type, 'double')) return 'decimal';
        if (str_contains($type, 'text'))     return 'text';
        if (str_contains($type, 'varchar'))  return 'varchar';
        if (str_contains($type, 'enum'))     return 'enum';
        if (str_contains($type, 'datetime') || str_contains($type, 'timestamp')) return 'datetime';
        if (str_contains($type, 'date'))     return 'date';
        return 'varchar';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/api-field-mappings/source-fields?snapshot_id=
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * รายการ field จาก snapshot dynamic table
     * รับ snapshot_id → ดึง code จาก sync_from_api → SHOW COLUMNS FROM sync_{code}
     * ตัด id, row_number ออก พร้อมดึง sample value จาก row แรก
     */
    public function sourceFields(): ResponseInterface
    {
        $snapshotId = (int) ($this->request->getGet('snapshot_id') ?? 0);
        if ($snapshotId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ snapshot_id']);
        }

        $db = \Config\Database::connect();

        // ดึง snapshot record เพื่อหา code และ project_id
        $snapshot = $db->table('sync_from_api')
            ->where('id', $snapshotId)
            ->get()->getRowArray();

        if (! $snapshot) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ snapshot นี้']);
        }

        $projectId = (int) ($snapshot['project_id'] ?? 0);
        if (! $this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $code      = $snapshot['code'] ?? '';
        $tableName = 'sync_' . $code;

        // ตรวจว่า table มีอยู่จริง
        if (! $db->tableExists($tableName)) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ table ของ snapshot นี้ (sync_' . $code . ')']);
        }

        // ดึงรายชื่อ columns
        $columnsRaw = $db->query('SHOW COLUMNS FROM `' . $tableName . '`')->getResultArray();

        // ดึง row แรกสำหรับ sample value
        $firstRow = $db->table($tableName)->limit(1)->get()->getRowArray() ?? [];

        // ระบุ column ที่ต้องตัดออก
        $excludeColumns = ['id', 'row_number'];

        $fields = [];
        foreach ($columnsRaw as $col) {
            $fieldName = $col['Field'];
            if (in_array($fieldName, $excludeColumns, true)) {
                continue;
            }
            $fields[] = [
                'field'  => $fieldName,
                'sample' => $firstRow[$fieldName] ?? null,
            ];
        }

        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $fields]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/api-field-mappings/{id}/export
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Export preset เป็น JSON file download
     */
    public function export(int $id): ResponseInterface
    {
        $preset = $this->presetModel->find($id);
        if (! $preset) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ mapping preset นี้']);
        }
        if (! $this->canAccessProject((int) $preset['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $columns = $this->columnModel->getByPreset($id);

        // สร้าง export data — ตัด internal fields ออก
        $exportData = [
            'name'             => $preset['name'],
            'target_table'     => $preset['target_table'] ?? 'project_units',
            'upsert_key'       => $preset['upsert_key'] ?? 'unit_code',
            'project_id_mode'  => $preset['project_id_mode'] ?? 'from_snapshot',
            'project_id_field' => $preset['project_id_field'] ?? null,
            'is_default'       => (bool) ($preset['is_default'] ?? false),
            'columns'          => array_map(fn($c) => [
                'source_field'    => $c['source_field'],
                'target_field'    => $c['target_field'],
                'transform_type'  => $c['transform_type'] ?? 'none',
                'transform_value' => $c['transform_value'] ?? null,
                'sort_order'      => (int) ($c['sort_order'] ?? 0),
            ], $columns),
        ];

        $json     = json_encode($exportData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $preset['name']);
        $filename = 'mapping-' . $safeName . '-' . date('Ymd') . '.json';

        return $this->response
            ->setHeader('Content-Type', 'application/json')
            ->setHeader('Content-Disposition', 'attachment; filename="' . $filename . '"')
            ->setBody($json);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/api-field-mappings/import
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Import preset จาก JSON file
     * FormData: file (JSON), project_id
     */
    public function import(): ResponseInterface
    {
        $projectId = (int) ($this->request->getPost('project_id') ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (! $this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $file = $this->request->getFile('file');
        if (! $file || ! $file->isValid()) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาอัปโหลดไฟล์ JSON']);
        }

        $content = file_get_contents($file->getTempName());
        $data    = json_decode($content, true);

        if (! is_array($data) || empty($data['name']) || ! is_array($data['columns'] ?? null)) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'รูปแบบไฟล์ไม่ถูกต้อง — ต้องมี name และ columns']);
        }

        // ── ตรวจชื่อซ้ำ แล้วต่อท้าย (copy), (copy 2), ... ──
        $baseName   = trim($data['name']);
        $finalName  = $baseName;
        $db         = \Config\Database::connect();
        $copyNum    = 0;

        while ($db->table('api_field_mapping_presets')
                  ->where('project_id', $projectId)
                  ->where('name', $finalName)
                  ->countAllResults() > 0) {
            $copyNum++;
            $suffix    = $copyNum === 1 ? ' (copy)' : " (copy {$copyNum})";
            $finalName = $baseName . $suffix;
        }

        // ── สร้าง preset + columns ใน transaction ──
        $db->transStart();

        $presetId = $this->presetModel->insert([
            'project_id'       => $projectId,
            'name'             => $finalName,
            'target_table'     => $data['target_table'] ?? 'project_units',
            'upsert_key'       => $data['upsert_key'] ?? 'unit_code',
            'project_id_mode'  => $data['project_id_mode'] ?? 'from_snapshot',
            'project_id_field' => $data['project_id_field'] ?? null,
            'is_default'       => 0, // import ไม่ตั้ง default
            'created_by'       => $this->userId(),
        ]);

        $this->insertColumns((int) $presetId, $data['columns']);

        $db->transComplete();

        if (! $db->transStatus()) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'Import ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง']);
        }

        $preset = $this->presetModel->find($presetId);
        return $this->response->setStatusCode(201)
            ->setJSON(['message' => 'Import สำเร็จ', 'data' => $this->attachColumns($preset)]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private helpers
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Insert columns batch สำหรับ preset
     *
     * @param array $columns array of column data จาก request body
     */
    private function insertColumns(int $presetId, array $columns): void
    {
        if (empty($columns)) {
            return;
        }

        $rows = [];
        foreach ($columns as $i => $col) {
            $sourceField = trim($col['source_field'] ?? '');
            $targetField = trim($col['target_field'] ?? '');
            if ($sourceField === '' || $targetField === '') {
                continue;
            }
            $rows[] = [
                'preset_id'       => $presetId,
                'source_field'    => $sourceField,
                'target_field'    => $targetField,
                'transform_type'  => $col['transform_type']  ?? null,
                'transform_value' => $col['transform_value'] ?? null,
                'sort_order'      => isset($col['sort_order']) ? (int) $col['sort_order'] : $i,
            ];
        }

        if (! empty($rows)) {
            $this->columnModel->insertBatch($rows);
        }
    }
}
