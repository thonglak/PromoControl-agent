<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;

/**
 * BottomLineMappingController — CRUD สำหรับ Column Mapping Presets
 *
 * Table: bottom_line_mappings
 * สิทธิ์: admin, manager เท่านั้น
 * is_default ต้อง unique per project
 */
class BottomLineMappingController extends BaseController
{
    // ── Auth helpers ──────────────────────────────────────────────────────

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function canManage(): bool
    {
        return in_array($this->request->user_role ?? '', ['admin', 'manager'], true);
    }

    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) return true;
        return in_array($projectId, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    private function userId(): int
    {
        return (int) ($this->request->user_id ?? 0);
    }

    private function db(): \CodeIgniter\Database\BaseConnection
    {
        return \Config\Database::connect();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/bottom-line-mappings?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    public function index(): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Mapping']);
        }

        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $rows = $this->db()->table('bottom_line_mappings m')
            ->select('m.id, m.preset_name, m.mapping_config, m.is_default, m.created_at, m.updated_at, u.name AS created_by_name')
            ->join('users u', 'u.id = m.created_by', 'left')
            ->where('m.project_id', $projectId)
            ->orderBy('m.is_default', 'DESC')
            ->orderBy('m.preset_name', 'ASC')
            ->get()->getResultArray();

        // decode mapping_config JSON
        foreach ($rows as &$row) {
            $row['mapping_config'] = json_decode($row['mapping_config'] ?? '{}', true);
            $row['is_default']     = (bool) $row['is_default'];
        }

        return $this->response->setStatusCode(200)->setJSON(['data' => $rows]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/bottom-line-mappings/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function show(int $id): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Mapping']);
        }

        $row = $this->db()->table('bottom_line_mappings m')
            ->select('m.*, u.name AS created_by_name')
            ->join('users u', 'u.id = m.created_by', 'left')
            ->where('m.id', $id)
            ->get()->getRowArray();

        if (!$row) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ Mapping Preset นี้']);
        }

        if (!$this->canAccessProject((int) $row['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $row['mapping_config'] = json_decode($row['mapping_config'] ?? '{}', true);
        $row['is_default']     = (bool) $row['is_default'];

        return $this->response->setStatusCode(200)->setJSON(['data' => $row]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/bottom-line-mappings
    // ═══════════════════════════════════════════════════════════════════════

    public function create(): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Mapping']);
        }

        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);

        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        // validate
        $errors = $this->validatePayload($body);
        if ($errors) {
            return $this->response->setStatusCode(400)->setJSON(['errors' => $errors]);
        }

        $db        = $this->db();
        $isDefault = !empty($body['is_default']);
        $now       = date('Y-m-d H:i:s');

        // ถ้า is_default=true → clear default อื่นใน project เดียวกัน
        if ($isDefault) {
            $db->table('bottom_line_mappings')
                ->where('project_id', $projectId)
                ->update(['is_default' => 0]);
        }

        $db->table('bottom_line_mappings')->insert([
            'project_id'     => $projectId,
            'preset_name'    => trim($body['preset_name']),
            'mapping_config' => json_encode($body['mapping_config'], JSON_UNESCAPED_UNICODE),
            'is_default'     => $isDefault ? 1 : 0,
            'created_by'     => $this->userId(),
            'created_at'     => $now,
            'updated_at'     => $now,
        ]);

        $newId  = $db->insertID();
        $record = $this->fetchOne($newId);

        return $this->response->setStatusCode(201)->setJSON([
            'message' => 'บันทึกการตั้งค่า Mapping สำเร็จ',
            'data'    => $record,
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/bottom-line-mappings/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function update(int $id): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Mapping']);
        }

        $db  = $this->db();
        $row = $db->table('bottom_line_mappings')->where('id', $id)->get()->getRowArray();

        if (!$row) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ Mapping Preset นี้']);
        }

        $projectId = (int) $row['project_id'];
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $body = $this->request->getJSON(true) ?? [];

        // validate
        $errors = $this->validatePayload($body);
        if ($errors) {
            return $this->response->setStatusCode(400)->setJSON(['errors' => $errors]);
        }

        $isDefault = !empty($body['is_default']);

        // ถ้า is_default เปลี่ยนเป็น true → clear default อื่น
        if ($isDefault) {
            $db->table('bottom_line_mappings')
                ->where('project_id', $projectId)
                ->where('id !=', $id)
                ->update(['is_default' => 0]);
        }

        $db->table('bottom_line_mappings')
            ->where('id', $id)
            ->update([
                'preset_name'    => trim($body['preset_name']),
                'mapping_config' => json_encode($body['mapping_config'], JSON_UNESCAPED_UNICODE),
                'is_default'     => $isDefault ? 1 : 0,
                'updated_at'     => date('Y-m-d H:i:s'),
            ]);

        $record = $this->fetchOne($id);

        return $this->response->setStatusCode(200)->setJSON([
            'message' => 'แก้ไขการตั้งค่า Mapping สำเร็จ',
            'data'    => $record,
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/bottom-line-mappings/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function delete(int $id): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Mapping']);
        }

        $db  = $this->db();
        $row = $db->table('bottom_line_mappings')->where('id', $id)->get()->getRowArray();

        if (!$row) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ Mapping Preset นี้']);
        }

        if (!$this->canAccessProject((int) $row['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        // ลบ mapping columns ที่เกี่ยวข้อง (backward compat)
        $db->table('bottom_line_mapping_columns')
            ->where('mapping_preset_id', $id)
            ->delete();

        $db->table('bottom_line_mappings')->where('id', $id)->delete();

        return $this->response->setStatusCode(200)->setJSON([
            'message' => 'ลบการตั้งค่า Mapping สำเร็จ',
        ]);
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private function validatePayload(array $body): array
    {
        $errors = [];

        if (empty(trim((string) ($body['preset_name'] ?? '')))) {
            $errors['preset_name'] = 'กรุณากรอกชื่อ Preset';
        }

        $config = $body['mapping_config'] ?? null;
        if (!is_array($config)) {
            $errors['mapping_config'] = 'กรุณาระบุการตั้งค่า Mapping';
        } elseif (empty($config['unit_code_column'])) {
            $errors['mapping_config'] = 'กรุณาระบุ column สำหรับเลขที่ยูนิต (unit_code_column)';
        }

        return $errors;
    }

    private function fetchOne(int $id): ?array
    {
        $row = $this->db()->table('bottom_line_mappings m')
            ->select('m.id, m.project_id, m.preset_name, m.mapping_config, m.is_default, m.created_at, m.updated_at, u.name AS created_by_name')
            ->join('users u', 'u.id = m.created_by', 'left')
            ->where('m.id', $id)
            ->get()->getRowArray();

        if ($row) {
            $row['mapping_config'] = json_decode($row['mapping_config'] ?? '{}', true);
            $row['is_default']     = (bool) $row['is_default'];
        }

        return $row;
    }
}
