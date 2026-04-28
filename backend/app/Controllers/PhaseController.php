<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;

class PhaseController extends BaseController
{
    private function canWrite(): bool { return in_array($this->request->user_role ?? '', ['admin', 'manager'], true); }
    private function db(): \CodeIgniter\Database\BaseConnection { return \Config\Database::connect(); }

    // GET /api/phases?project_id=
    public function index(): ResponseInterface
    {
        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);

        $data = $this->db()->table('project_phases')
            ->where('project_id', $pid)
            ->orderBy('sort_order', 'ASC')
            ->orderBy('name', 'ASC')
            ->get()->getResultArray();

        // เพิ่มจำนวน unit ที่ผูกกับแต่ละ phase
        foreach ($data as &$row) {
            $row['unit_count'] = (int) $this->db()->table('project_units')
                ->where('phase_id', $row['id'])
                ->countAllResults();
        }

        return $this->response->setStatusCode(200)->setJSON(['data' => $data]);
    }

    // POST /api/phases
    public function create(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $body = $this->request->getJSON(true) ?? [];
        $pid  = (int) ($body['project_id'] ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);

        $name = trim($body['name'] ?? '');
        if (!$name) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุชื่อ Phase']);

        $dup = $this->db()->table('project_phases')->where('project_id', $pid)->where('name', $name)->countAllResults();
        if ($dup > 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'ชื่อ Phase นี้มีอยู่แล้วในโครงการ']);

        $now = date('Y-m-d H:i:s');
        $this->db()->table('project_phases')->insert([
            'project_id' => $pid,
            'name'       => $name,
            'sort_order' => (int) ($body['sort_order'] ?? 0),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $row = $this->db()->table('project_phases')->where('id', $this->db()->insertID())->get()->getRowArray();
        $row['unit_count'] = 0;
        return $this->response->setStatusCode(201)->setJSON(['message' => 'สร้าง Phase สำเร็จ', 'data' => $row]);
    }

    // PUT /api/phases/:id
    public function update(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $row = $this->db()->table('project_phases')->where('id', $id)->get()->getRowArray();
        if (!$row) return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบ Phase']);

        $body = $this->request->getJSON(true) ?? [];
        $update = ['updated_at' => date('Y-m-d H:i:s')];

        if (isset($body['name'])) {
            $name = trim($body['name']);
            if (!$name) return $this->response->setStatusCode(400)->setJSON(['error' => 'ชื่อ Phase ห้ามว่าง']);
            // ตรวจชื่อซ้ำ (ยกเว้นตัวเอง)
            $dup = $this->db()->table('project_phases')
                ->where('project_id', $row['project_id'])
                ->where('name', $name)
                ->where('id !=', $id)
                ->countAllResults();
            if ($dup > 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'ชื่อ Phase นี้มีอยู่แล้วในโครงการ']);
            $update['name'] = $name;
        }
        if (isset($body['sort_order'])) $update['sort_order'] = (int) $body['sort_order'];

        $this->db()->table('project_phases')->where('id', $id)->update($update);

        $updated = $this->db()->table('project_phases')->where('id', $id)->get()->getRowArray();
        $updated['unit_count'] = (int) $this->db()->table('project_units')->where('phase_id', $id)->countAllResults();
        return $this->response->setStatusCode(200)->setJSON(['message' => 'อัปเดต Phase สำเร็จ', 'data' => $updated]);
    }

    // DELETE /api/phases/:id
    public function delete(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $row = $this->db()->table('project_phases')->where('id', $id)->get()->getRowArray();
        if (!$row) return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบ Phase']);

        $used = $this->db()->table('project_units')->where('phase_id', $id)->countAllResults();
        if ($used > 0) return $this->response->setStatusCode(400)->setJSON(['error' => "ไม่สามารถลบได้ มียูนิต {$used} รายการอยู่ใน Phase นี้"]);

        $this->db()->table('project_phases')->where('id', $id)->delete();
        return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบ Phase สำเร็จ']);
    }
}
