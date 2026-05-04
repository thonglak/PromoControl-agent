<?php

namespace App\Controllers;

use App\Services\UnitBudgetSettingsService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

class UnitBudgetSettingsController extends BaseController
{
    private UnitBudgetSettingsService $svc;

    public function __construct()
    {
        $this->svc = new UnitBudgetSettingsService();
    }

    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function canAccessProject(int $pid): bool
    {
        if ($this->isAdmin()) return true;
        return in_array($pid, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    /**
     * GET /api/unit-budget-settings/preview?project_id=...
     * คำนวณ standard_budget ใหม่ของทุก unit available — return list ตาราง
     */
    public function preview(): ResponseInterface
    {
        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        if ($pid <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        try {
            $rows = $this->svc->previewProject($pid);
            return $this->response->setStatusCode(200)->setJSON([
                'data' => $rows,
                'meta' => [
                    'project_id' => $pid,
                    'count'      => count($rows),
                ],
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(500)->setJSON(['error' => $e->getMessage()]);
        }
    }

    /**
     * POST /api/unit-budget-settings/apply
     * Body: { project_id: number, unit_ids?: number[] }   (unit_ids ว่าง = ทั้งโครงการ)
     */
    public function apply(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        $pid = (int) ($body['project_id'] ?? 0);
        if ($pid <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $unitIds = null;
        if (isset($body['unit_ids']) && is_array($body['unit_ids'])) {
            $unitIds = array_values(array_filter(array_map('intval', $body['unit_ids']), static fn($v) => $v > 0));
            if (empty($unitIds)) {
                return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาเลือกยูนิตอย่างน้อย 1 รายการ']);
            }
        }

        try {
            $result = $this->svc->applyProject($pid, $unitIds);
            return $this->response->setStatusCode(200)->setJSON([
                'message' => "อัปเดตงบยูนิตสำเร็จ {$result['updated']} ยูนิต",
                'data'    => $result,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(500)->setJSON(['error' => $e->getMessage()]);
        }
    }
}
