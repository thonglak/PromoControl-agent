<?php

namespace App\Controllers;

use App\Services\ReportService;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * ReportController — รายงาน 3 ประเภท + CSV Export
 *
 * Endpoints:
 *   GET  /api/reports/sales            → รายงานยอดขาย
 *   GET  /api/reports/budget           → รายงานงบประมาณ
 *   GET  /api/reports/promotion-usage  → รายงานการใช้โปรโมชั่น
 *   GET  /api/reports/sales/export     → Export CSV ยอดขาย
 *   GET  /api/reports/budget/export    → Export CSV งบประมาณ
 *
 * สิทธิ์: admin, manager, finance, viewer (กำหนดที่ Routes)
 */
class ReportController extends BaseController
{
    private ReportService $svc;

    public function __construct()
    {
        $this->svc = new ReportService();
    }

    // ── Helper methods ──────────────────────────────────────────────

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

    private function requireProject(): ?array
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if (!$projectId) {
            return null;
        }
        if (!$this->canAccessProject($projectId)) {
            return null;
        }
        return ['project_id' => $projectId];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 1. Sales Report
    // ═══════════════════════════════════════════════════════════════════

    /**
     * GET /api/reports/sales
     *
     * Query params: project_id (required), date_from, date_to,
     *   house_model_id, transaction_status, unit_type_id, page, per_page
     */
    public function sales(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);

        if (!$projectId) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $filters = [
            'date_from'          => $this->request->getGet('date_from'),
            'date_to'            => $this->request->getGet('date_to'),
            'house_model_id'     => $this->request->getGet('house_model_id'),
            'transaction_status' => $this->request->getGet('transaction_status') ?? 'all',
            'unit_type_id'       => $this->request->getGet('unit_type_id'),
            'page'               => $this->request->getGet('page') ?? 1,
            'per_page'           => $this->request->getGet('per_page') ?? 50,
        ];

        try {
            $result = $this->svc->getSalesReport($projectId, $filters);
            return $this->response->setJSON(['data' => $result]);
        } catch (\RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Budget Report
    // ═══════════════════════════════════════════════════════════════════

    /**
     * GET /api/reports/budget
     *
     * Query params: project_id (required), budget_source_type,
     *   movement_type, movement_status, date_from, date_to, page, per_page
     */
    public function budget(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);

        if (!$projectId) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $filters = [
            'budget_source_type' => $this->request->getGet('budget_source_type'),
            'movement_type'      => $this->request->getGet('movement_type'),
            'movement_status'    => $this->request->getGet('movement_status'),
            'date_from'          => $this->request->getGet('date_from'),
            'date_to'            => $this->request->getGet('date_to'),
            'page'               => $this->request->getGet('page') ?? 1,
            'per_page'           => $this->request->getGet('per_page') ?? 50,
        ];

        try {
            $result = $this->svc->getBudgetReport($projectId, $filters);
            return $this->response->setJSON(['data' => $result]);
        } catch (\RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Promotion Usage Report
    // ═══════════════════════════════════════════════════════════════════

    /**
     * GET /api/reports/promotion-usage
     *
     * Query params: project_id (required), promotion_category,
     *   effective_category, date_from, date_to
     */
    public function promotionUsage(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);

        if (!$projectId) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $filters = [
            'promotion_category' => $this->request->getGet('promotion_category'),
            'effective_category' => $this->request->getGet('effective_category'),
            'date_from'          => $this->request->getGet('date_from'),
            'date_to'            => $this->request->getGet('date_to'),
        ];

        try {
            $result = $this->svc->getPromotionUsageReport($projectId, $filters);
            return $this->response->setJSON(['data' => $result]);
        } catch (\RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. CSV Exports
    // ═══════════════════════════════════════════════════════════════════

    /**
     * GET /api/reports/sales/export
     *
     * Query params: same as sales report
     * Response: CSV file download
     */
    public function exportSales(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);

        if (!$projectId) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $filters = [
            'date_from'          => $this->request->getGet('date_from'),
            'date_to'            => $this->request->getGet('date_to'),
            'house_model_id'     => $this->request->getGet('house_model_id'),
            'transaction_status' => $this->request->getGet('transaction_status') ?? 'all',
            'unit_type_id'       => $this->request->getGet('unit_type_id'),
        ];

        try {
            $csv = $this->svc->exportSalesCSV($projectId, $filters);

            // ดึง project code สำหรับชื่อไฟล์
            $projectCode = $this->getProjectCode($projectId);
            $date = date('Ymd');
            $filename = "sales-report-{$projectCode}-{$date}.csv";

            return $this->response
                ->setStatusCode(200)
                ->setHeader('Content-Type', 'text/csv; charset=utf-8')
                ->setHeader('Content-Disposition', "attachment; filename=\"{$filename}\"")
                ->setBody($csv);
        } catch (\RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    /**
     * GET /api/reports/budget/export
     *
     * Query params: same as budget report
     * Response: CSV file download
     */
    public function exportBudget(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);

        if (!$projectId) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $filters = [
            'budget_source_type' => $this->request->getGet('budget_source_type'),
            'movement_type'      => $this->request->getGet('movement_type'),
            'movement_status'    => $this->request->getGet('movement_status'),
            'date_from'          => $this->request->getGet('date_from'),
            'date_to'            => $this->request->getGet('date_to'),
        ];

        try {
            $csv = $this->svc->exportBudgetCSV($projectId, $filters);

            $projectCode = $this->getProjectCode($projectId);
            $date = date('Ymd');
            $filename = "budget-report-{$projectCode}-{$date}.csv";

            return $this->response
                ->setStatusCode(200)
                ->setHeader('Content-Type', 'text/csv; charset=utf-8')
                ->setHeader('Content-Disposition', "attachment; filename=\"{$filename}\"")
                ->setBody($csv);
        } catch (\RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ── Private helpers ─────────────────────────────────────────────

    /**
     * ดึง project code สำหรับชื่อไฟล์ CSV
     */
    private function getProjectCode(int $projectId): string
    {
        $db = \Config\Database::connect();
        $project = $db->table('projects')
            ->select('code')
            ->where('id', $projectId)
            ->get()->getRowArray();

        return $project['code'] ?? 'unknown';
    }
}
