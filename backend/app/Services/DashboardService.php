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

    // ─── Dashboard Summary ────────────────────────────────────────────────

    /**
     * getSalesDashboard — ข้อมูลหลักของ Dashboard (Section 1-2)
     */
    public function getSalesDashboard(int $projectId, ?int $phaseId = null): array
    {
        // === จำนวนยูนิตแยกตามกลุ่ม ===
        $soldUnits      = $this->countUnits($projectId, $phaseId, ['sold', 'transferred']);
        $remainingUnits = $this->countUnits($projectId, $phaseId, ['available', 'reserved']);
        $totalUnits     = $this->countUnits($projectId, $phaseId);

        // === มูลค่าขายสุทธิ (จาก active transactions) ===
        $soldNetPrice = $this->sumSalesNetPrice($projectId, $phaseId);

        // === มูลค่า stock ที่เหลือ (SUM base_price ของ unit ที่ยังไม่ขาย) ===
        $stockValue = $this->sumBasePrice($projectId, $phaseId, ['available', 'reserved']);

        // === มูลค่าโครงการที่อนุมัติ = SUM(base_price) ทุก unit ===
        $approvedProjectValue = $this->sumBasePrice($projectId, $phaseId);

        return [
            'sold_units'              => $soldUnits,
            'sold_net_price'          => $soldNetPrice,
            'avg_price_sold'          => $soldUnits > 0 ? round($soldNetPrice / $soldUnits, 2) : 0,
            'remaining_units'         => $remainingUnits,
            'stock_value'             => $stockValue,
            'avg_price_remaining'     => $remainingUnits > 0 ? round($stockValue / $remainingUnits, 2) : 0,
            'total_units'             => $totalUnits,
            'approved_project_value'  => $approvedProjectValue,
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
            'net_after_discount'      => round($netAfterDiscount, 2),
            'avg_after_discount'      => $avgAfterDiscount,
            'total_discount_amount'   => round($totalDiscountAmount, 2),
            'discount_percent'        => $discountPercent,
            // Section 4 — สรุปทั้งโครงการ
            'project_net_sales'       => round($projectNetSales, 2),
            'avg_price_project'       => $avgPriceProject,
            'approved_project_value'  => $approvedProjectValue,
            'value_achieved'          => round($valueAchieved, 2),
            'value_difference'        => round($valueDifference, 2),
            'difference_percent'      => $differencePercent,
            // echo back สำหรับ frontend
            'remaining_units'         => $remainingUnits,
            'stock_value'             => $stockValue,
            'sold_net_price'          => $soldNetPrice,
            'total_units'             => $totalUnits,
        ];
    }

    // ─── Private Helpers ──────────────────────────────────────────────────

    /**
     * นับจำนวน unit ตาม status (ถ้าไม่ระบุ = นับทั้งหมด)
     */
    private function countUnits(int $projectId, ?int $phaseId, ?array $statuses = null): int
    {
        $builder = $this->db->table('project_units')
            ->where('project_id', $projectId);

        if ($phaseId !== null) {
            $builder->where('phase_id', $phaseId);
        }

        if ($statuses !== null) {
            $builder->whereIn('status', $statuses);
        }

        return (int) $builder->countAllResults();
    }

    /**
     * SUM(base_price) ของ unit ตาม status (ถ้าไม่ระบุ = ทุก unit)
     */
    private function sumBasePrice(int $projectId, ?int $phaseId, ?array $statuses = null): float
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
