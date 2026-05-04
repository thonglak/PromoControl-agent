<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;

/**
 * HouseModelController — HTTP handlers สำหรับ /api/house-models
 */
class HouseModelController extends BaseController
{
    private \App\Models\HouseModelModel $model;

    public function __construct()
    {
        $this->model = new \App\Models\HouseModelModel();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function isManager(): bool
    {
        return ($this->request->user_role ?? '') === 'manager';
    }

    private function canWrite(): bool
    {
        return $this->isAdmin() || $this->isManager();
    }

    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) return true;
        $allowed = (array) ($this->request->project_ids ?? []);
        return in_array($projectId, array_map('intval', $allowed), true);
    }

    private function canWriteProject(int $projectId): bool
    {
        if (!$this->canWrite()) return false;
        if ($this->isAdmin()) return true;
        $access = (array) ($this->request->project_access ?? []);
        return ($access[$projectId] ?? '') === 'edit';
    }

    private function notFound(): ResponseInterface
    {
        return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบแบบบ้าน']);
    }

    // ─── GET /api/house-models?project_id=&search= ───────────────────────

    public function index(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);

        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $search = (string) ($this->request->getGet('search') ?? '');

        $models = $this->model->getListWithUnitCount($projectId, $search);

        return $this->response->setStatusCode(200)->setJSON(['data' => $models]);
    }

    // ─── GET /api/house-models/:id ────────────────────────────────────────

    public function show(int $id): ResponseInterface
    {
        $model = $this->model->find($id);
        if (!$model) return $this->notFound();

        if (!$this->canAccessProject((int) $model['project_id'])) {
            return $this->notFound();
        }

        // เพิ่ม unit summary
        $db = \Config\Database::connect();
        $unitCounts = $db->table('project_units')
            ->select('status, COUNT(*) as cnt')
            ->where('house_model_id', $id)
            ->groupBy('status')
            ->get()->getResultArray();

        $summary = ['total' => 0, 'available' => 0, 'reserved' => 0, 'sold' => 0, 'transferred' => 0];
        foreach ($unitCounts as $row) {
            $summary[$row['status']] = (int) $row['cnt'];
            $summary['total'] += (int) $row['cnt'];
        }
        $model['unit_summary'] = $summary;

        return $this->response->setStatusCode(200)->setJSON(['data' => $model]);
    }

    // ─── POST /api/house-models ───────────────────────────────────────────

    public function create(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];

        $projectId = (int) ($body['project_id'] ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['errors' => ['project_id' => 'กรุณาระบุโครงการ']]);
        }

        if (!$this->canWriteProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์สร้างแบบบ้านในโครงการนี้']);
        }

        $errors = $this->validateBody($body, null, $projectId);
        if ($errors) {
            return $this->response->setStatusCode(400)->setJSON(['errors' => $errors]);
        }

        $data = $this->extractData($body);
        $data['project_id'] = $projectId;

        $newId = $this->model->insert($data, true);
        if (!$newId) {
            return $this->response->setStatusCode(500)->setJSON(['error' => 'บันทึกข้อมูลไม่สำเร็จ']);
        }

        $created = $this->model->find($newId);
        return $this->response->setStatusCode(201)->setJSON(['message' => 'สร้างแบบบ้านสำเร็จ', 'data' => $created]);
    }

    // ─── PUT /api/house-models/:id ────────────────────────────────────────

    public function update(int $id): ResponseInterface
    {
        $model = $this->model->find($id);
        if (!$model) return $this->notFound();

        $projectId = (int) $model['project_id'];

        if (!$this->canWriteProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไขแบบบ้านในโครงการนี้']);
        }

        $body = $this->request->getJSON(true) ?? [];

        $errors = $this->validateBody($body, $id, $projectId);
        if ($errors) {
            return $this->response->setStatusCode(400)->setJSON(['errors' => $errors]);
        }

        $data = $this->extractData($body);
        unset($data['project_id']); // ห้ามแก้ project_id

        $this->model->update($id, $data);
        $updated = $this->model->find($id);

        return $this->response->setStatusCode(200)->setJSON(['message' => 'แก้ไขแบบบ้านสำเร็จ', 'data' => $updated]);
    }

    // ─── DELETE /api/house-models/:id ────────────────────────────────────

    public function delete(int $id): ResponseInterface
    {
        $model = $this->model->find($id);
        if (!$model) return $this->notFound();

        $projectId = (int) $model['project_id'];

        if (!$this->canWriteProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ลบแบบบ้านในโครงการนี้']);
        }

        // ตรวจว่ามี units อ้างอิงอยู่:
        //   sold/transferred → ห้ามลบเด็ดขาด (ขาย/โอนแล้วมีประวัติ ห้ามแตะ)
        //   available/reserved → user ต้องตั้งใจลบยูนิตก่อน (กัน accident cascade)
        $db    = \Config\Database::connect();
        $units = $db->table('project_units')
            ->select('unit_code, status')
            ->where('house_model_id', $id)
            ->orderBy('status', 'ASC')
            ->orderBy('unit_code', 'ASC')
            ->get()
            ->getResultArray();

        if (! empty($units)) {
            $sold       = array_values(array_filter($units, fn($u) => in_array($u['status'], ['sold', 'transferred'], true)));
            $editable   = array_values(array_filter($units, fn($u) => in_array($u['status'], ['available', 'reserved'], true)));

            // กรณี 1: มียูนิตที่ขาย/โอนแล้ว → block ถาวร
            if (! empty($sold)) {
                return $this->response->setStatusCode(400)->setJSON([
                    'error' => 'ไม่สามารถลบแบบบ้านได้ เนื่องจากมียูนิตที่ขายหรือโอนแล้ว ' . count($sold) . ' ยูนิต',
                    'units' => $sold,
                ]);
            }

            // กรณี 2: มียูนิตที่ยังว่าง/จอง → ขอให้ user ลบยูนิตเอง พร้อมแจ้งรหัส
            if (! empty($editable)) {
                $codes   = array_column($editable, 'unit_code');
                $preview = implode(', ', array_slice($codes, 0, 5));
                if (count($codes) > 5) {
                    $preview .= ' …และอีก ' . (count($codes) - 5) . ' ยูนิต';
                }
                return $this->response->setStatusCode(400)->setJSON([
                    'error' => 'กรุณาลบยูนิต ' . count($editable) . ' ยูนิต (' . $preview . ') ก่อนลบแบบบ้านนี้',
                    'units' => $editable,
                ]);
            }
        }

        $this->model->delete($id);

        return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบแบบบ้านสำเร็จ']);
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private function validateBody(array $body, ?int $excludeId, int $projectId): array
    {
        $errors = [];

        $code = trim((string) ($body['code'] ?? ''));
        $name = trim((string) ($body['name'] ?? ''));

        if ($code === '') {
            $errors['code'] = 'กรุณากรอกรหัสแบบบ้าน';
        } elseif ($this->model->isCodeDuplicate($code, $projectId, $excludeId)) {
            $errors['code'] = 'รหัสแบบบ้านนี้มีอยู่แล้วในโครงการ';
        }

        if ($name === '') {
            $errors['name'] = 'กรุณากรอกชื่อแบบบ้าน';
        }

        if (!isset($body['area_sqm']) || (float) $body['area_sqm'] <= 0) {
            $errors['area_sqm'] = 'กรุณากรอกพื้นที่ใช้สอย';
        }

        return $errors;
    }

    private function extractData(array $body): array
    {
        return array_filter([
            'code'     => isset($body['code'])     ? trim((string) $body['code']) : null,
            'name'     => isset($body['name'])     ? trim((string) $body['name']) : null,
            'area_sqm' => isset($body['area_sqm']) ? (float) $body['area_sqm']   : null,
        ], fn($v) => $v !== null);
    }
}
