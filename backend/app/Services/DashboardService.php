<?php

namespace App\Services;

use App\Models\PhaseModel;
use CodeIgniter\Database\BaseConnection;

/**
 * DashboardService — สรุปยอดขายและ stock ของโครงการ (Sales-Focused Dashboard)
 *
 * กฎสำคัญ:
 * 1. sales_transactions: นับเฉพาะ status = 'active' เท่านั้น
 * 2. ยูนิตที่ "ขายได้" = status IN ('sold', 'transferred')
 * 3. ยูนิตที่ "เหลือ" = status IN ('available', 'reserved')
 * 4. มูลค่าโครงการที่อนุมัติ = SUM(base_price) ของทุก unit
 * 5. ทุก query รองรับ filter ตาม phase_id (optional)
 */
class DashboardService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    // ─── Phase ────────────────────────────────────────────────────────────

    /**
     * ดึงรายการ phase ของโครงการ
     */
    public function getPhases(int $projectId): array
    {
        return (new PhaseModel())->getByProject($projectId);
    }

    // ─── Legacy Reconciliation ────────────────────────────────────────────

    /**
     * getLegacyData — ดึงข้อมูล legacy Dashboard จาก projects table
     * คืน null ถ้ายังไม่ได้ตั้งค่า (ทั้ง 4 ตัวเลข = 0 และ legacy_dashboard_as_of_date IS NULL)
     * project-level เท่านั้น — ไม่กรองตาม phase
     *
     * หมายเหตุ: ไม่มี 'note' ใน response นี้อีกต่อไป — note ย้ายไปอยู่ใน legacy-reconciliation endpoint
     */
    public function getLegacyData(int $projectId): ?array
    {
        $row = $this->db->table('projects')
            ->select([
                'legacy_sold_units',
                'legacy_sold_net_price',
                'legacy_total_discount_amount',
                'legacy_value_achieved',
                'legacy_dashboard_as_of_date',
            ])
            ->where('id', $projectId)
            ->get()->getRowArray();

        if (!$row) {
            return null;
        }

        $soldUnits           = (int)   ($row['legacy_sold_units'] ?? 0);
        $soldNetPrice        = (float) ($row['legacy_sold_net_price'] ?? 0);
        $totalDiscountAmount = (float) ($row['legacy_total_discount_amount'] ?? 0);
        $valueAchieved       = (float) ($row['legacy_value_achieved'] ?? 0);
        $asOfDate            = $row['legacy_dashboard_as_of_date'] ?? null;

        // ถือว่ายังไม่ตั้งค่า → คืน null
        if ($soldUnits === 0 && $soldNetPrice === 0.0 && $totalDiscountAmount === 0.0
            && $valueAchieved === 0.0 && $asOfDate === null) {
            return null;
        }

        return [
            'sold_units'            => $soldUnits,
            'sold_net_price'        => $soldNetPrice,
            'total_discount_amount' => $totalDiscountAmount,
            'value_achieved'        => $valueAchieved,
            'as_of_date'            => $asOfDate,
        ];
    }

    // ─── Dashboard Summary ────────────────────────────────────────────────

    /**
     * getSalesDashboard — ข้อมูลหลักของ Dashboard (Section 1-2)
     */
    public function getSalesDashboard(int $projectId, ?int $phaseId = null): array
    {
        // === จำนวนยูนิตแยกตามกลุ่ม ===
        // sold_units / total_units / approved_project_value → exclude legacy_source
        // เพราะตัวเลขเหล่านี้จะถูกบวกกับ aggregate ของระบบเก่า (projects.legacy_sold_units ฯลฯ)
        // ใน frontend combinedX → ถ้านับ legacy units ที่นี่ด้วยจะซ้ำ
        $soldUnits      = $this->countUnits($projectId, $phaseId, ['sold', 'transferred'], true);
        $remainingUnits = $this->countUnits($projectId, $phaseId, ['available', 'reserved']);
        $totalUnits     = $this->countUnits($projectId, $phaseId, null, true);

        // === มูลค่าขายสุทธิ (จาก active transactions) ===
        // sales_transactions ไม่มี legacy entries (sync caldiscount จะ skip ยูนิตที่มี active tx)
        $soldNetPrice = $this->sumSalesNetPrice($projectId, $phaseId);

        // === มูลค่า stock ที่เหลือ (SUM base_price ของ unit ที่ยังไม่ขาย) ===
        $stockValue = $this->sumBasePrice($projectId, $phaseId, ['available', 'reserved']);

        // === มูลค่าโครงการที่อนุมัติ ===
        // ถ้า user กรอกใน projects.approved_project_value > 0 → ใช้ override + ไม่บวก legacy ที่ frontend
        // ถ้า NULL/0 → fallback SUM(unit_cost) ของระบบใหม่ + frontend บวก legacy_unit_cost_sum
        $project = $this->db->table('projects')
            ->select('approved_project_value')
            ->where('id', $projectId)
            ->get()->getRowArray();
        $userApproved = $project['approved_project_value'] ?? null;
        $approvedFromUserInput = $userApproved !== null && (float) $userApproved > 0;
        $approvedProjectValue = $approvedFromUserInput
            ? (float) $userApproved
            : $this->sumUnitCost($projectId, $phaseId, null, true);

        // === Legacy units stats (ราย unit ที่ flag legacy_source = caldiscount) ===
        // ใช้ frontend คำนวณ combined ใน Section 4 "สรุปทั้งโครงการ"
        $legacyUnitStats = $this->getLegacyUnitStats($projectId, $phaseId);

        return [
            'sold_units'                  => $soldUnits,
            'sold_net_price'              => $soldNetPrice,
            'avg_price_sold'              => $soldUnits > 0 ? round($soldNetPrice / $soldUnits, 2) : 0,
            'remaining_units'             => $remainingUnits,
            'stock_value'                 => $stockValue,
            'avg_price_remaining'         => $remainingUnits > 0 ? round($stockValue / $remainingUnits, 2) : 0,
            'total_units'                 => $totalUnits,
            'approved_project_value'      => $approvedProjectValue,
            'approved_from_user_input'    => $approvedFromUserInput,
            'legacy_unit_count'           => $legacyUnitStats['count'],
            'legacy_unit_cost_sum'        => $legacyUnitStats['cost_sum'],
        ];
    }

    // ─── Discount Calculation ─────────────────────────────────────────────

    /**
     * calculateDiscount — คำนวณส่วนลดประมาณการสำหรับยูนิตที่ยังไม่ขาย
     */
    public function calculateDiscount(int $projectId, ?int $phaseId, float $discount): array
    {
        $dashboard = $this->getSalesDashboard($projectId, $phaseId);

        $remainingUnits       = $dashboard['remaining_units'];
        $stockValue           = $dashboard['stock_value'];
        $soldNetPrice         = $dashboard['sold_net_price'];
        $totalUnits           = $dashboard['total_units'];
        $approvedProjectValue = $dashboard['approved_project_value'];

        // คำนวณมูลค่าประมาณการหลังหักส่วนลด
        $totalDiscountAmount = $remainingUnits * $discount;
        $netAfterDiscount    = $stockValue - $totalDiscountAmount;
        $avgAfterDiscount    = $remainingUnits > 0 ? round($netAfterDiscount / $remainingUnits, 2) : 0;
        $discountPercent     = $stockValue > 0 ? round(($totalDiscountAmount / $stockValue) * 100, 2) : 0;

        // สรุปทั้งโครงการ
        $projectNetSales   = $soldNetPrice + $netAfterDiscount;
        $avgPriceProject   = $totalUnits > 0 ? round($projectNetSales / $totalUnits, 2) : 0;
        $valueAchieved     = $projectNetSales;
        $valueDifference   = $valueAchieved - $approvedProjectValue;
        $differencePercent = $approvedProjectValue > 0 ? round(($valueDifference / $approvedProjectValue) * 100, 2) : 0;

        return [
            // Section 3 ขวา — มูลค่าประมาณการ
            'net_after_discount'         => round($netAfterDiscount, 2),
            'avg_after_discount'         => $avgAfterDiscount,
            'total_discount_amount'      => round($totalDiscountAmount, 2),
            'discount_percent'           => $discountPercent,
            // Section 4 — สรุปทั้งโครงการ (ค่า "ระบบใหม่ล้วน" — frontend คำนวณ combined เอง)
            'project_net_sales'          => round($projectNetSales, 2),
            'avg_price_project'          => $avgPriceProject,
            'approved_project_value'     => $approvedProjectValue,
            'approved_from_user_input'   => $dashboard['approved_from_user_input'],
            'value_achieved'             => round($valueAchieved, 2),
            'value_difference'           => round($valueDifference, 2),
            'difference_percent'         => $differencePercent,
            // echo back สำหรับ frontend
            'remaining_units'            => $remainingUnits,
            'stock_value'                => $stockValue,
            'sold_net_price'             => $soldNetPrice,
            'total_units'                => $totalUnits,
            // legacy unit stats — ส่งต่อให้ frontend ใช้คำนวณ combined ใน Section 4
            'legacy_unit_count'          => $dashboard['legacy_unit_count'],
            'legacy_unit_cost_sum'       => $dashboard['legacy_unit_cost_sum'],
        ];
    }

    // ─── Private Helpers ──────────────────────────────────────────────────

    /**
     * Stats ของ unit ที่ flag legacy_source (เช่น caldiscount) — สำหรับ Section 4 combined
     * cost_sum = SUM(unit_cost) ใช้รวมกับ approved_project_value (= ต้นทุนรวม)
     */
    private function getLegacyUnitStats(int $projectId, ?int $phaseId): array
    {
        $builder = $this->db->table('project_units')
            ->where('project_id', $projectId)
            ->where('legacy_source IS NOT NULL', null, false);

        if ($phaseId !== null) {
            $builder->where('phase_id', $phaseId);
        }

        $row = $builder->select('COUNT(*) AS cnt, COALESCE(SUM(unit_cost), 0) AS cost_sum')
            ->get()->getRowArray();

        return [
            'count'    => (int) ($row['cnt'] ?? 0),
            'cost_sum' => (float) ($row['cost_sum'] ?? 0),
        ];
    }

    /**
     * SUM(unit_cost) ของ unit ตาม status (ใช้กับ approved_project_value)
     * $excludeLegacy = true → ข้าม unit ที่ flag legacy_source
     */
    private function sumUnitCost(int $projectId, ?int $phaseId, ?array $statuses = null, bool $excludeLegacy = false): float
    {
        $builder = $this->db->table('project_units')
            ->selectSum('unit_cost', 'total')
            ->where('project_id', $projectId);

        if ($phaseId !== null) {
            $builder->where('phase_id', $phaseId);
        }

        if ($statuses !== null) {
            $builder->whereIn('status', $statuses);
        }

        if ($excludeLegacy) {
            $builder->where('legacy_source IS NULL', null, false);
        }

        return (float) ($builder->get()->getRowArray()['total'] ?? 0);
    }

    /**
     * นับจำนวน unit ตาม status (ถ้าไม่ระบุ = นับทั้งหมด)
     * $excludeLegacy = true → ข้าม unit ที่ flag legacy_source (เช่น caldiscount)
     */
    private function countUnits(int $projectId, ?int $phaseId, ?array $statuses = null, bool $excludeLegacy = false): int
    {
        $builder = $this->db->table('project_units')
            ->where('project_id', $projectId);

        if ($phaseId !== null) {
            $builder->where('phase_id', $phaseId);
        }

        if ($statuses !== null) {
            $builder->whereIn('status', $statuses);
        }

        if ($excludeLegacy) {
            $builder->where('legacy_source IS NULL', null, false);
        }

        return (int) $builder->countAllResults();
    }

    /**
     * SUM(base_price) ของ unit ตาม status (ถ้าไม่ระบุ = ทุก unit)
     * $excludeLegacy = true → ข้าม unit ที่ flag legacy_source
     */
    private function sumBasePrice(int $projectId, ?int $phaseId, ?array $statuses = null, bool $excludeLegacy = false): float
    {
        $builder = $this->db->table('project_units')
            ->selectSum('base_price', 'total')
            ->where('project_id', $projectId);

        if ($phaseId !== null) {
            $builder->where('phase_id', $phaseId);
        }

        if ($statuses !== null) {
            $builder->whereIn('status', $statuses);
        }

        if ($excludeLegacy) {
            $builder->where('legacy_source IS NULL', null, false);
        }

        return (float) ($builder->get()->getRowArray()['total'] ?? 0);
    }

    /**
     * SUM(net_price) จาก active sales_transactions (JOIN ผ่าน project_units เพื่อ filter phase)
     */
    private function sumSalesNetPrice(int $projectId, ?int $phaseId): float
    {
        $builder = $this->db->table('sales_transactions st')
            ->select('COALESCE(SUM(st.net_price), 0) AS total')
            ->where('st.project_id', $projectId)
            ->where('st.status', 'active');

        if ($phaseId !== null) {
            $builder->join('project_units pu', 'pu.id = st.unit_id')
                    ->where('pu.phase_id', $phaseId);
        }

        return (float) ($builder->get()->getRowArray()['total'] ?? 0);
    }
}
