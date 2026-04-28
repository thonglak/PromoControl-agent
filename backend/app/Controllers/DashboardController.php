<?php

namespace App\Controllers;

use App\Services\DashboardService;
use CodeIgniter\HTTP\ResponseInterface;

class DashboardController extends BaseController
{
    private DashboardService $svc;

    public function __construct()
    {
        $this->svc = new DashboardService();
    }

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) return true;
        $allowed = (array) ($this->request->project_ids ?? []);
        return in_array($projectId, array_map('intval', $allowed), true);
    }

    /**
     * GET /api/dashboard?project_id=&phase=
     * ข้อมูลหลักของ Dashboard (ยอดขาย, stock คงเหลือ)
     */
    public function summary(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? $this->request->getHeaderLine('X-Project-Id'));

        if (!$projectId) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $phaseParam = $this->request->getGet('phase');
        $phaseId = $phaseParam !== null && $phaseParam !== '' ? (int) $phaseParam : null;

        $data = $this->svc->getSalesDashboard($projectId, $phaseId);

        return $this->response->setJSON(['data' => $data]);
    }

    /**
     * POST /api/dashboard/calculate-discount
     * คำนวณส่วนลดประมาณการสำหรับยูนิตที่ยังไม่ขาย
     */
    public function calculateDiscount(): ResponseInterface
    {
        $body = $this->request->getJSON(true);

        $projectId = (int) ($body['project_id'] ?? $this->request->getHeaderLine('X-Project-Id') ?? 0);
        $discount  = (float) ($body['discount'] ?? 0);
        $phaseParam = $body['phase'] ?? null;
        $phaseId   = $phaseParam !== null && $phaseParam !== '' ? (int) $phaseParam : null;

        if (!$projectId) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        if ($discount < 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'ส่วนลดต้องมีค่ามากกว่าหรือเท่ากับ 0']);
        }

        $data = $this->svc->calculateDiscount($projectId, $phaseId, $discount);

        return $this->response->setJSON(['data' => $data]);
    }

    /**
     * GET /api/phases?project_id=
     * ดึงรายการ phase ของโครงการ
     */
    public function phases(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? $this->request->getHeaderLine('X-Project-Id'));

        if (!$projectId) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $data = $this->svc->getPhases($projectId);

        return $this->response->setJSON(['data' => $data]);
    }
}
