<?php

declare(strict_types=1);

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;

class SyncTargetTableController extends BaseController
{
    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function db(): \CodeIgniter\Database\BaseConnection
    {
        return \Config\Database::connect();
    }

    // แปลงค่า is_active จาก MySQL integer เป็น boolean
    private function castRow(array $row): array
    {
        $row['is_active'] = (bool) ($row['is_active'] ?? 0);
        return $row;
    }

    // แปลง type จาก SHOW COLUMNS ให้เหลือแค่ชื่อ type หลัก เช่น varchar(255) → varchar
    private function simplifyType(string $rawType): string
    {
        // ตัดขนาดและ attribute ออก เหลือแค่ชื่อประเภท
        if (preg_match('/^([a-z]+)/i', $rawType, $m)) {
            return strtolower($m[1]);
        }
        return strtolower($rawType);
    }

    // GET /api/sync-target-tables
    // คืนรายการ target table ทั้งหมด เรียงตามชื่อตาราง
    public function index(): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $rows = $this->db()
            ->table('sync_target_tables')
            ->orderBy('table_name', 'ASC')
            ->get()
            ->getResultArray();

        $rows = array_map([$this, 'castRow'], $rows);

        return $this->response->setStatusCode(200)->setJSON(['data' => $rows]);
    }

    // POST /api/sync-target-tables
    // เพิ่ม target table ใหม่ — ตรวจสอบว่า table_name ไม่ซ้ำและมีอยู่จริงใน database
    public function store(): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $body = $this->request->getJSON(true) ?? [];

        $tableName      = trim($body['table_name'] ?? '');
        $label          = trim($body['label'] ?? '');
        $defaultUpsertKey = trim($body['default_upsert_key'] ?? '');

        // ตรวจสอบ required fields
        if ($tableName === '') {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ table_name']);
        }
        if ($label === '') {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ label']);
        }
        if ($defaultUpsertKey === '') {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ default_upsert_key']);
        }

        // ตรวจสอบ table_name ไม่ซ้ำใน sync_target_tables
        $dup = $this->db()
            ->table('sync_target_tables')
            ->where('table_name', $tableName)
            ->countAllResults();
        if ($dup > 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'table_name นี้มีอยู่แล้ว']);
        }

        // ตรวจสอบว่า table มีอยู่จริงใน database
        if (!$this->db()->tableExists($tableName)) {
            return $this->response->setStatusCode(400)->setJSON(['error' => "ไม่พบตาราง '{$tableName}' ใน database"]);
        }

        $now = date('Y-m-d H:i:s');
        $this->db()->table('sync_target_tables')->insert([
            'table_name'        => $tableName,
            'label'             => $label,
            'default_upsert_key' => $defaultUpsertKey,
            'is_active'         => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : 1,
            'created_at'        => $now,
            'updated_at'        => $now,
        ]);

        $row = $this->db()
            ->table('sync_target_tables')
            ->where('id', $this->db()->insertID())
            ->get()
            ->getRowArray();

        return $this->response->setStatusCode(201)->setJSON(['data' => $this->castRow($row)]);
    }

    // PUT /api/sync-target-tables/:id
    // แก้ไข target table — ห้ามเปลี่ยน table_name เพราะอาจกระทบ mapping ที่ผูกไว้
    public function update(int $id): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $row = $this->db()
            ->table('sync_target_tables')
            ->where('id', $id)
            ->get()
            ->getRowArray();

        if (!$row) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบ sync target table']);
        }

        $body   = $this->request->getJSON(true) ?? [];
        $update = ['updated_at' => date('Y-m-d H:i:s')];

        if (isset($body['label']))             $update['label'] = trim($body['label']);
        if (isset($body['default_upsert_key'])) $update['default_upsert_key'] = trim($body['default_upsert_key']);
        if (isset($body['is_active']))          $update['is_active'] = $body['is_active'] ? 1 : 0;

        $this->db()->table('sync_target_tables')->where('id', $id)->update($update);

        $updated = $this->db()
            ->table('sync_target_tables')
            ->where('id', $id)
            ->get()
            ->getRowArray();

        return $this->response->setStatusCode(200)->setJSON(['data' => $this->castRow($updated)]);
    }

    // DELETE /api/sync-target-tables/:id
    // ลบ target table — ตรวจสอบก่อนว่าไม่มี mapping preset อ้างอิงอยู่
    public function delete(int $id): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $row = $this->db()
            ->table('sync_target_tables')
            ->where('id', $id)
            ->get()
            ->getRowArray();

        if (!$row) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบ sync target table']);
        }

        // ตรวจสอบว่ามี api_field_mapping_presets อ้างอิง table_name นี้อยู่หรือไม่
        $referenced = $this->db()
            ->table('api_field_mapping_presets')
            ->where('target_table', $row['table_name'])
            ->countAllResults();

        if ($referenced > 0) {
            return $this->response->setStatusCode(409)->setJSON([
                'error' => 'ไม่สามารถลบได้ เนื่องจากมี mapping preset ที่ใช้งานอยู่',
            ]);
        }

        $this->db()->table('sync_target_tables')->where('id', $id)->delete();

        return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบสำเร็จ']);
    }

    // GET /api/sync-target-tables/:id/columns
    // ดึงรายการคอลัมน์จริงของตารางนั้น เพื่อให้ frontend ใช้ map field
    public function columns(int $id): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $row = $this->db()
            ->table('sync_target_tables')
            ->where('id', $id)
            ->get()
            ->getRowArray();

        if (!$row) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบ sync target table']);
        }

        $tableName = $row['table_name'];

        // ดึง column จริงจาก database schema
        $results = $this->db()->query("SHOW COLUMNS FROM `{$tableName}`")->getResultArray();

        // คอลัมน์ระบบที่ไม่ควรแสดงในการ mapping
        $systemColumns = ['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'];

        $columns = [];
        foreach ($results as $col) {
            $fieldName = $col['Field'];
            if (in_array($fieldName, $systemColumns, true)) {
                continue;
            }
            $columns[] = [
                'field' => $fieldName,
                'type'  => $this->simplifyType($col['Type']),
                'label' => $fieldName,
            ];
        }

        return $this->response->setStatusCode(200)->setJSON(['data' => $columns]);
    }
}
