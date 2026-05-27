<?php

namespace App\Controllers;

use App\Models\ProjectLegacyReconciliationModel;
use App\Services\BudgetMovementService;
use App\Services\DashboardService;
use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\RESTful\ResourceController;

/**
 * Public Monitor — endpoint สาธารณะดู KPI โครงการผ่าน token-based link
 *
 * - ไม่ต้อง auth — ใครก็ตามที่มี token เข้าได้
 * - 1 token → N projects (ผ่าน monitor_links + pivot)
 * - คืน KPI ของแต่ละโครงการในลิงค์ (array)
 * - คำนวณตรงกับ summary ของ /api/sales-transactions (sales-list page)
 */
class PublicMonitorController extends ResourceController
{
    private BudgetMovementService $budgetSvc;
    private ProjectLegacyReconciliationModel $legacyModel;
    private DashboardService $dashboardSvc;

    public function __construct()
    {
        $this->budgetSvc    = new BudgetMovementService();
        $this->legacyModel  = new ProjectLegacyReconciliationModel();
        $this->dashboardSvc = new DashboardService();
    }

    private function db(): \CodeIgniter\Database\BaseConnection
    {
        return \Config\Database::connect();
    }

    /**
     * GET /api/public/monitor/{token}
     */
    public function show($token = null)
    {
        $token = trim((string) $token);
        if ($token === '' || strlen($token) < 32) {
            return $this->failNotFound('ลิงค์ไม่ถูกต้อง');
        }

        $link = $this->db()->table('monitor_links')->where('token', $token)->get()->getRowArray();
        if (!$link) {
            return $this->failNotFound('ลิงค์ไม่ถูกต้องหรือถูกเพิกถอนแล้ว');
        }

        $projectRows = $this->db()->table('monitor_link_projects mlp')
            ->select('p.id, p.code, p.name')
            ->join('projects p', 'p.id = mlp.project_id')
            ->where('mlp.monitor_link_id', (int) $link['id'])
            ->orderBy('p.code', 'ASC')
            ->get()->getResultArray();

        $projects = [];
        foreach ($projectRows as $p) {
            $projects[] = $this->computeKpi((int) $p['id'], (string) $p['code'], (string) $p['name']);
        }

        return $this->respond([
            'link' => [
                'name' => $link['name'],
            ],
            'projects'   => $projects,
            'fetched_at' => date('Y-m-d H:i:s'),
        ]);
    }

    /**
     * คำนวณ X, Y, sold_count สำหรับ 1 project
     */
    private function computeKpi(int $pid, string $code, string $name): array
    {
        // ─── งบ Project-wide ───
        $poolBalance = $this->budgetSvc->getPoolBalance($pid);

        $unitTxCounts = $this->db()->table('sales_transactions st')
            ->select('st.unit_id, COUNT(*) as tx_count')
            ->where('st.project_id', $pid)
            ->whereNotIn('st.status', ['cancelled', 'legacy'])
            ->groupBy('st.unit_id')
            ->get()->getResultArray();

        $summaryCache = [];
        $totalColumnSum = 0;
        foreach ($unitTxCounts as $r) {
            $uid = (int) $r['unit_id'];
            $cnt = (int) $r['tx_count'];
            if ($uid <= 0 || $cnt <= 0) continue;
            try {
                if (!isset($summaryCache[$uid])) {
                    $summaryCache[$uid] = $this->budgetSvc->getUnitBudgetSummary($pid, $uid);
                }
                $unitRemaining = (float) ($summaryCache[$uid]['total_remaining'] ?? 0);
                $totalColumnSum += $unitRemaining * $cnt;
            } catch (\Throwable $e) {}
        }
        $totalRemainingNewSystem = round($totalColumnSum + $poolBalance, 2);

        $profitRow = $this->db()->table('sales_transactions')
            ->selectSum('profit', 'total')
            ->where('project_id', $pid)
            ->whereNotIn('status', ['cancelled', 'legacy'])
            ->get()->getRowArray();
        $totalProfitNewSystem = round((float) ($profitRow['total'] ?? 0), 2);

        $countRow = $this->db()->table('sales_transactions')
            ->select("
                COUNT(CASE WHEN status='active' THEN 1 END) AS active_count,
                COUNT(CASE WHEN status='legacy' THEN 1 END) AS legacy_count
            ", false)
            ->where('project_id', $pid)
            ->get()->getRowArray() ?? ['active_count' => 0, 'legacy_count' => 0];
        $soldActive = (int) ($countRow['active_count'] ?? 0);
        $soldLegacy = (int) ($countRow['legacy_count'] ?? 0);

        $legacyRow = $this->legacyModel->getByProjectId($pid);
        $legacyBudgetRemaining = $legacyRow !== null ? (float) $legacyRow['legacy_total_budget_remaining'] : 0;
        $legacyProfit          = $legacyRow !== null ? (float) $legacyRow['legacy_total_profit'] : 0;
        $legacyAsOf            = $legacyRow !== null ? $legacyRow['as_of_date'] : null;

        return [
            'project' => ['id' => $pid, 'code' => $code, 'name' => $name],
            'budget_remaining' => [
                'total'      => round($totalRemainingNewSystem + $legacyBudgetRemaining, 2),
                'new_system' => $totalRemainingNewSystem,
                'legacy'     => $legacyBudgetRemaining,
            ],
            'profit' => [
                'total'      => round($totalProfitNewSystem + $legacyProfit, 2),
                'new_system' => $totalProfitNewSystem,
                'legacy'     => $legacyProfit,
            ],
            'sold_count' => [
                'total'  => $soldActive + $soldLegacy,
                'active' => $soldActive,
                'legacy' => $soldLegacy,
            ],
            'legacy_as_of' => $legacyAsOf,
        ];
    }

    /**
     * GET /api/public/monitor/{token}/dashboard/{projectId}?value_basis=selling|cost
     * ดู Dashboard ของ project ผ่าน token link (no auth)
     */
    public function dashboard($token = null, $projectId = null)
    {
        $token = trim((string) $token);
        $pid   = (int) $projectId;
        if ($token === '' || strlen($token) < 32 || $pid <= 0) {
            return $this->failNotFound('ลิงค์ไม่ถูกต้อง');
        }

        // verify token + project access
        $link = $this->db()->table('monitor_links')->where('token', $token)->get()->getRowArray();
        if (!$link) return $this->failNotFound('ลิงค์ไม่ถูกต้องหรือถูกเพิกถอนแล้ว');

        $hasAccess = $this->db()->table('monitor_link_projects')
            ->where('monitor_link_id', (int) $link['id'])
            ->where('project_id', $pid)
            ->countAllResults() > 0;
        if (!$hasAccess) return $this->failForbidden('ลิงค์นี้ไม่ครอบคลุมโครงการนี้');

        $valueBasis = $this->request->getGet('value_basis') === 'cost' ? 'cost' : 'selling';

        // ตรงกับ flow ของหน้า Dashboard: summary + calculateDiscount(0) แล้ว merge
        $summary  = $this->dashboardSvc->getSalesDashboard($pid, null, $valueBasis);
        $discount = $this->dashboardSvc->calculateDiscount($pid, null, 0, $valueBasis);
        $legacy   = $this->dashboardSvc->getLegacyData($pid);

        $data = array_merge($summary, $discount);
        $data['legacy'] = $legacy;

        return $this->respond(['data' => $data]);
    }
}
