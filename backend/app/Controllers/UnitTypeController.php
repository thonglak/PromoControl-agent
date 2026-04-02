<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;

class UnitTypeController extends BaseController
{
    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function canWrite(): bool { return in_array($this->request->user_role ?? '', ['admin', 'manager'], true); }
    private function db(): \CodeIgniter\Database\BaseConnection { return \Config\Database::connect(); }

    private function getProjectType(int $pid): ?string
    {
        $p = $this->db()->table('projects')->select('project_type')->where('id', $pid)->get()->getRowArray();
        return $p['project_type'] ?? null;
    }

    // GET /api/unit-types?project_id=&active_only=
    public function index(): ResponseInterface
    {
        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);

        $pType = $this->getProjectType($pid);
        if ($pType !== 'mixed') {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'โครงการนี้ไม่ต้องกำหนดประเภทยูนิต']);
        }

        $builder = $this->db()->table('unit_types')->where('project_id', $pid);
        if ($this->request->getGet('active_only') === 'true') $builder->where('is_active', 1);
        $data = $builder->orderBy('sort_order', 'ASC')->orderBy('name', 'ASC')->get()->getResultArray();

        foreach ($data as &$row) $row['is_active'] = (bool) $row['is_active'];

        return $this->response->setStatusCode(200)->setJSON(['data' => $data]);
    }

    // POST /api/unit-types
    public function create(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $body = $this->request->getJSON(true) ?? [];
        $pid  = (int) ($body['project_id'] ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);

        if ($this->getProjectType($pid) !== 'mixed') {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'เฉพาะโครงการ Mixed เท่านั้นที่กำหนดประเภทยูนิตได้']);
        }

        $name = trim($body['name'] ?? '');
        if (!$name) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุชื่อประเภท']);

        $dup = $this->db()->table('unit_types')->where('project_id', $pid)->where('name', $name)->countAllResults();
        if ($dup > 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'ชื่อประเภทนี้มีอยู่แล้วในโครงการ']);

        $now = date('Y-m-d H:i:s');
        $this->db()->table('unit_types')->insert([
            'project_id' => $pid,
            'name'       => $name,
            'sort_order' => (int) ($body['sort_order'] ?? 0),
            'is_active'  => isset($body['is_active']) ? ($body['is_active'] ? 1 : 0) : 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $row = $this->db()->table('unit_types')->where('id', $this->db()->insertID())->get()->getRowArray();
        $row['is_active'] = (bool) $row['is_active'];
        return $this->response->setStatusCode(201)->setJSON(['message' => 'สร้างประเภทยูนิตสำเร็จ', 'data' => $row]);
    }

    // PUT /api/unit-types/:id
    public function update(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $row = $this->db()->table('unit_types')->where('id', $id)->get()->getRowArray();
        if (!$row) return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบประเภทยูนิต']);

        $body = $this->request->getJSON(true) ?? [];
        $update = ['updated_at' => date('Y-m-d H:i:s')];
        if (isset($body['name']))       $update['name'] = trim($body['name']);
        if (isset($body['sort_order'])) $update['sort_order'] = (int) $body['sort_order'];
        if (isset($body['is_active']))  $update['is_active'] = $body['is_active'] ? 1 : 0;

        $this->db()->table('unit_types')->where('id', $id)->update($update);
        $updated = $this->db()->table('unit_types')->where('id', $id)->get()->getRowArray();
        $updated['is_active'] = (bool) $updated['is_active'];
        return $this->response->setStatusCode(200)->setJSON(['message' => 'อัปเดตสำเร็จ', 'data' => $updated]);
    }

    // DELETE /api/unit-types/:id
    public function delete(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $row = $this->db()->table('unit_types')->where('id', $id)->get()->getRowArray();
        if (!$row) return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบประเภทยูนิต']);

        $used = $this->db()->table('project_units')->where('unit_type_id', $id)->countAllResults();
        if ($used > 0) return $this->response->setStatusCode(400)->setJSON(['error' => "ไม่สามารถลบได้ มียูนิต {$used} รายการใช้ประเภทนี้อยู่"]);

        $this->db()->table('unit_types')->where('id', $id)->delete();
        return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบประเภทยูนิตสำเร็จ']);
    }
}
