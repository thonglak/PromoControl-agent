<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;

/**
 * DashboardService — สรุปข้อมูลภาพรวมของโครงการ
 *
 * กฎสำคัญ:
 * 1. sales_transactions มี status ENUM('draft','confirmed','active','cancelled')
 * 2. ห้ามนับ cancelled transactions ในยอดขาย/กำไร
 * 3. budget ทั้งหมด derive จาก SUM(movements WHERE status='approved')
 * 4. voided movements ไม่นับ
 * 5. pool_remaining ต้องรวม RETURN movements ด้วย
 */
class DashboardService
{
    private BaseConnection $db;

    private const ALLOCATE_TYPES = ['ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'];
    private const USE_TYPES = ['USE', 'SPECIAL_BUDGET_USE'];
    private const RETURN_TYPES = ['RETURN', 'SPECIAL_BUDGET_RETURN'];

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * getProjectSummary - สรุปภาพรวมยอดขายของโครงการ
     */
    public function getProjectSummary(int $projectId): array
    {
        // === Unit counts ===
        $units = $this->db->table('project_units')
            ->select('status, COUNT(*) AS cnt')
            ->where('project_id', $projectId)
            ->groupBy('status')
            ->get()->getResultArray();

        $unitSummary = [
            'total_units' => 0,
            'units_available' => 0,
            'units_reserved' => 0,
            'units_sold' => 0,
            'units_transferred' => 0,
        ];
        $statusToKey = [
            'available' => 'units_available',
            'reserved' => 'units_reserved',
            'sold' => 'units_sold',
            'transferred' => 'units_transferred',
        ];
        foreach ($units as $row) {
            $unitSummary['total_units'] += (int) $row['cnt'];
            if (isset($statusToKey[$row['status']])) {
                $unitSummary[$statusToKey[$row['status']]] = (int) $row['cnt'];
            }
        }

        // === Transaction counts (active + cancelled) ===
        $activeCount = (int) $this->db->table('sales_transactions')
            ->where('project_id', $projectId)
            ->where('status', 'active')
            ->countAllResults();

        $cancelledCount = (int) $this->db->table('sales_transactions')
            ->where('project_id', $projectId)
            ->where('status', 'cancelled')
            ->countAllResults();

        // === Sales amounts from active transactions only ===
        $sales = $this->db->table('sales_transactions')
            ->select('
                COALESCE(SUM(net_price), 0) AS total_sales_amount,
                COALESCE(SUM(profit), 0) AS total_profit
            ')
            ->where('project_id', $projectId)
            ->where('status', 'active')
            ->get()->getRowArray();

        // === Discount (effective_category='discount') from active transactions ===
        $totalDiscount = (float) $this->db->table('sales_transaction_items sti')
            ->select('COALESCE(SUM(sti.used_value), 0) AS total')
            ->join('sales_transactions st', 'st.id = sti.sales_transaction_id')
            ->where('st.project_id', $projectId)
            ->where('st.status', 'active')
            ->where('sti.effective_category', 'discount')
            ->get()->getRowArray()['total'] ?? 0;

        // === Promo cost (effective_category='premium') from active transactions ===
        $totalPromoCost = (float) $this->db->table('sales_transaction_items sti')
            ->select('COALESCE(SUM(sti.used_value), 0) AS total')
            ->join('sales_transactions st', 'st.id = sti.sales_transaction_id')
            ->where('st.project_id', $projectId)
            ->where('st.status', 'active')
            ->where('sti.effective_category', 'premium')
            ->get()->getRowArray()['total'] ?? 0;

        // === Expense support (effective_category='expense_support') from active transactions ===
        $totalExpenseSupport = (float) $this->db->table('sales_transaction_items sti')
            ->select('COALESCE(SUM(sti.used_value), 0) AS total')
            ->join('sales_transactions st', 'st.id = sti.sales_transaction_id')
            ->where('st.project_id', $projectId)
            ->where('st.status', 'active')
            ->where('sti.effective_category', 'expense_support')
            ->get()->getRowArray()['total'] ?? 0;

        $totalSalesAmount = (float) ($sales['total_sales_amount'] ?? 0);
        $totalProfit = (float) ($sales['total_profit'] ?? 0);
        $totalPromoBurden = $totalPromoCost + $totalExpenseSupport;

        // === Calculate averages ===
        $avgProfitPerUnit = $activeCount > 0 ? round($totalProfit / $activeCount, 2) : 0;
        $avgDiscountPerUnit = $activeCount > 0 ? round($totalDiscount / $activeCount, 2) : 0;

        return [
            'total_units' => $unitSummary['total_units'],
            'units_available' => $unitSummary['units_available'],
            'units_reserved' => $unitSummary['units_reserved'],
            'units_sold' => $unitSummary['units_sold'],
            'units_transferred' => $unitSummary['units_transferred'],
            'total_sales_amount' => $totalSalesAmount,
            'total_discount' => $totalDiscount,
            'total_promo_cost' => $totalPromoCost,
            'total_expense_support' => $totalExpenseSupport,
            'total_promo_burden' => $totalPromoBurden,
            'total_profit' => $totalProfit,
            'avg_profit_per_unit' => $avgProfitPerUnit,
            'avg_discount_per_unit' => $avgDiscountPerUnit,
            'total_transactions_active' => $activeCount,
            'total_transactions_cancelled' => $cancelledCount,
        ];
    }

    /**
     * getBudgetSummary - สรุปภาพรวมงบประมาณของโครงการ
     */
    public function getBudgetSummary(int $projectId): array
    {
        // === Pool Budget ===
        $project = $this->db->table('projects')
            ->select('pool_budget_amount')
            ->where('id', $projectId)
            ->get()->getRowArray();
        $poolBudgetAmount = (float) ($project['pool_budget_amount'] ?? 0);

        // Pool allocated
        $poolAllocated = (float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'PROJECT_POOL')
            ->whereIn('movement_type', self::ALLOCATE_TYPES)
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0;

        // Pool used (USE + SPECIAL_BUDGET_USE)
        $poolUsed = (float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'PROJECT_POOL')
            ->whereIn('movement_type', self::USE_TYPES)
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0;

        // Pool returned (RETURN + SPECIAL_BUDGET_RETURN from PROJECT_POOL + RETURN from UNIT_STANDARD)
        $poolReturned = (float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'PROJECT_POOL')
            ->whereIn('movement_type', self::RETURN_TYPES)
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0;

        // RETURN from UNIT_STANDARD to Pool
        $unitReturnedToPool = (float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'UNIT_STANDARD')
            ->where('movement_type', 'RETURN')
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0;

        $poolReturnedTotal = abs($poolReturned) + abs($unitReturnedToPool);
        $poolRemaining = $poolBudgetAmount - abs($poolAllocated) + $poolReturnedTotal;

        // === UNIT_STANDARD Budget ===
        // Allocated = SUM(project_units.standard_budget)
        $unitStandardAllocated = (float) $this->db->table('project_units')
            ->selectSum('standard_budget', 'total')
            ->where('project_id', $projectId)
            ->get()->getRowArray()['total'] ?? 0;

        // Used = abs(SUM(USE WHERE budget_source_type='UNIT_STANDARD'))
        $unitStandardUsed = abs((float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'UNIT_STANDARD')
            ->where('movement_type', 'USE')
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        // Returned = abs(SUM(RETURN WHERE budget_source_type='UNIT_STANDARD'))
        $unitStandardReturned = abs((float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'UNIT_STANDARD')
            ->where('movement_type', 'RETURN')
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        $unitStandardRemaining = $unitStandardAllocated - $unitStandardUsed - $unitStandardReturned;

        // === MANAGEMENT_SPECIAL Budget ===
        $mgmtAllocated = (float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'MANAGEMENT_SPECIAL')
            ->whereIn('movement_type', ['SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'])
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0;

        $mgmtUsed = abs((float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'MANAGEMENT_SPECIAL')
            ->where('movement_type', 'SPECIAL_BUDGET_USE')
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        $mgmtReturned = abs((float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'MANAGEMENT_SPECIAL')
            ->where('movement_type', 'SPECIAL_BUDGET_RETURN')
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        $mgmtRemaining = $mgmtAllocated - $mgmtUsed - $mgmtReturned;

        $campaignAllocated = (float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type')
            ->whereIn('movement_type', ['SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'])
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0;

        $campaignUsed = abs((float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type')
            ->where('movement_type', 'SPECIAL_BUDGET_USE')
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        $campaignReturned = abs((float) $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type')
            ->where('movement_type', 'SPECIAL_BUDGET_RETURN')
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        $campaignRemaining = $campaignAllocated - $campaignUsed - $campaignReturned;

        // === Totals ===
        $totalAllocated = $poolBudgetAmount + $unitStandardAllocated + $mgmtAllocated + $campaignAllocated;
        $totalUsed = abs($poolUsed) + $unitStandardUsed + $mgmtUsed + $campaignUsed;
        $totalRemaining = $poolRemaining + $unitStandardRemaining + $mgmtRemaining + $campaignRemaining;
        $budgetUtilizationPercent = $totalAllocated > 0 ? round(($totalUsed / $totalAllocated) * 100, 1) : 0;

        return [
            'pool_budget_amount' => $poolBudgetAmount,
            'pool_used' => abs($poolUsed),
            'pool_returned' => $poolReturnedTotal,
            'pool_remaining' => $poolRemaining,
            'total_unit_standard_allocated' => $unitStandardAllocated,
            'total_unit_standard_used' => $unitStandardUsed,
            'total_unit_standard_returned' => $unitStandardReturned,
            'total_unit_standard_remaining' => $unitStandardRemaining,
            'management_special_allocated' => $mgmtAllocated,
            'management_special_used' => $mgmtUsed,
            'management_special_remaining' => $mgmtRemaining,
            'campaign_support_allocated' => $campaignAllocated,
            'campaign_support_used' => $campaignUsed,
            'campaign_support_remaining' => $campaignRemaining,
            'total_budget_allocated' => $totalAllocated,
            'total_budget_used' => $totalUsed,
            'total_budget_remaining' => $totalRemaining,
            'budget_utilization_percent' => $budgetUtilizationPercent,
        ];
    }

    /**
     * getRecentSales - รายการขายล่าสุด
     * แสดงทั้ง active + cancelled (frontend แสดงสีต่างกัน)
     */
    public function getRecentSales(int $projectId, int $limit = 10): array
    {
        $transactions = $this->db->table('sales_transactions st')
            ->select('
                st.id, st.sale_no, st.base_price, st.net_price, st.profit,
                st.sale_date, st.created_at, st.status,
                pu.unit_code, pu.status AS unit_status
            ')
            ->join('project_units pu', 'pu.id = st.unit_id')
            ->where('st.project_id', $projectId)
            ->orderBy('st.created_at', 'DESC')
            ->limit($limit)
            ->get()->getResultArray();

        return array_map(function ($t) {
            return [
                'sale_no' => $t['sale_no'],
                'unit_code' => $t['unit_code'],
                'base_price' => (float) $t['base_price'],
                'net_price' => (float) $t['net_price'],
                'profit' => (float) $t['profit'],
                'sale_date' => $t['sale_date'],
                'created_at' => $t['created_at'],
                'status' => $t['status'],
                'unit_status' => $t['unit_status'],
            ];
        }, $transactions);
    }

    /**
     * getUnitStatusChart - ข้อมูลสำหรับ donut/pie chart
     */
    public function getUnitStatusChart(int $projectId): array
    {
        $units = $this->db->table('project_units')
            ->select('status, COUNT(*) AS count')
            ->where('project_id', $projectId)
            ->groupBy('status')
            ->get()->getResultArray();

        $statusMap = [
            'available' => ['label' => 'ว่าง', 'color' => '#16A34A'],
            'reserved' => ['label' => 'จอง', 'color' => '#F59E0B'],
            'sold' => ['label' => 'ขายแล้ว', 'color' => '#2563EB'],
            'transferred' => ['label' => 'โอนแล้ว', 'color' => '#64748B'],
        ];

        $result = [];
        foreach ($statusMap as $status => $info) {
            $count = 0;
            foreach ($units as $u) {
                if ($u['status'] === $status) {
                    $count = (int) $u['count'];
                    break;
                }
            }
            $result[] = [
                'status' => $status,
                'label' => $info['label'],
                'count' => $count,
                'color' => $info['color'],
            ];
        }

        return $result;
    }

    /**
     * getBudgetUsageBySource - ข้อมูลสำหรับ bar chart
     */
    public function getBudgetUsageBySource(int $projectId): array
    {
        $sources = [
            'UNIT_STANDARD' => 'งบมาตรฐาน',
            'PROJECT_POOL' => 'งบ Pool',
            'MANAGEMENT_SPECIAL' => 'งบผู้บริหาร',
        ];

        $result = [];

        foreach ($sources as $source => $label) {
            // Allocated
            if ($source === 'UNIT_STANDARD') {
                $allocated = (float) $this->db->table('project_units')
                    ->selectSum('standard_budget', 'total')
                    ->where('project_id', $projectId)
                    ->get()->getRowArray()['total'] ?? 0;
            } else {
                $allocated = (float) $this->db->table('budget_movements')
                    ->selectSum('amount', 'total')
                    ->where('project_id', $projectId)
                    ->where('budget_source_type', $source)
                    ->whereIn('movement_type', ['SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'])
                    ->where('status', 'approved')
                    ->get()->getRowArray()['total'] ?? 0;
            }

            // Used
            if ($source === 'UNIT_STANDARD') {
                $usedMovementType = 'USE';
            } elseif ($source === 'PROJECT_POOL') {
                $usedMovementType = ['USE', 'SPECIAL_BUDGET_USE'];
            } else {
                $usedMovementType = 'SPECIAL_BUDGET_USE';
            }

            if (is_array($usedMovementType)) {
                $used = abs((float) $this->db->table('budget_movements')
                    ->selectSum('amount', 'total')
                    ->where('project_id', $projectId)
                    ->where('budget_source_type', $source)
                    ->whereIn('movement_type', $usedMovementType)
                    ->where('status', 'approved')
                    ->get()->getRowArray()['total'] ?? 0);
            } else {
                $used = abs((float) $this->db->table('budget_movements')
                    ->selectSum('amount', 'total')
                    ->where('project_id', $projectId)
                    ->where('budget_source_type', $source)
                    ->where('movement_type', $usedMovementType)
                    ->where('status', 'approved')
                    ->get()->getRowArray()['total'] ?? 0);
            }

            // Returned
            if ($source === 'UNIT_STANDARD') {
                $returnMovementType = 'RETURN';
            } elseif ($source === 'PROJECT_POOL') {
                $returnMovementType = ['RETURN', 'SPECIAL_BUDGET_RETURN'];
            } else {
                $returnMovementType = 'SPECIAL_BUDGET_RETURN';
            }

            if (is_array($returnMovementType)) {
                $returned = abs((float) $this->db->table('budget_movements')
                    ->selectSum('amount', 'total')
                    ->where('project_id', $projectId)
                    ->where('budget_source_type', $source)
                    ->whereIn('movement_type', $returnMovementType)
                    ->where('status', 'approved')
                    ->get()->getRowArray()['total'] ?? 0);
            } else {
                $returned = abs((float) $this->db->table('budget_movements')
                    ->selectSum('amount', 'total')
                    ->where('project_id', $projectId)
                    ->where('budget_source_type', $source)
                    ->where('movement_type', $returnMovementType)
                    ->where('status', 'approved')
                    ->get()->getRowArray()['total'] ?? 0);
            }

            // For PROJECT_POOL, also include RETURN from UNIT_STANDARD
            if ($source === 'PROJECT_POOL') {
                $returned += abs((float) $this->db->table('budget_movements')
                    ->selectSum('amount', 'total')
                    ->where('project_id', $projectId)
                    ->where('budget_source_type', 'UNIT_STANDARD')
                    ->where('movement_type', 'RETURN')
                    ->where('status', 'approved')
                    ->get()->getRowArray()['total'] ?? 0);
            }

            $result[] = [
                'source' => $source,
                'label' => $label,
                'allocated' => $allocated,
                'used' => $used,
                'returned' => $returned,
            ];
        }

        return $result;
    }
}
