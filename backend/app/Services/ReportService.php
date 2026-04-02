<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;

/**
 * ReportService — รายงาน 3 ประเภท: ยอดขาย, งบประมาณ, การใช้โปรโมชั่น
 *
 * กฎสำคัญ:
 * 1. sale_transactions.status: ENUM('active','cancelled')
 *    - summary นับเฉพาะ active (ไม่รวม cancelled ใน total_profit/total_discount ฯลฯ)
 *    - items แสดงทั้ง active + cancelled (ตาม filter)
 * 2. budget_movements.status: approved/voided — voided ไม่นับใน balance
 * 3. movement_type รวม RETURN — คืนงบยูนิตเข้า Pool
 * 4. total_discount ใช้ effective_category = 'discount' (ไม่ใช่ promotion_category)
 * 5. profit = net_price - total_promo_burden - unit_cost
 *    (net_after_promo = net_price - total_promo_burden)
 * 6. profit_margin_percent = (profit / net_price) × 100
 */
class ReportService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    // ═══════════════════════════════════════════════════════════════════
    // 1. Sales Report
    // ═══════════════════════════════════════════════════════════════════

    /**
     * getSalesReport — รายงานยอดขาย
     *
     * @param int   $projectId
     * @param array $filters  date_from, date_to, house_model_id, transaction_status, unit_type_id, page, per_page
     */
    public function getSalesReport(int $projectId, array $filters): array
    {
        $page    = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 50)));
        $offset  = ($page - 1) * $perPage;

        $transactionStatus = $filters['transaction_status'] ?? 'all';

        // ── Summary (เฉพาะ active) ───────────────────────────────────
        $summary = $this->buildSalesSummary($projectId, $filters);

        // ── Items (ตาม filter transaction_status) ────────────────────
        $builder = $this->buildSalesItemsQuery($projectId, $filters);

        // Count total
        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults(false);

        // Fetch page
        $rows = $builder
            ->orderBy('st.sale_date', 'DESC')
            ->orderBy('st.id', 'DESC')
            ->limit($perPage, $offset)
            ->get()->getResultArray();

        // Enrich items with promotion_items breakdown
        $items = $this->enrichSalesItems($rows);

        return [
            'summary'    => $summary,
            'items'      => $items,
            'pagination' => [
                'page'     => $page,
                'per_page' => $perPage,
                'total'    => $total,
            ],
        ];
    }

    /**
     * buildSalesSummary — summary เฉพาะ active transactions
     */
    private function buildSalesSummary(int $projectId, array $filters): array
    {
        // Active count
        $activeCount = (int) $this->db->table('sales_transactions')
            ->where('project_id', $projectId)
            ->where('status', 'active')
            ->countAllResults();

        // Cancelled count
        $cancelledCount = (int) $this->db->table('sales_transactions')
            ->where('project_id', $projectId)
            ->where('status', 'cancelled')
            ->countAllResults();

        // Aggregate amounts from active only (with date filters)
        $aggBuilder = $this->db->table('sales_transactions st')
            ->select('
                COALESCE(SUM(st.base_price), 0) AS total_base_price,
                COALESCE(SUM(st.total_discount), 0) AS total_discount,
                COALESCE(SUM(st.net_price), 0) AS total_net_price,
                COALESCE(SUM(st.total_promo_cost), 0) AS total_promo_cost,
                COALESCE(SUM(st.total_expense_support), 0) AS total_expense_support,
                COALESCE(SUM(st.total_promo_burden), 0) AS total_promo_burden,
                COALESCE(SUM(st.unit_cost), 0) AS total_unit_cost,
                COALESCE(SUM(st.total_cost), 0) AS total_cost,
                COALESCE(SUM(st.profit), 0) AS total_profit
            ')
            ->where('st.project_id', $projectId)
            ->where('st.status', 'active');

        // Date filters apply to summary too
        if (!empty($filters['date_from'])) {
            $aggBuilder->where('st.sale_date >=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $aggBuilder->where('st.sale_date <=', $filters['date_to']);
        }

        $agg = $aggBuilder->get()->getRowArray();

        $totalNetPrice = (float) ($agg['total_net_price'] ?? 0);
        $totalProfit   = (float) ($agg['total_profit'] ?? 0);
        $avgProfitMargin = $totalNetPrice > 0
            ? round(($totalProfit / $totalNetPrice) * 100, 2)
            : 0;

        return [
            'total_transactions'           => $activeCount + $cancelledCount,
            'total_transactions_active'    => $activeCount,
            'total_transactions_cancelled' => $cancelledCount,
            'total_base_price'             => (float) ($agg['total_base_price'] ?? 0),
            'total_discount'               => (float) ($agg['total_discount'] ?? 0),
            'total_net_price'              => $totalNetPrice,
            'total_promo_cost'             => (float) ($agg['total_promo_cost'] ?? 0),
            'total_expense_support'        => (float) ($agg['total_expense_support'] ?? 0),
            'total_promo_burden'           => (float) ($agg['total_promo_burden'] ?? 0),
            'total_unit_cost'              => (float) ($agg['total_unit_cost'] ?? 0),
            'total_cost'                   => (float) ($agg['total_cost'] ?? 0),
            'total_profit'                 => $totalProfit,
            'avg_profit_margin_percent'    => $avgProfitMargin,
        ];
    }

    /**
     * buildSalesItemsQuery — build query for items (respects all filters including transaction_status)
     */
    private function buildSalesItemsQuery(int $projectId, array $filters)
    {
        $builder = $this->db->table('sales_transactions st')
            ->select('
                st.id,
                st.sale_no,
                st.sale_date,
                st.base_price,
                st.total_discount,
                st.net_price,
                st.total_promo_cost,
                st.total_expense_support,
                st.total_promo_burden,
                st.unit_cost,
                st.total_cost,
                st.profit,
                st.status,
                st.cancelled_at,
                st.cancel_reason,
                st.transfer_date,
                pu.unit_code,
                pu.status AS unit_status,
                hm.name AS house_model_name
            ')
            ->join('project_units pu', 'pu.id = st.unit_id', 'left')
            ->join('house_models hm', 'hm.id = pu.house_model_id', 'left')
            ->where('st.project_id', $projectId);

        // Filter: transaction_status
        $txStatus = $filters['transaction_status'] ?? 'all';
        if ($txStatus === 'active') {
            $builder->where('st.status', 'active');
        } elseif ($txStatus === 'cancelled') {
            $builder->where('st.status', 'cancelled');
        }
        // 'all' → no filter

        // Filter: date range
        if (!empty($filters['date_from'])) {
            $builder->where('st.sale_date >=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $builder->where('st.sale_date <=', $filters['date_to']);
        }

        // Filter: house_model_id
        if (!empty($filters['house_model_id'])) {
            $builder->where('pu.house_model_id', (int) $filters['house_model_id']);
        }

        // Filter: unit_type_id
        if (!empty($filters['unit_type_id'])) {
            $builder->where('pu.unit_type_id', (int) $filters['unit_type_id']);
        }

        return $builder;
    }

    /**
     * enrichSalesItems — เพิ่ม promotion_items, net_after_promo, profit_margin_percent
     */
    private function enrichSalesItems(array $rows): array
    {
        if (empty($rows)) return [];

        $txIds = array_column($rows, 'id');

        // ดึง promotion items ทั้งหมดในครั้งเดียว
        $promoItems = $this->db->table('sales_transaction_items sti')
            ->select('sti.sales_transaction_id, sti.used_value, sti.effective_category, pim.name')
            ->join('promotion_item_master pim', 'pim.id = sti.promotion_item_id', 'left')
            ->whereIn('sti.sales_transaction_id', $txIds)
            ->get()->getResultArray();

        // Group by transaction_id
        $promoMap = [];
        foreach ($promoItems as $pi) {
            $txId = (int) $pi['sales_transaction_id'];
            $promoMap[$txId][] = [
                'name'               => $pi['name'],
                'effective_category' => $pi['effective_category'],
                'used_value'         => (float) $pi['used_value'],
            ];
        }

        return array_map(function ($row) use ($promoMap) {
            $netPrice       = (float) $row['net_price'];
            $totalPromoBurden = (float) $row['total_promo_burden'];
            $unitCost       = (float) $row['unit_cost'];
            $netAfterPromo  = $netPrice - $totalPromoBurden;
            $profit         = (float) $row['profit'];
            $profitMargin   = $netPrice > 0 ? round(($profit / $netPrice) * 100, 2) : 0;

            return [
                'sale_no'              => $row['sale_no'],
                'sale_date'            => $row['sale_date'],
                'unit_code'            => $row['unit_code'],
                'house_model_name'     => $row['house_model_name'],
                'base_price'           => (float) $row['base_price'],
                'total_discount'       => (float) $row['total_discount'],
                'net_price'            => $netPrice,
                'net_after_promo'      => $netAfterPromo,
                'unit_cost'            => $unitCost,
                'total_promo_cost'     => (float) $row['total_promo_cost'],
                'total_expense_support' => (float) $row['total_expense_support'],
                'total_promo_burden'   => $totalPromoBurden,
                'profit'               => $profit,
                'profit_margin_percent' => $profitMargin,
                'status'               => $row['status'],
                'unit_status'          => $row['unit_status'],
                'transfer_date'        => $row['transfer_date'],
                'cancelled_at'         => $row['cancelled_at'],
                'cancel_reason'        => $row['cancel_reason'],
                'promotion_items'      => $promoMap[(int) $row['id']] ?? [],
            ];
        }, $rows);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Budget Report
    // ═══════════════════════════════════════════════════════════════════

    /**
     * getBudgetReport — รายงานงบประมาณ
     *
     * @param int   $projectId
     * @param array $filters  budget_source_type, movement_type, movement_status, date_from, date_to, page, per_page
     */
    public function getBudgetReport(int $projectId, array $filters): array
    {
        $page    = max(1, (int) ($filters['page'] ?? 1));
        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 50)));
        $offset  = ($page - 1) * $perPage;

        // ── Summary (derive จาก movements WHERE status='approved') ────
        $summary = $this->buildBudgetSummary($projectId);

        // ── Movements list (with filters) ────────────────────────────
        $builder = $this->buildBudgetMovementsQuery($projectId, $filters);

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults(false);

        $rows = $builder
            ->orderBy('bm.created_at', 'DESC')
            ->orderBy('bm.id', 'DESC')
            ->limit($perPage, $offset)
            ->get()->getResultArray();

        $movements = array_map(function ($row) {
            return [
                'movement_no'       => $row['movement_no'],
                'movement_type'     => $row['movement_type'],
                'budget_source_type' => $row['budget_source_type'],
                'amount'            => (float) $row['amount'],
                'unit_code'         => $row['unit_code'],
                'sale_no'           => $row['sale_no'],
                'note'              => $row['note'],
                'status'            => $row['status'],
                'created_at'        => $row['created_at'],
                'created_by_name'   => $row['created_by_name'],
            ];
        }, $rows);

        return [
            'summary'    => $summary,
            'movements'  => $movements,
            'pagination' => [
                'page'     => $page,
                'per_page' => $perPage,
                'total'    => $total,
            ],
        ];
    }

    /**
     * buildBudgetSummary — สรุปงบประมาณ by source (เฉพาะ approved)
     */
    private function buildBudgetSummary(int $projectId): array
    {
        $sources = [
            'UNIT_STANDARD'      => 'งบมาตรฐาน',
            'PROJECT_POOL'       => 'งบ Pool',
            'MANAGEMENT_SPECIAL' => 'งบผู้บริหาร',
        ];

        $allocateTypes = ['ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE', 'POOL_INIT'];
        $useTypes      = ['USE', 'SPECIAL_BUDGET_USE'];
        $returnTypes   = ['RETURN', 'SPECIAL_BUDGET_RETURN'];

        $bySource    = [];
        $grandAlloc  = 0;
        $grandUsed   = 0;
        $grandReturn = 0;

        foreach ($sources as $source => $label) {
            // Allocated
            if ($source === 'UNIT_STANDARD') {
                // งบมาตรฐานมาจาก standard_budget ของยูนิต (ไม่ได้มาจาก movements)
                $allocated = (float) ($this->db->table('project_units')
                    ->selectSum('standard_budget', 'total')
                    ->where('project_id', $projectId)
                    ->get()->getRowArray()['total'] ?? 0);
            } else {
                $allocated = abs((float) ($this->db->table('budget_movements')
                    ->selectSum('amount', 'total')
                    ->where('project_id', $projectId)
                    ->where('budget_source_type', $source)
                    ->whereIn('movement_type', $allocateTypes)
                    ->where('status', 'approved')
                    ->get()->getRowArray()['total'] ?? 0));
            }

            // Used
            $used = abs((float) ($this->db->table('budget_movements')
                ->selectSum('amount', 'total')
                ->where('project_id', $projectId)
                ->where('budget_source_type', $source)
                ->whereIn('movement_type', $useTypes)
                ->where('status', 'approved')
                ->get()->getRowArray()['total'] ?? 0));

            // Returned
            $returned = abs((float) ($this->db->table('budget_movements')
                ->selectSum('amount', 'total')
                ->where('project_id', $projectId)
                ->where('budget_source_type', $source)
                ->whereIn('movement_type', $returnTypes)
                ->where('status', 'approved')
                ->get()->getRowArray()['total'] ?? 0));

            $remaining = $allocated - $used - $returned;

            $bySource[] = [
                'source'    => $source,
                'label'     => $label,
                'allocated' => $allocated,
                'used'      => $used,
                'returned'  => $returned,
                'remaining' => $remaining,
            ];

            $grandAlloc  += $allocated;
            $grandUsed   += $used;
            $grandReturn += $returned;
        }

        // Total voided
        $totalVoided = abs((float) ($this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('status', 'voided')
            ->get()->getRowArray()['total'] ?? 0));

        $grandRemaining = $grandAlloc - $grandUsed - $grandReturn;
        $utilization    = $grandAlloc > 0 ? round(($grandUsed / $grandAlloc) * 100, 1) : 0;

        return [
            'total_allocated'     => $grandAlloc,
            'total_used'          => $grandUsed,
            'total_returned'      => $grandReturn,
            'total_voided'        => $totalVoided,
            'total_remaining'     => $grandRemaining,
            'utilization_percent' => $utilization,
            'by_source'           => $bySource,
        ];
    }

    /**
     * buildBudgetMovementsQuery — query movements with filters
     */
    private function buildBudgetMovementsQuery(int $projectId, array $filters)
    {
        $builder = $this->db->table('budget_movements bm')
            ->select('
                bm.movement_no,
                bm.movement_type,
                bm.budget_source_type,
                bm.amount,
                bm.note,
                bm.status,
                bm.created_at,
                pu.unit_code,
                st.sale_no,
                u.name AS created_by_name
            ')
            ->join('project_units pu', 'pu.id = bm.unit_id', 'left')
            ->join('sales_transactions st', 'st.id = bm.sale_transaction_id', 'left')
            ->join('users u', 'u.id = bm.created_by', 'left')
            ->where('bm.project_id', $projectId);

        // Filter: budget_source_type
        if (!empty($filters['budget_source_type']) && $filters['budget_source_type'] !== 'all') {
            $builder->where('bm.budget_source_type', $filters['budget_source_type']);
        }

        // Filter: movement_type
        if (!empty($filters['movement_type']) && $filters['movement_type'] !== 'all') {
            $builder->where('bm.movement_type', $filters['movement_type']);
        }

        // Filter: movement_status
        if (!empty($filters['movement_status']) && $filters['movement_status'] !== 'all') {
            $builder->where('bm.status', $filters['movement_status']);
        }

        // Filter: date range
        if (!empty($filters['date_from'])) {
            $builder->where('bm.created_at >=', $filters['date_from'] . ' 00:00:00');
        }
        if (!empty($filters['date_to'])) {
            $builder->where('bm.created_at <=', $filters['date_to'] . ' 23:59:59');
        }

        return $builder;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Promotion Usage Report
    // ═══════════════════════════════════════════════════════════════════

    /**
     * getPromotionUsageReport — รายงานการใช้โปรโมชั่น
     *
     * @param int   $projectId
     * @param array $filters  promotion_category, effective_category, date_from, date_to
     */
    public function getPromotionUsageReport(int $projectId, array $filters): array
    {
        // ── Summary ──────────────────────────────────────────────────
        $summary = $this->buildPromotionUsageSummary($projectId, $filters);

        // ── Items (grouped by promotion_item_id) ─────────────────────
        $items = $this->buildPromotionUsageItems($projectId, $filters);

        return [
            'summary' => $summary,
            'items'   => $items,
        ];
    }

    /**
     * buildPromotionUsageSummary — สรุปการใช้โปรโมชั่น
     */
    private function buildPromotionUsageSummary(int $projectId, array $filters): array
    {
        // Base builder for active transactions
        $baseBuilder = $this->db->table('sales_transaction_items sti')
            ->join('sales_transactions st', 'st.id = sti.sales_transaction_id')
            ->where('st.project_id', $projectId)
            ->where('st.status', 'active');

        if (!empty($filters['date_from'])) {
            $baseBuilder->where('st.sale_date >=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $baseBuilder->where('st.sale_date <=', $filters['date_to']);
        }

        // Total items used
        $totalItems = (int) (clone $baseBuilder)->select('COUNT(*) AS cnt')
            ->get()->getRowArray()['cnt'];

        // Total by effective_category
        $totalDiscount = (float) ((clone $baseBuilder)
            ->select('COALESCE(SUM(sti.used_value), 0) AS total')
            ->where('sti.effective_category', 'discount')
            ->get()->getRowArray()['total'] ?? 0);

        $totalPremium = (float) ((clone $baseBuilder)
            ->select('COALESCE(SUM(sti.used_value), 0) AS total')
            ->where('sti.effective_category', 'premium')
            ->get()->getRowArray()['total'] ?? 0);

        $totalExpense = (float) ((clone $baseBuilder)
            ->select('COALESCE(SUM(sti.used_value), 0) AS total')
            ->where('sti.effective_category', 'expense_support')
            ->get()->getRowArray()['total'] ?? 0);

        // total_converted_to_discount: premium items ที่ effective=discount
        $totalConverted = (float) ((clone $baseBuilder)
            ->select('COALESCE(SUM(sti.used_value), 0) AS total')
            ->where('sti.original_category', 'premium')
            ->where('sti.effective_category', 'discount')
            ->get()->getRowArray()['total'] ?? 0);

        // Top used items (top 10)
        $topUsed = $this->db->table('sales_transaction_items sti')
            ->select('pim.name AS item_name, COUNT(*) AS times_used, COALESCE(SUM(sti.used_value), 0) AS total_value')
            ->join('sales_transactions st', 'st.id = sti.sales_transaction_id')
            ->join('promotion_item_master pim', 'pim.id = sti.promotion_item_id', 'left')
            ->where('st.project_id', $projectId)
            ->where('st.status', 'active')
            ->groupBy('sti.promotion_item_id')
            ->orderBy('times_used', 'DESC')
            ->limit(10)
            ->get()->getResultArray();

        $topItems = array_map(function ($row) {
            return [
                'item_name'  => $row['item_name'],
                'times_used' => (int) $row['times_used'],
                'total_value' => (float) $row['total_value'],
            ];
        }, $topUsed);

        return [
            'total_items_used'             => $totalItems,
            'total_discount_amount'        => $totalDiscount,
            'total_premium_amount'         => $totalPremium,
            'total_expense_support_amount' => $totalExpense,
            'total_converted_to_discount'  => $totalConverted,
            'top_used_items'               => $topItems,
        ];
    }

    /**
     * buildPromotionUsageItems — รายการใช้โปรโมชั่น group by item
     */
    private function buildPromotionUsageItems(int $projectId, array $filters): array
    {
        $builder = $this->db->table('sales_transaction_items sti')
            ->select('
                pim.code AS item_code,
                pim.name AS item_name,
                pim.category AS promotion_category,
                COUNT(*) AS times_used,
                COALESCE(SUM(sti.used_value), 0) AS total_used_value,
                COALESCE(AVG(sti.used_value), 0) AS avg_used_value,
                COALESCE(MIN(sti.used_value), 0) AS min_used_value,
                COALESCE(MAX(sti.used_value), 0) AS max_used_value,
                COALESCE(SUM(CASE WHEN sti.original_category = \'premium\' AND sti.effective_category = \'discount\' THEN sti.used_value ELSE 0 END), 0) AS total_converted
            ')
            ->join('sales_transactions st', 'st.id = sti.sales_transaction_id')
            ->join('promotion_item_master pim', 'pim.id = sti.promotion_item_id', 'left')
            ->where('st.project_id', $projectId)
            ->where('st.status', 'active');

        // Filter: promotion_category
        if (!empty($filters['promotion_category']) && $filters['promotion_category'] !== 'all') {
            $builder->where('pim.category', $filters['promotion_category']);
        }

        // Filter: effective_category
        if (!empty($filters['effective_category']) && $filters['effective_category'] !== 'all') {
            $builder->where('sti.effective_category', $filters['effective_category']);
        }

        // Filter: date range
        if (!empty($filters['date_from'])) {
            $builder->where('st.sale_date >=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $builder->where('st.sale_date <=', $filters['date_to']);
        }

        $rows = $builder
            ->groupBy('sti.promotion_item_id')
            ->orderBy('times_used', 'DESC')
            ->get()->getResultArray();

        return array_map(function ($row) {
            return [
                'item_code'          => $row['item_code'],
                'item_name'          => $row['item_name'],
                'promotion_category' => $row['promotion_category'],
                'times_used'         => (int) $row['times_used'],
                'total_used_value'   => (float) $row['total_used_value'],
                'avg_used_value'     => round((float) $row['avg_used_value'], 2),
                'min_used_value'     => (float) $row['min_used_value'],
                'max_used_value'     => (float) $row['max_used_value'],
                'total_converted'    => (float) $row['total_converted'],
            ];
        }, $rows);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. CSV Exports
    // ═══════════════════════════════════════════════════════════════════

    /**
     * exportSalesCSV — export รายงานยอดขายเป็น CSV
     *
     * @return string CSV content (UTF-8 BOM)
     */
    public function exportSalesCSV(int $projectId, array $filters): string
    {
        $builder = $this->buildSalesItemsQuery($projectId, $filters);
        $rows = $builder
            ->orderBy('st.sale_date', 'DESC')
            ->orderBy('st.id', 'DESC')
            ->get()->getResultArray();

        $items = $this->enrichSalesItems($rows);

        // UTF-8 BOM
        $csv = "\xEF\xBB\xBF";

        // Header row
        $headers = [
            'เลขที่ขาย',
            'วันที่',
            'ยูนิต',
            'แบบบ้าน',
            'ราคาขาย',
            'ส่วนลด',
            'ราคาสุทธิ',
            'สุทธิหลังของแถม',
            'ต้นทุนยูนิต',
            'ต้นทุนจากของแถม',
            'กำไร',
            '% กำไร',
            'สถานะ',
            'วันที่โอน',
            'วันที่ยกเลิก',
            'เหตุผลยกเลิก',
        ];
        $csv .= implode(',', $headers) . "\r\n";

        // Data rows
        foreach ($items as $item) {
            $statusLabel = $item['status'] === 'active' ? 'ปกติ' : 'ยกเลิก';

            $row = [
                $this->csvEscape($item['sale_no']),
                $this->csvEscape($item['sale_date']),
                $this->csvEscape($item['unit_code']),
                $this->csvEscape($item['house_model_name'] ?? ''),
                $item['base_price'],
                $item['total_discount'],
                $item['net_price'],
                $item['net_after_promo'],
                $item['unit_cost'],
                $item['total_promo_burden'],
                $item['profit'],
                $item['profit_margin_percent'],
                $this->csvEscape($statusLabel),
                $this->csvEscape($item['transfer_date'] ?? ''),
                $this->csvEscape($item['cancelled_at'] ?? ''),
                $this->csvEscape($item['cancel_reason'] ?? ''),
            ];
            $csv .= implode(',', $row) . "\r\n";
        }

        return $csv;
    }

    /**
     * exportBudgetCSV — export รายงานงบประมาณเป็น CSV
     *
     * @return string CSV content (UTF-8 BOM)
     */
    public function exportBudgetCSV(int $projectId, array $filters): string
    {
        $builder = $this->buildBudgetMovementsQuery($projectId, $filters);
        $rows = $builder
            ->orderBy('bm.created_at', 'DESC')
            ->orderBy('bm.id', 'DESC')
            ->get()->getResultArray();

        $typeLabels = [
            'ALLOCATE'                    => 'จัดสรร',
            'USE'                         => 'ใช้',
            'RETURN'                      => 'คืน',
            'ADJUST'                      => 'ปรับปรุง',
            'SPECIAL_BUDGET_ADD'          => 'เพิ่มงบพิเศษ',
            'SPECIAL_BUDGET_ALLOCATE'     => 'จัดสรรงบพิเศษ',
            'SPECIAL_BUDGET_USE'          => 'ใช้งบพิเศษ',
            'SPECIAL_BUDGET_RETURN'       => 'คืนงบพิเศษ',
            'SPECIAL_BUDGET_TRANSFER_OUT' => 'โอนงบพิเศษออก',
            'SPECIAL_BUDGET_TRANSFER_IN'  => 'โอนงบพิเศษเข้า',
            'SPECIAL_BUDGET_VOID'         => 'ยกเลิกงบพิเศษ',
            'POOL_INIT'                   => 'ตั้งงบ Pool',
        ];

        $sourceLabels = [
            'UNIT_STANDARD'      => 'งบมาตรฐาน',
            'PROJECT_POOL'       => 'งบ Pool',
            'MANAGEMENT_SPECIAL' => 'งบผู้บริหาร',
        ];

        $statusLabels = [
            'approved' => 'อนุมัติ',
            'pending'  => 'รออนุมัติ',
            'rejected' => 'ปฏิเสธ',
            'voided'   => 'ยกเลิก',
        ];

        // UTF-8 BOM
        $csv = "\xEF\xBB\xBF";

        // Header
        $headers = [
            'เลขที่',
            'ประเภท',
            'แหล่งงบ',
            'จำนวนเงิน',
            'ยูนิต',
            'เลขที่ขาย',
            'หมายเหตุ',
            'สถานะ',
            'วันที่',
            'ผู้ทำรายการ',
        ];
        $csv .= implode(',', $headers) . "\r\n";

        // Data
        foreach ($rows as $row) {
            $line = [
                $this->csvEscape($row['movement_no']),
                $this->csvEscape($typeLabels[$row['movement_type']] ?? $row['movement_type']),
                $this->csvEscape($sourceLabels[$row['budget_source_type']] ?? $row['budget_source_type']),
                (float) $row['amount'],
                $this->csvEscape($row['unit_code'] ?? ''),
                $this->csvEscape($row['sale_no'] ?? ''),
                $this->csvEscape($row['note'] ?? ''),
                $this->csvEscape($statusLabels[$row['status']] ?? $row['status']),
                $this->csvEscape($row['created_at'] ?? ''),
                $this->csvEscape($row['created_by_name'] ?? ''),
            ];
            $csv .= implode(',', $line) . "\r\n";
        }

        return $csv;
    }

    /**
     * csvEscape — escape value สำหรับ CSV (double-quote if needed)
     */
    private function csvEscape(?string $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        // ถ้ามี comma, quote, newline → wrap ใน double-quote
        if (str_contains($value, ',') || str_contains($value, '"') || str_contains($value, "\n") || str_contains($value, "\r")) {
            return '"' . str_replace('"', '""', $value) . '"';
        }
        return $value;
    }
}
