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
     * GET /api/dashboard/summary?project_id=
     * Returns project summary + budget summary combined
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

        $projectSummary = $this->svc->getProjectSummary($projectId);
        $budgetSummary = $this->svc->getBudgetSummary($projectId);

        return $this->response->setJSON([
            'data' => [
                'project_summary' => $projectSummary,
                'budget_summary' => $budgetSummary,
            ],
        ]);
    }

    /**
     * GET /api/dashboard/recent-sales?project_id=&limit=
     * Returns recent sales transactions
     */
    public function recentSales(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? $this->request->getHeaderLine('X-Project-Id'));
        $limit = (int) ($this->request->getGet('limit') ?? 10);

        if (!$projectId) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        // Limit between 1 and 50
        $limit = max(1, min(50, $limit));

        $recentSales = $this->svc->getRecentSales($projectId, $limit);

        return $this->response->setJSON([
            'data' => $recentSales,
        ]);
    }

    /**
     * GET /api/dashboard/charts?project_id=
     * Returns unit status chart + budget usage by source
     */
    public function charts(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? $this->request->getHeaderLine('X-Project-Id'));

        if (!$projectId) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $unitStatusChart = $this->svc->getUnitStatusChart($projectId);
        $budgetUsageBySource = $this->svc->getBudgetUsageBySource($projectId);

        return $this->response->setJSON([
            'data' => [
                'unit_status_chart' => $unitStatusChart,
                'budget_usage_by_source' => $budgetUsageBySource,
            ],
        ]);
    }
}
