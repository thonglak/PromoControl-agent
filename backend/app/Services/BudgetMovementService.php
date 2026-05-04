<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use App\Models\NumberSeriesModel;
use RuntimeException;

/**
 * BudgetMovementService — core service จัดการ Budget Movements
 *
 * กฎสำคัญ:
 * 1. ห้ามอัปเดต balance โดยตรง — ต้อง derive จาก SUM(movements WHERE status='approved') เสมอ
 * 2. budget_source แยกจาก promotion category
 * 3. ทุก movement ต้องมี project_id, created_by
 * 4. UNIT_STANDARD ค่ามาจาก project_units.standard_budget เท่านั้น
 */
class BudgetMovementService
{
    private BaseConnection $db;
    private NumberSeriesService $numberSeriesSvc;

    private const ALLOCATE_TYPES = ['ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'];
    private const USE_TYPES      = ['USE', 'SPECIAL_BUDGET_USE'];
    private const RETURN_TYPES   = ['RETURN', 'SPECIAL_BUDGET_RETURN'];

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->numberSeriesSvc = new NumberSeriesService();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. getBalance — derive จาก SUM(movements)
    // ═══════════════════════════════════════════════════════════════════════

    public function getBalance(int $projectId, int $unitId, string $sourceType): float
    {
        $row = $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('unit_id', $unitId)
            ->where('budget_source_type', $sourceType)
            ->where('status', 'approved')
            ->get()->getRowArray();

        return (float) ($row['total'] ?? 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. getPoolBalance
    // ═══════════════════════════════════════════════════════════════════════

    public function getPoolBalance(int $projectId): float
    {
        $project = $this->db->table('projects')->select('pool_budget_amount')
            ->where('id', $projectId)->get()->getRowArray();
        if (!$project) return 0;

        $poolBudget = (float) $project['pool_budget_amount'];

        // ALLOCATE จาก pool → ลดงบ pool
        $allocated = $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'PROJECT_POOL')
            ->whereIn('movement_type', self::ALLOCATE_TYPES)
            ->where('status', 'approved')
            ->get()->getRowArray();

        // RETURN กลับ pool → เพิ่มงบ pool (รวมทุก source: UNIT_STANDARD, PROJECT_POOL, MANAGEMENT_SPECIAL)
        $returned = $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->whereIn('budget_source_type', ['UNIT_STANDARD', 'PROJECT_POOL', 'MANAGEMENT_SPECIAL'])
            ->whereIn('movement_type', self::RETURN_TYPES)
            ->where('status', 'approved')
            ->get()->getRowArray();

        $totalAllocated  = (float) ($allocated['total'] ?? 0);
        $totalReturned   = abs((float) ($returned['total'] ?? 0));

        return $poolBudget - $totalAllocated + $totalReturned;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. getUnitBudgetSummary
    // ═══════════════════════════════════════════════════════════════════════

    public function getUnitBudgetSummary(int $projectId, int $unitId): array
    {
        $unit = $this->db->table('project_units')
            ->select('id, unit_code, standard_budget')
            ->where('id', $unitId)->where('project_id', $projectId)
            ->get()->getRowArray();

        if (!$unit) throw new RuntimeException('ไม่พบยูนิต');

        $sources = ['UNIT_STANDARD', 'PROJECT_POOL', 'MANAGEMENT_SPECIAL'];
        $result  = ['unit_id' => $unitId, 'unit_code' => $unit['unit_code']];
        $totalAllocated = $totalUsed = $totalRemaining = 0;

        foreach ($sources as $src) {
            // UNIT_STANDARD: allocated = standard_budget (ค่าคงที่จาก project_units)
            if ($src === 'UNIT_STANDARD') {
                $allocated = (float) $unit['standard_budget'];
            } else {
                $allocated = $this->sumByTypes($projectId, $unitId, $src, self::ALLOCATE_TYPES);
            }

            $used     = abs($this->sumByTypes($projectId, $unitId, $src, self::USE_TYPES));
            $returned = abs($this->sumByTypes($projectId, $unitId, $src, self::RETURN_TYPES));
            $adjusted = $this->sumByType($projectId, $unitId, $src, 'ADJUST');

            // Transfer: TRANSFER_OUT stores negative, TRANSFER_IN stores positive
            $transferredIn  = $this->sumByType($projectId, $unitId, $src, 'SPECIAL_BUDGET_TRANSFER_IN');   // positive
            $transferredOut = abs($this->sumByType($projectId, $unitId, $src, 'SPECIAL_BUDGET_TRANSFER_OUT')); // stored negative → abs = positive

            $remaining = $allocated + $transferredIn - $used - $transferredOut - $returned + $adjusted;

            $result[$src] = [
                'allocated' => round($allocated, 2),
                'used'      => round($used, 2),
                'returned'  => round($returned, 2),
                'remaining' => round($remaining, 2),
            ];

            $totalAllocated += $allocated;
            $totalUsed      += $used;
            $totalRemaining += $remaining;
        }

        $result['total_allocated'] = round($totalAllocated, 2);
        $result['total_used']      = round($totalUsed, 2);
        $result['total_remaining'] = round($totalRemaining, 2);

        return $result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3a. getManagementBudgetRemaining — งบผู้บริหารคงเหลือทั้งโครงการ
    //     คำนวณจาก movements ของ MANAGEMENT_SPECIAL (status=approved):
    //     remaining = allocated - used - returned + transferred_in - transferred_out
    //     หมายเหตุ: ใช้สูตรเดียวกับ getProjectBudgetTotals เพื่อความสอดคล้อง
    // ═══════════════════════════════════════════════════════════════════════

    public function getManagementBudgetRemaining(int $projectId): float
    {
        $rows = $this->db->table('budget_movements')
            ->select('movement_type, SUM(amount) as total_amt')
            ->where('project_id', $projectId)
            ->where('budget_source_type', 'MANAGEMENT_SPECIAL')
            ->where('status', 'approved')
            ->groupBy('movement_type')
            ->get()->getResultArray();

        $sum = [];
        foreach ($rows as $r) {
            $sum[$r['movement_type']] = (float) $r['total_amt'];
        }

        $allocated = 0;
        foreach (self::ALLOCATE_TYPES as $t) $allocated += ($sum[$t] ?? 0);

        $used = 0;
        foreach (self::USE_TYPES as $t) $used += abs($sum[$t] ?? 0);

        $returned = 0;
        foreach (self::RETURN_TYPES as $t) $returned += abs($sum[$t] ?? 0);

        $transferredIn  = $sum['SPECIAL_BUDGET_TRANSFER_IN']  ?? 0;
        $transferredOut = abs($sum['SPECIAL_BUDGET_TRANSFER_OUT'] ?? 0);
        $adjusted       = $sum['ADJUST'] ?? 0;

        return round($allocated + $transferredIn - $used - $transferredOut - $returned + $adjusted, 2);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3b. getProjectBudgetTotals — aggregate ยอดรวมทั้งโครงการ (1 query)
    //     ใช้สำหรับ footer row ในหน้า list ไม่ต้อง loop ทีละ unit
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * คำนวณยอดรวม budget remaining ทั้งโครงการ ด้วย aggregate query เดียว
     * สูตรเดียวกับ getUnitBudgetSummary แต่รวมทุก unit
     *
     * @param int        $projectId
     * @param array|null $unitIds  จำกัดเฉพาะ unit_ids (optional, ถ้า null = ทุก unit)
     * @param array|null $sources  จำกัดเฉพาะ budget_source_type (optional, ถ้า null = ทุก source)
     * @return array ['total_remaining' => float, 'total_allocated' => float, 'total_used' => float]
     */
    public function getProjectBudgetTotals(int $projectId, ?array $unitIds = null, ?array $sources = null): array
    {
        $sources = $sources ?? ['UNIT_STANDARD', 'PROJECT_POOL', 'MANAGEMENT_SPECIAL'];

        // ─── 1. UNIT_STANDARD: allocated = SUM(standard_budget) จาก project_units ─────
        $stdBudget = 0;
        if (in_array('UNIT_STANDARD', $sources, true)) {
            $unitQb = $this->db->table('project_units')
                ->selectSum('standard_budget', 'total_std_budget')
                ->where('project_id', $projectId);
            if ($unitIds !== null) {
                $unitQb->whereIn('id', $unitIds);
            }
            $stdBudget = (float) ($unitQb->get()->getRowArray()['total_std_budget'] ?? 0);
        }

        // ─── 2. budget_movements aggregate ทุก source ──────────────────────────
        $mqb = $this->db->table('budget_movements')
            ->select("budget_source_type,
                      movement_type,
                      SUM(amount) as total_amt")
            ->where('project_id', $projectId)
            ->where('status', 'approved')
            ->whereIn('budget_source_type', $sources)
            ->groupBy('budget_source_type, movement_type');
        if ($unitIds !== null) {
            $mqb->whereIn('unit_id', $unitIds);
        }
        $rows = $mqb->get()->getResultArray();

        // จัดเก็บผลรวมตาม source + type
        $map = []; // $map[$source][$moveType] = sum
        foreach ($rows as $r) {
            $map[$r['budget_source_type']][$r['movement_type']] = (float) $r['total_amt'];
        }

        $allocTypes    = self::ALLOCATE_TYPES;
        $useTypes      = self::USE_TYPES;
        $returnTypes   = self::RETURN_TYPES;

        $totalAllocated = 0;
        $totalUsed      = 0;
        $totalRemaining = 0;
        $breakdown      = [];

        foreach ($sources as $src) {
            $sm = $map[$src] ?? [];

            // allocated
            if ($src === 'UNIT_STANDARD') {
                $allocated = $stdBudget;
            } else {
                $allocated = 0;
                foreach ($allocTypes as $t) $allocated += ($sm[$t] ?? 0);
            }

            // used (เก็บเป็นลบ → abs)
            $used = 0;
            foreach ($useTypes as $t) $used += abs($sm[$t] ?? 0);

            // returned (เก็บเป็นลบ → abs)
            $returned = 0;
            foreach ($returnTypes as $t) $returned += abs($sm[$t] ?? 0);

            $adjusted       = $sm['ADJUST'] ?? 0;
            $transferredIn  = $sm['SPECIAL_BUDGET_TRANSFER_IN'] ?? 0;
            $transferredOut = abs($sm['SPECIAL_BUDGET_TRANSFER_OUT'] ?? 0);

            $remaining   = $allocated + $transferredIn - $used - $transferredOut - $returned + $adjusted;
            $allocatedNet = $allocated - $returned; // ตั้งงบสุทธิ

            // ตั้งงบสุทธิ = allocated - returned (สอดคล้องกับ unit-level "ตั้งงบสุทธิ")
            $totalAllocated += $allocatedNet;
            $totalUsed      += $used;
            $totalRemaining += $remaining;

            $breakdown[$src] = [
                'allocated' => round($allocatedNet, 2),
                'used'      => round($used, 2),
                'returned'  => round($returned, 2),
                'remaining' => round($remaining, 2),
            ];
        }

        return [
            'total_allocated' => round($totalAllocated, 2),
            'total_used'      => round($totalUsed, 2),
            'total_remaining' => round($totalRemaining, 2),
            'breakdown'       => $breakdown,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. createMovement
    // ═══════════════════════════════════════════════════════════════════════

    public function createMovement(array $data): array
    {
        // Validate required
        foreach (['project_id', 'unit_id', 'movement_type', 'budget_source_type', 'amount'] as $f) {
            if (empty($data[$f]) && $data[$f] !== 0) throw new RuntimeException("กรุณาระบุ {$f}");
        }

        $projectId  = (int) $data['project_id'];
        $unitId     = (int) $data['unit_id'];
        $moveType   = $data['movement_type'];
        $sourceType = $data['budget_source_type'];
        $amount     = (float) $data['amount'];

        if ($amount <= 0) throw new RuntimeException('จำนวนเงินต้องมากกว่า 0');

        // UNIT_STANDARD ตั้งเองไม่ได้ (ยกเว้น ADJUST)
        if ($sourceType === 'UNIT_STANDARD' && in_array($moveType, self::ALLOCATE_TYPES, true)) {
            throw new RuntimeException('ไม่สามารถตั้งงบ UNIT_STANDARD เองได้ — ค่ามาจาก standard_budget ของยูนิต');
        }

        // ─── ดึง flag อนุญาตเกินงบ ─────────────────────────────────────────
        $projectRow = $this->db->table('projects')->select('allow_over_budget')
            ->where('id', $projectId)->get()->getRowArray();
        $allowOver = !empty($projectRow['allow_over_budget']);

        // Validate balances (ข้ามถ้า allow_over_budget = true หรือเป็นงบผู้บริหาร)
        // MANAGEMENT_SPECIAL อนุญาตให้ติดลบได้ — ทีมการตลาดบริหารจัดการเอง
        if (!$allowOver && $sourceType !== 'MANAGEMENT_SPECIAL' && in_array($moveType, self::USE_TYPES, true)) {
            $summary = $this->getUnitBudgetSummary($projectId, $unitId);
            $remaining = $summary[$sourceType]['remaining'] ?? 0;
            if ($remaining < $amount) {
                throw new RuntimeException("งบ {$sourceType} คงเหลือไม่พอ (คงเหลือ: " . number_format($remaining, 2) . " บาท)");
            }
        }

        if (!$allowOver && in_array($moveType, self::ALLOCATE_TYPES, true) && $sourceType === 'PROJECT_POOL') {
            $poolBalance = $this->getPoolBalance($projectId);
            if ($poolBalance < $amount) {
                throw new RuntimeException('งบ Pool คงเหลือไม่พอ (คงเหลือ: ' . number_format($poolBalance, 2) . ' บาท)');
            }
        }

        if (in_array($moveType, self::RETURN_TYPES, true)) {
            $summary = $this->getUnitBudgetSummary($projectId, $unitId);
            $allocated = $summary[$sourceType]['allocated'] ?? 0;
            if ($allocated <= 0) {
                throw new RuntimeException("ยังไม่มีงบ {$sourceType} ที่จัดสรรให้ยูนิตนี้");
            }
        }

        // Generate movement_no
        $movementNo = $this->generateMovementNo($projectId);

        // Check approval_required
        $project = $this->db->table('projects')->select('approval_required')
            ->where('id', $projectId)->get()->getRowArray();
        $status = (!empty($project['approval_required'])) ? 'pending' : 'approved';

        $now = date('Y-m-d H:i:s');

        // Determine actual amount sign
        $dbAmount = $amount;
        if (in_array($moveType, self::USE_TYPES, true) || in_array($moveType, self::RETURN_TYPES, true)) {
            $dbAmount = -$amount; // USE/RETURN = ลดงบของยูนิต
        }

        // สำหรับ RETURN: amount เป็นลบใน unit context แต่เป็นบวกใน pool context
        // เก็บ amount เป็นค่าบวกเสมอ — sign ตาม movement_type
        // ปรับ: ใช้ค่าบวกทั้งหมด — derive direction จาก movement_type
        $dbAmount = abs($amount);

        $this->db->table('budget_movements')->insert([
            'movement_no'        => $movementNo,
            'project_id'         => $projectId,
            'unit_id'            => $unitId,
            'movement_type'      => $moveType,
            'budget_source_type' => $sourceType,
            'amount'             => $dbAmount,
            'status'             => $status,
            'reference_id'       => $data['reference_id'] ?? null,
            'reference_type'     => $data['reference_type'] ?? null,
            'note'               => $data['note'] ?? null,
            'created_by'         => $data['created_by'] ?? null,
            'approved_by'        => $status === 'approved' ? ($data['created_by'] ?? null) : null,
            'approved_at'        => $status === 'approved' ? $now : null,
            'created_at'         => $now,
        ]);

        return $this->db->table('budget_movements')
            ->where('id', $this->db->insertID())->get()->getRowArray();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. approveMovement
    // ═══════════════════════════════════════════════════════════════════════

    public function approveMovement(int $movementId, int $approvedBy): array
    {
        $movement = $this->db->table('budget_movements')
            ->where('id', $movementId)->get()->getRowArray();

        if (!$movement) throw new RuntimeException('ไม่พบรายการเคลื่อนไหว');
        if ($movement['status'] !== 'pending') throw new RuntimeException('รายการนี้ไม่ได้อยู่ในสถานะรอการอนุมัติ');

        // ตรวจ balance ซ้ำก่อน approve (ป้องกัน race condition)
        $moveType   = $movement['movement_type'];
        $sourceType = $movement['budget_source_type'];
        $amount     = (float) $movement['amount'];
        $projectId  = (int) $movement['project_id'];
        $unitId     = (int) $movement['unit_id'];

        // MANAGEMENT_SPECIAL อนุญาตให้ติดลบได้ — ทีมการตลาดบริหารจัดการเอง (ข้าม validation)
        if ($sourceType !== 'MANAGEMENT_SPECIAL' && in_array($moveType, self::USE_TYPES, true)) {
            $summary   = $this->getUnitBudgetSummary($projectId, $unitId);
            $remaining = $summary[$sourceType]['remaining'] ?? 0;
            if ($remaining < $amount) {
                throw new RuntimeException("งบคงเหลือไม่พอ ไม่สามารถอนุมัติได้ (คงเหลือ: " . number_format($remaining, 2) . " บาท)");
            }
        }

        if (in_array($moveType, self::ALLOCATE_TYPES, true) && $sourceType === 'PROJECT_POOL') {
            $poolBalance = $this->getPoolBalance($projectId);
            if ($poolBalance < $amount) {
                throw new RuntimeException('งบ Pool คงเหลือไม่พอ ไม่สามารถอนุมัติได้');
            }
        }

        $now = date('Y-m-d H:i:s');
        $this->db->table('budget_movements')
            ->where('id', $movementId)
            ->update(['status' => 'approved', 'approved_by' => $approvedBy, 'approved_at' => $now, 'updated_at' => $now]);

        return $this->db->table('budget_movements')
            ->where('id', $movementId)->get()->getRowArray();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. rejectMovement
    // ═══════════════════════════════════════════════════════════════════════

    public function rejectMovement(int $movementId, int $rejectedBy, string $reason = ''): array
    {
        $movement = $this->db->table('budget_movements')
            ->where('id', $movementId)->get()->getRowArray();

        if (!$movement) throw new RuntimeException('ไม่พบรายการเคลื่อนไหว');
        if ($movement['status'] !== 'pending') throw new RuntimeException('รายการนี้ไม่ได้อยู่ในสถานะรอการอนุมัติ');

        $now = date('Y-m-d H:i:s');
        $this->db->table('budget_movements')
            ->where('id', $movementId)
            ->update(['status' => 'rejected', 'approved_by' => $rejectedBy, 'approved_at' => $now, 'note' => $reason, 'updated_at' => $now]);

        return $this->db->table('budget_movements')
            ->where('id', $movementId)->get()->getRowArray();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. transferBudget
    // ═══════════════════════════════════════════════════════════════════════

    public function transferBudget(array $data): array
    {
        $projectId  = (int) ($data['project_id'] ?? 0);
        $fromUnitId = (int) ($data['from_unit_id'] ?? 0);
        $toUnitId   = (int) ($data['to_unit_id'] ?? 0);
        $sourceType = $data['budget_source_type'] ?? '';
        $amount     = (float) ($data['amount'] ?? 0);
        $note       = $data['note'] ?? '';
        $createdBy  = $data['created_by'] ?? null;

        if ($fromUnitId === $toUnitId) throw new RuntimeException('ยูนิตต้นทางและปลายทางต้องไม่ใช่ยูนิตเดียวกัน');
        if ($amount <= 0) throw new RuntimeException('จำนวนเงินต้องมากกว่า 0');

        // ตรวจ remaining ของ from_unit
        // MANAGEMENT_SPECIAL อนุญาตให้ติดลบได้ — ทีมการตลาดบริหารจัดการเอง
        if ($sourceType !== 'MANAGEMENT_SPECIAL') {
            $fromSummary = $this->getUnitBudgetSummary($projectId, $fromUnitId);
            $remaining   = $fromSummary[$sourceType]['remaining'] ?? 0;
            if ($remaining < $amount) {
                throw new RuntimeException("ยูนิตต้นทางมีงบคงเหลือไม่พอ (คงเหลือ: " . number_format($remaining, 2) . " บาท)");
            }
        }

        $this->db->transBegin();
        try {
            // RETURN จาก from_unit
            $returnMov = $this->createMovement([
                'project_id'         => $projectId,
                'unit_id'            => $fromUnitId,
                'movement_type'      => 'RETURN',
                'budget_source_type' => $sourceType,
                'amount'             => $amount,
                'note'               => "โอนงบไปยูนิตอื่น — {$note}",
                'created_by'         => $createdBy,
            ]);

            // ALLOCATE ไปที่ to_unit
            $allocMov = $this->createMovement([
                'project_id'         => $projectId,
                'unit_id'            => $toUnitId,
                'movement_type'      => 'ALLOCATE',
                'budget_source_type' => $sourceType,
                'amount'             => $amount,
                'reference_id'       => $returnMov['id'],
                'reference_type'     => 'budget_transfer',
                'note'               => "รับโอนงบจากยูนิตอื่น — {$note}",
                'created_by'         => $createdBy,
            ]);

            // ผูก reference_id ของ RETURN → ALLOCATE
            $this->db->table('budget_movements')
                ->where('id', $returnMov['id'])
                ->update(['reference_id' => $allocMov['id'], 'reference_type' => 'budget_transfer']);

            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('โอนงบไม่สำเร็จ: ' . $e->getMessage());
        }

        return [
            'return_movement'   => $returnMov,
            'allocate_movement' => $allocMov,
            'amount'            => $amount,
            'message'           => 'โอนงบสำเร็จ',
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. returnSpecialBudget — คืนงบพิเศษ (MANAGEMENT_SPECIAL)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * คืนงบพิเศษ (partial หรือทั้งจำนวน)
     *
     * กฎสำคัญ:
     * - คืนได้เฉพาะ MANAGEMENT_SPECIAL
     * - คืนได้เฉพาะส่วนคงเหลือ (remaining = allocated - used)
     * - SPECIAL_BUDGET_RETURN ไม่เพิ่ม PROJECT_POOL — งบ "หายไป" จากระบบ
     * - balance derive จาก SUM(movements) เสมอ
     */
    public function returnSpecialBudget(array $data): array
    {
        $validSources = ['MANAGEMENT_SPECIAL'];
        $sourceType   = $data['budget_source_type'] ?? '';
        $projectId    = (int) ($data['project_id'] ?? 0);
        $unitId       = (int) ($data['unit_id'] ?? 0);
        $amount       = (float) ($data['amount'] ?? 0);
        $note         = $data['note'] ?? '';
        $createdBy    = $data['created_by'] ?? null;

        // 1. Validate budget_source_type
        if (!in_array($sourceType, $validSources, true)) {
            throw new RuntimeException('คืนงบได้เฉพาะงบผู้บริหาร (MANAGEMENT_SPECIAL) เท่านั้น');
        }

        // 2. Validate amount > 0
        if ($amount <= 0) {
            throw new RuntimeException('จำนวนเงินต้องมากกว่า 0');
        }

        // 3. Validate note
        if (trim($note) === '') {
            throw new RuntimeException('กรุณาระบุเหตุผลในการคืนงบ');
        }

        // 4. Validate unit exists in project
        $unit = $this->db->table('project_units')
            ->select('id, unit_code')
            ->where('id', $unitId)
            ->where('project_id', $projectId)
            ->get()->getRowArray();
        if (!$unit) {
            throw new RuntimeException('ไม่พบยูนิตในโครงการนี้');
        }

        // 5. คำนวณ remaining จาก SUM(movements) — ห้าม read จาก stored balance
        $summary   = $this->getUnitBudgetSummary($projectId, $unitId);
        $remaining = $summary[$sourceType]['remaining'] ?? 0;

        // 6. Validate amount <= remaining
        if ($amount > $remaining) {
            throw new RuntimeException('จำนวนเงินเกินงบคงเหลือ (คงเหลือ ' . number_format($remaining, 0) . ' บาท)');
        }

        // 7. Check approval_required
        $project = $this->db->table('projects')->select('approval_required')
            ->where('id', $projectId)->get()->getRowArray();
        $status = (!empty($project['approval_required'])) ? 'pending' : 'approved';

        // 8. Generate movement_no
        $movementNo = $this->generateMovementNo($projectId);

        $now = date('Y-m-d H:i:s');

        $this->db->transBegin();
        try {
            // 9. สร้าง budget_movement — amount เก็บค่าบวก, direction จาก movement_type
            $this->db->table('budget_movements')->insert([
                'movement_no'        => $movementNo,
                'project_id'         => $projectId,
                'unit_id'            => $unitId,
                'movement_type'      => 'SPECIAL_BUDGET_RETURN',
                'budget_source_type' => $sourceType,
                'amount'             => $amount,
                'status'             => $status,
                'note'               => $note,
                'created_by'         => $createdBy,
                'approved_by'        => $status === 'approved' ? $createdBy : null,
                'approved_at'        => $status === 'approved' ? $now : null,
                'created_at'         => $now,
            ]);

            $movementId = $this->db->insertID();

            // 10. อัปเดต unit_budget_allocations (ลด allocated_amount ถ้า approved ทันที)
            if ($status === 'approved') {
                $alloc = $this->db->table('unit_budget_allocations')
                    ->where('unit_id', $unitId)
                    ->where('project_id', $projectId)
                    ->where('budget_source_type', $sourceType)
                    ->get()->getRowArray();

                if ($alloc) {
                    $newAllocated = max(0, (float) $alloc['allocated_amount'] - $amount);
                    if ($newAllocated <= 0) {
                        // คืนหมด -> ลบ record
                        $this->db->table('unit_budget_allocations')
                            ->where('id', $alloc['id'])->delete();
                    } else {
                        $this->db->table('unit_budget_allocations')
                            ->where('id', $alloc['id'])
                            ->update(['allocated_amount' => $newAllocated, 'updated_at' => $now]);
                    }
                }
            }

            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('คืนงบไม่สำเร็จ: ' . $e->getMessage());
        }

        // 11. Return movement + updated balance
        $movement = $this->db->table('budget_movements')
            ->where('id', $movementId)->get()->getRowArray();

        $updatedSummary = $this->getUnitBudgetSummary($projectId, $unitId);

        return [
            'movement' => $movement,
            'balance'  => $updatedSummary[$sourceType],
            'status'   => $status,
        ];
    }


    // ═══════════════════════════════════════════════════════════════════════
    // 9. transferSpecialBudget — โอนงบพิเศษระหว่าง unit
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * โอนงบพิเศษจาก unit หนึ่งไปอีก unit หนึ่งภายในโครงการเดียวกัน
     *
     * กฎสำคัญ:
     * - โอนได้เฉพาะ MANAGEMENT_SPECIAL
     * - โอนได้เฉพาะภายในโครงการเดียวกัน
     * - สร้าง 2 movements (TRANSFER_OUT + TRANSFER_IN) ใน 1 transaction
     * - ทั้งคู่ status = 'approved' ทันที (ไม่ผ่าน approval flow)
     * - reference_id ชี้ถึงกัน (transfer pair)
     * - งบรวมระบบไม่เปลี่ยน (OUT + IN = 0)
     */
    public function transferSpecialBudget(array $params): array
    {
        $validSources = ['MANAGEMENT_SPECIAL'];
        $sourceType   = $params['budget_source_type'] ?? '';
        $fromUnitId   = (int) ($params['from_unit_id'] ?? 0);
        $toUnitId     = (int) ($params['to_unit_id'] ?? 0);
        $amount       = (float) ($params['amount'] ?? 0);
        $note         = $params['note'] ?? '';
        $createdBy    = $params['transferred_by'] ?? null;
        $projectId    = (int) ($params['project_id'] ?? 0);

        // 1. Validate budget_source_type
        if (!in_array($sourceType, $validSources, true)) {
            throw new RuntimeException('โอนได้เฉพาะงบพิเศษ (ผู้บริหาร/แคมเปญ) เท่านั้น');
        }

        // 2. Validate from ≠ to
        if ($fromUnitId === $toUnitId) {
            throw new RuntimeException('ไม่สามารถโอนงบให้ยูนิตเดียวกันได้');
        }

        // 3. Validate ทั้ง 2 unit อยู่ใน project เดียวกัน
        $fromUnit = $this->db->table('project_units')->select('id, unit_code, project_id')
            ->where('id', $fromUnitId)->get()->getRowArray();
        $toUnit = $this->db->table('project_units')->select('id, unit_code, project_id')
            ->where('id', $toUnitId)->get()->getRowArray();

        if (!$fromUnit) throw new RuntimeException('ไม่พบยูนิตต้นทาง');
        if (!$toUnit) throw new RuntimeException('ไม่พบยูนิตปลายทาง');

        if ((int) $fromUnit['project_id'] !== $projectId || (int) $toUnit['project_id'] !== $projectId) {
            throw new RuntimeException('ยูนิตต้องอยู่ในโครงการเดียวกัน');
        }

        // 4. Validate amount > 0
        if ($amount <= 0) {
            throw new RuntimeException('จำนวนเงินต้องมากกว่า 0');
        }

        // 5. คำนวณ remaining ของ from_unit
        $allocated = (float) ($this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('unit_id', $fromUnitId)
            ->where('budget_source_type', $sourceType)
            ->whereIn('movement_type', ['SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE', 'SPECIAL_BUDGET_TRANSFER_IN'])
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        $used = abs((float) ($this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('unit_id', $fromUnitId)
            ->where('budget_source_type', $sourceType)
            ->whereIn('movement_type', ['SPECIAL_BUDGET_USE', 'SPECIAL_BUDGET_TRANSFER_OUT'])
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0));

        // คิด RETURN ด้วย
        $returned = abs((float) ($this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('unit_id', $fromUnitId)
            ->where('budget_source_type', $sourceType)
            ->where('movement_type', 'SPECIAL_BUDGET_RETURN')
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0));

        $remaining = $allocated - $used - $returned;

        // 6. Validate amount ≤ remaining
        if ($amount > $remaining) {
            throw new RuntimeException('จำนวนเงินเกินงบคงเหลือ (เหลือ ' . number_format($remaining, 0) . ' บาท)');
        }

        // 7. DB transaction
        $this->db->transBegin();
        try {
            $now = date('Y-m-d H:i:s');

            // 7a. movement OUT
            $outNo = $this->generateMovementNo($projectId);
            $this->db->table('budget_movements')->insert([
                'movement_no'        => $outNo,
                'project_id'         => $projectId,
                'unit_id'            => $fromUnitId,
                'movement_type'      => 'SPECIAL_BUDGET_TRANSFER_OUT',
                'budget_source_type' => $sourceType,
                'amount'             => -$amount,
                'status'             => 'approved',
                'note'               => $note,
                'created_by'         => $createdBy,
                'approved_by'        => $createdBy,
                'approved_at'        => $now,
                'created_at'         => $now,
            ]);
            $outId = $this->db->insertID();

            // 7b. movement IN
            $inNo = $this->generateMovementNo($projectId);
            $this->db->table('budget_movements')->insert([
                'movement_no'        => $inNo,
                'project_id'         => $projectId,
                'unit_id'            => $toUnitId,
                'movement_type'      => 'SPECIAL_BUDGET_TRANSFER_IN',
                'budget_source_type' => $sourceType,
                'amount'             => $amount,
                'status'             => 'approved',
                'note'               => $note,
                'created_by'         => $createdBy,
                'approved_by'        => $createdBy,
                'approved_at'        => $now,
                'created_at'         => $now,
            ]);
            $inId = $this->db->insertID();

            // 7c. อัปเดต reference_id ชี้ถึงกัน
            $this->db->table('budget_movements')->where('id', $outId)
                ->update(['reference_id' => $inId, 'reference_type' => 'special_budget_transfer']);
            $this->db->table('budget_movements')->where('id', $inId)
                ->update(['reference_id' => $outId, 'reference_type' => 'special_budget_transfer']);

            // 7d. จัดการ unit_budget_allocations ของ to_unit
            $existingAlloc = $this->db->table('unit_budget_allocations')
                ->where('unit_id', $toUnitId)
                ->where('project_id', $projectId)
                ->where('budget_source_type', $sourceType)
                ->get()->getRowArray();

            if (!$existingAlloc) {
                $this->db->table('unit_budget_allocations')->insert([
                    'unit_id'            => $toUnitId,
                    'project_id'         => $projectId,
                    'budget_source_type' => $sourceType,
                    'allocated_amount'   => 0,
                    'movement_id'        => $inId,
                    'note'               => 'สร้างอัตโนมัติจากการโอนงบ',
                    'created_by'         => $createdBy,
                    'created_at'         => $now,
                    'updated_at'         => $now,
                ]);
            }

            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('โอนงบไม่สำเร็จ: ' . $e->getMessage());
        }

        $outRecord = $this->db->table('budget_movements')->where('id', $outId)->get()->getRowArray();
        $inRecord  = $this->db->table('budget_movements')->where('id', $inId)->get()->getRowArray();

        return [
            'transfer_out' => $outRecord,
            'transfer_in'  => $inRecord,
            'message'      => 'โอนงบสำเร็จ',
        ];
    }


    // ═══════════════════════════════════════════════════════════════════════
    // 10. voidSpecialBudget — ยกเลิกงบพิเศษทั้งก้อน (เมื่อ used = 0)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ยกเลิกงบพิเศษที่ตั้งไว้ (Void)
     * ใช้เมื่อตั้งงบผิด/ไม่ต้องการแล้ว — เงื่อนไข: ต้องยังไม่มีการใช้งบ (used = 0)
     *
     * กฎ:
     * - ยกเลิกได้เฉพาะ MANAGEMENT_SPECIAL
     * - ต้อง used = 0 (ยังไม่มีใครใช้งบนี้)
     * - สร้าง movement type = SPECIAL_BUDGET_VOID, amount = -(allocated), status = voided
     * - อัปเดต allocation records ทั้งหมดของ unit+source เป็น voided
     */
    public function voidSpecialBudget(array $data): array
    {
        $validSources = ['MANAGEMENT_SPECIAL', 'PROJECT_POOL'];
        $sourceType   = $data['budget_source_type'] ?? '';
        $projectId    = (int) ($data['project_id'] ?? 0);
        $unitId       = (int) ($data['unit_id'] ?? 0);
        $note         = $data['note'] ?? '';
        $createdBy    = $data['created_by'] ?? null;

        // 1. Validate source type
        if (!in_array($sourceType, $validSources, true)) {
            throw new RuntimeException('ยกเลิกได้เฉพาะงบผู้บริหาร หรืองบส่วนกลาง เท่านั้น');
        }

        // 2. Validate note
        if (trim($note) === '') {
            throw new RuntimeException('กรุณาระบุเหตุผลในการยกเลิก');
        }

        // 3. Validate unit exists in project
        $unit = $this->db->table('project_units')
            ->select('id, unit_code')
            ->where('id', $unitId)
            ->where('project_id', $projectId)
            ->get()->getRowArray();
        if (!$unit) {
            throw new RuntimeException('ไม่พบยูนิตในโครงการนี้');
        }

        // 4. Check summary — used must be 0, remaining > 0
        $summary   = $this->getUnitBudgetSummary($projectId, $unitId);
        $srcData   = $summary[$sourceType] ?? ['allocated' => 0, 'used' => 0, 'remaining' => 0];
        $allocated = $srcData['allocated'];
        $used      = $srcData['used'];
        $remaining = $srcData['remaining'];

        if ($remaining <= 0) {
            throw new RuntimeException('ไม่มีงบที่จะยกเลิก');
        }

        if ($used > 0) {
            throw new RuntimeException('ไม่สามารถยกเลิกได้ เพราะมีการใช้งบไปแล้ว (' . number_format($used, 0) . ' บาท) — กรุณาใช้ "คืนงบ" แทน');
        }

        $now = date('Y-m-d H:i:s');

        $this->db->transBegin();
        try {
            // 5. Void ALLOCATE เฉพาะยอดสุทธิ (remaining) ไม่ void ทั้งหมด
            //    เพื่อรักษา RETURN จากยกเลิกขายที่เคยเพิ่ม Pool ไว้ไม่ให้กระทบ
            //    void จากใหม่สุดไปเก่าสุด
            $voidMoveTypes = $sourceType === 'MANAGEMENT_SPECIAL'
                ? ['SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE', 'SPECIAL_BUDGET_TRANSFER_IN']
                : ['ALLOCATE'];

            $allocMovements = $this->db->table('budget_movements')
                ->where('project_id', $projectId)
                ->where('unit_id', $unitId)
                ->where('budget_source_type', $sourceType)
                ->whereIn('movement_type', $voidMoveTypes)
                ->where('status', 'approved')
                ->orderBy('created_at', 'DESC')
                ->get()->getResultArray();

            $toVoid = $remaining;
            foreach ($allocMovements as $mov) {
                if ($toVoid <= 0) break;
                $movAmt = abs((float) $mov['amount']);
                $this->db->table('budget_movements')
                    ->where('id', $mov['id'])
                    ->update(['status' => 'voided', 'updated_at' => $now]);
                $toVoid -= $movAmt;
            }

            // 6. สร้าง void movement (เป็น log record)
            //    MANAGEMENT_SPECIAL → SPECIAL_BUDGET_VOID (ไม่ถูกนับในสูตร remaining)
            //    PROJECT_POOL → ALLOCATE ที่ voided แล้วคือ audit trail เพียงพอ
            //    ถ้าสร้าง RETURN จะถูกนับซ้ำทำให้คงเหลือติดลบ
            $movementId = null;
            if ($sourceType === 'MANAGEMENT_SPECIAL') {
                $movementNo = $this->generateMovementNo($projectId);
                $this->db->table('budget_movements')->insert([
                    'movement_no'        => $movementNo,
                    'project_id'         => $projectId,
                    'unit_id'            => $unitId,
                    'movement_type'      => 'SPECIAL_BUDGET_VOID',
                    'budget_source_type' => $sourceType,
                    'amount'             => -$remaining,
                    'status'             => 'approved',
                    'note'               => $note,
                    'created_by'         => $createdBy,
                    'approved_by'        => $createdBy,
                    'approved_at'        => $now,
                    'created_at'         => $now,
                ]);
                $movementId = $this->db->insertID();
            } else {
                // PROJECT_POOL: อัปเดต note ใน voided movements เพื่อเก็บเหตุผล
                $this->db->table('budget_movements')
                    ->where('project_id', $projectId)
                    ->where('unit_id', $unitId)
                    ->where('budget_source_type', $sourceType)
                    ->where('status', 'voided')
                    ->where('updated_at', $now)
                    ->update(['note' => $note]);
            }

            // 7. ลบ unit_budget_allocations record
            $this->db->table('unit_budget_allocations')
                ->where('unit_id', $unitId)
                ->where('project_id', $projectId)
                ->where('budget_source_type', $sourceType)
                ->delete();

            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('ยกเลิกงบไม่สำเร็จ: ' . $e->getMessage());
        }

        $movement = $movementId
            ? $this->db->table('budget_movements')->where('id', $movementId)->get()->getRowArray()
            : null;

        $updatedSummary = $this->getUnitBudgetSummary($projectId, $unitId);

        return [
            'movement' => $movement,
            'balance'  => $updatedSummary[$sourceType],
            'status'   => 'approved',
        ];
    }


    // ═══════════════════════════════════════════════════════════════════════
    // 11. returnUnitBudgetToPool — คืนงบยูนิตเข้า Pool
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * คืนงบยูนิตเข้า Project Pool
     *
     * กฎสำคัญ:
     * - คืนได้ทุกแหล่งงบ (UNIT_STANDARD, PROJECT_POOL, MANAGEMENT_SPECIAL)
     * - จำนวนต้องไม่เกินงบเหลือรวมทุกแหล่ง
     * - สร้าง RETURN movement, status = approved ทันที
     * - Pool balance เพิ่มขึ้นตามจำนวนที่คืน
     * - ลำดับหัก: UNIT_STANDARD → PROJECT_POOL → MANAGEMENT_SPECIAL
     * - สิทธิ์: admin, manager เท่านั้น
     */
    public function returnUnitBudgetToPool(array $data): array
    {
        $projectId = (int) ($data['project_id'] ?? 0);
        $unitId    = (int) ($data['unit_id'] ?? 0);
        $amount    = (float) ($data['amount'] ?? 0);
        $note      = $data['note'] ?? '';
        $createdBy = $data['created_by'] ?? null;

        // 1. Validate amount > 0
        if ($amount <= 0) {
            throw new RuntimeException('จำนวนเงินต้องมากกว่า 0');
        }

        // 2. Validate unit exists in project
        $unit = $this->db->table('project_units')
            ->select('id, unit_code, standard_budget, project_id')
            ->where('id', $unitId)
            ->where('project_id', $projectId)
            ->get()->getRowArray();
        if (!$unit) {
            throw new RuntimeException('ไม่พบยูนิตในโครงการนี้');
        }

        // 3. คำนวณงบเหลือทั้ง UNIT_STANDARD, PROJECT_POOL, MANAGEMENT_SPECIAL
        $summary        = $this->getUnitBudgetSummary($projectId, $unitId);
        $unitRemaining  = $summary['UNIT_STANDARD']['remaining'] ?? 0;
        $poolRemaining  = $summary['PROJECT_POOL']['remaining'] ?? 0;
        $mgmtRemaining  = $summary['MANAGEMENT_SPECIAL']['remaining'] ?? 0;
        $totalRemaining = $unitRemaining + $poolRemaining + $mgmtRemaining;

        // 4. Validate amount ≤ total remaining (งบยูนิต + งบ Pool + งบผู้บริหาร)
        if ($amount > $totalRemaining) {
            throw new RuntimeException('จำนวนเกินงบเหลือ (เหลือ ' . number_format($totalRemaining, 0) . ' บาท)');
        }

        // 5. แบ่งจำนวนคืน: หักจากงบยูนิตก่อน → งบ Pool → งบผู้บริหาร
        $remaining   = $amount;
        $returnUnit  = min($remaining, $unitRemaining);
        $remaining  -= $returnUnit;
        $returnPool  = min($remaining, $poolRemaining);
        $remaining  -= $returnPool;
        $returnMgmt  = min($remaining, $mgmtRemaining);

        $now = date('Y-m-d H:i:s');
        $movements = [];

        // 5a. สร้าง RETURN movement สำหรับ UNIT_STANDARD (ถ้ามี)
        if ($returnUnit > 0) {
            $movementNo = $this->generateMovementNo($projectId);
            $this->db->table('budget_movements')->insert([
                'movement_no'        => $movementNo,
                'project_id'         => $projectId,
                'unit_id'            => $unitId,
                'movement_type'      => 'RETURN',
                'budget_source_type' => 'UNIT_STANDARD',
                'amount'             => $returnUnit,
                'status'             => 'approved',
                'note'               => $note ?: 'คืนงบยูนิตเข้า Pool',
                'created_by'         => $createdBy,
                'approved_by'        => $createdBy,
                'approved_at'        => $now,
                'created_at'         => $now,
            ]);
            $movements[] = $this->db->table('budget_movements')
                ->where('id', $this->db->insertID())->get()->getRowArray();
        }

        // 5b. สร้าง RETURN movement สำหรับ PROJECT_POOL (ถ้ามี)
        if ($returnPool > 0) {
            $movementNo = $this->generateMovementNo($projectId);
            $this->db->table('budget_movements')->insert([
                'movement_no'        => $movementNo,
                'project_id'         => $projectId,
                'unit_id'            => $unitId,
                'movement_type'      => 'RETURN',
                'budget_source_type' => 'PROJECT_POOL',
                'amount'             => $returnPool,
                'status'             => 'approved',
                'note'               => $note ?: 'คืนงบ Pool ที่จัดสรรให้ยูนิตเข้า Pool',
                'created_by'         => $createdBy,
                'approved_by'        => $createdBy,
                'approved_at'        => $now,
                'created_at'         => $now,
            ]);
            $movements[] = $this->db->table('budget_movements')
                ->where('id', $this->db->insertID())->get()->getRowArray();
        }

        // 5c. สร้าง RETURN movement สำหรับ MANAGEMENT_SPECIAL (ถ้ามี)
        if ($returnMgmt > 0) {
            $movementNo = $this->generateMovementNo($projectId);
            $this->db->table('budget_movements')->insert([
                'movement_no'        => $movementNo,
                'project_id'         => $projectId,
                'unit_id'            => $unitId,
                'movement_type'      => 'RETURN',
                'budget_source_type' => 'MANAGEMENT_SPECIAL',
                'amount'             => $returnMgmt,
                'status'             => 'approved',
                'note'               => $note ?: 'คืนงบผู้บริหารเข้า Pool',
                'created_by'         => $createdBy,
                'approved_by'        => $createdBy,
                'approved_at'        => $now,
                'created_at'         => $now,
            ]);
            $movements[] = $this->db->table('budget_movements')
                ->where('id', $this->db->insertID())->get()->getRowArray();
        }

        $updatedSummary = $this->getUnitBudgetSummary($projectId, $unitId);

        return [
            'movements'      => $movements,
            'balance'        => $updatedSummary['UNIT_STANDARD'],
            'pool_balance'   => $this->getPoolBalance($projectId),
            'total_returned' => $amount,
            'status'         => 'approved',
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 12. batchReturnUnitBudgetToPool — คืนงบยูนิตหลายรายการเข้า Pool
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * คืนงบยูนิตหลายรายการเข้า Pool พร้อมกัน
     * Batch คืน remaining ทั้งหมดของแต่ละยูนิตทั้ง 3 sources (ไม่รับ amount จาก client)
     */
    public function batchReturnUnitBudgetToPool(array $unitIds, int $projectId, string $remark, int $createdBy): array
    {
        $this->db->transBegin();
        try {
            $movements = [];

            foreach ($unitIds as $unitId) {
                $unitId = (int) $unitId;

                // ตรวจว่ายูนิตอยู่ในโครงการ
                $unit = $this->db->table("project_units")
                    ->select("id, unit_code, standard_budget, status")
                    ->where("id", $unitId)
                    ->where("project_id", $projectId)
                    ->get()->getRowArray();
                if (!$unit) continue;

                // ตรวจสถานะ transferred
                if ($unit["status"] !== "transferred") {
                    throw new RuntimeException("ยูนิต " . $unit["unit_code"] . " ยังไม่โอนกรรมสิทธิ์ ไม่สามารถคืนงบได้");
                }

                // คำนวณ remaining ทั้ง 3 sources ณ เวลา submit
                $summary        = $this->getUnitBudgetSummary($projectId, $unitId);
                $unitRemaining  = $summary["UNIT_STANDARD"]["remaining"] ?? 0;
                $poolRemaining  = $summary["PROJECT_POOL"]["remaining"] ?? 0;
                $mgmtRemaining  = $summary["MANAGEMENT_SPECIAL"]["remaining"] ?? 0;
                $totalRemaining = $unitRemaining + $poolRemaining + $mgmtRemaining;

                if ($totalRemaining <= 0) continue; // ข้ามยูนิตที่ไม่มีงบเหลือ

                $now = date("Y-m-d H:i:s");
                $unitTotalReturned = 0;

                // สร้าง RETURN movement สำหรับ UNIT_STANDARD (ถ้ามี)
                if ($unitRemaining > 0) {
                    $movementNo = $this->generateMovementNo($projectId);
                    $this->db->table("budget_movements")->insert([
                        "movement_no"        => $movementNo,
                        "project_id"         => $projectId,
                        "unit_id"            => $unitId,
                        "movement_type"      => "RETURN",
                        "budget_source_type" => "UNIT_STANDARD",
                        "amount"             => $unitRemaining,
                        "status"             => "approved",
                        "note"               => $remark ?: "คืนงบยูนิตเข้า Pool (Batch)",
                        "created_by"         => $createdBy,
                        "approved_by"        => $createdBy,
                        "approved_at"        => $now,
                        "created_at"         => $now,
                    ]);
                    $unitTotalReturned += $unitRemaining;
                }

                // สร้าง RETURN movement สำหรับ PROJECT_POOL (ถ้ามี)
                if ($poolRemaining > 0) {
                    $movementNo = $this->generateMovementNo($projectId);
                    $this->db->table("budget_movements")->insert([
                        "movement_no"        => $movementNo,
                        "project_id"         => $projectId,
                        "unit_id"            => $unitId,
                        "movement_type"      => "RETURN",
                        "budget_source_type" => "PROJECT_POOL",
                        "amount"             => $poolRemaining,
                        "status"             => "approved",
                        "note"               => $remark ?: "คืนงบ Pool ที่จัดสรรให้ยูนิตเข้า Pool (Batch)",
                        "created_by"         => $createdBy,
                        "approved_by"        => $createdBy,
                        "approved_at"        => $now,
                        "created_at"         => $now,
                    ]);
                    $unitTotalReturned += $poolRemaining;
                }

                // สร้าง RETURN movement สำหรับ MANAGEMENT_SPECIAL (ถ้ามี)
                if ($mgmtRemaining > 0) {
                    $movementNo = $this->generateMovementNo($projectId);
                    $this->db->table("budget_movements")->insert([
                        "movement_no"        => $movementNo,
                        "project_id"         => $projectId,
                        "unit_id"            => $unitId,
                        "movement_type"      => "RETURN",
                        "budget_source_type" => "MANAGEMENT_SPECIAL",
                        "amount"             => $mgmtRemaining,
                        "status"             => "approved",
                        "note"               => $remark ?: "คืนงบผู้บริหารเข้า Pool (Batch)",
                        "created_by"         => $createdBy,
                        "approved_by"        => $createdBy,
                        "approved_at"        => $now,
                        "created_at"         => $now,
                    ]);
                    $unitTotalReturned += $mgmtRemaining;
                }

                $movements[] = [
                    "unit_id"     => $unitId,
                    "unit_code"   => $unit["unit_code"],
                    "amount"      => $unitTotalReturned,
                    "unit_budget_returned" => $unitRemaining,
                    "pool_budget_returned" => $poolRemaining,
                    "mgmt_budget_returned" => $mgmtRemaining,
                ];
            }

            if (empty($movements)) {
                $this->db->transRollback();
                throw new RuntimeException("ไม่มียูนิตที่มีงบเหลือ");
            }

            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException($e->getMessage());
        }

        $totalReturned = array_sum(array_column($movements, "amount"));

        return [
            "movements"      => $movements,
            "total_returned" => $totalReturned,
            "pool_balance"   => $this->getPoolBalance($projectId),
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 13. getUnitsWithRemaining — ดึงยูนิตที่มีงบเหลือ
    // ═══════════════════════════════════════════════════════════════════════

    public function getUnitsWithRemaining(int $projectId): array
    {
        // ดึงยูนิตที่มีรายการขายที่ active (ไม่รวม cancelled, voided)
        $units = $this->db->table("project_units pu")
            ->select("pu.id as unit_id, pu.unit_code, pu.standard_budget, pu.status as sale_status")
            ->join("sales_transactions st", "st.unit_id = pu.id AND st.status = 'active'", "inner")
            ->where("pu.project_id", $projectId)
            ->groupBy("pu.id")
            ->get()->getResultArray();

        $result = [];
        $emptyBucket = ["allocated" => 0, "used" => 0, "returned" => 0, "remaining" => 0];

        foreach ($units as $unit) {
            $summary   = $this->getUnitBudgetSummary($projectId, (int) $unit["unit_id"]);
            $usData    = $summary["UNIT_STANDARD"]      ?? $emptyBucket;
            $poolData  = $summary["PROJECT_POOL"]       ?? $emptyBucket;
            $mgmtData  = $summary["MANAGEMENT_SPECIAL"] ?? $emptyBucket;

            $budgetRemain = $usData["remaining"];
            $poolRemain   = $poolData["remaining"];
            $mgmtRemain   = $mgmtData["remaining"];

            // แสดงเฉพาะยูนิตที่มีงบเหลือ (งบยูนิต, งบ Pool, หรืองบผู้บริหาร)
            if ($budgetRemain <= 0 && $poolRemain <= 0 && $mgmtRemain <= 0) continue;

            $unit["total_used"]     = $usData["used"];
            $unit["total_returned"] = $usData["returned"];
            $unit["budget_remain"]  = $budgetRemain;

            // งบ Pool ที่จัดสรรให้ยูนิต
            $unit["pool_allocated"] = $poolData["allocated"];
            $unit["pool_used"]      = $poolData["used"];
            $unit["pool_remain"]    = $poolRemain;

            // งบผู้บริหารที่จัดสรรให้ยูนิต
            $unit["mgmt_allocated"] = $mgmtData["allocated"];
            $unit["mgmt_used"]      = $mgmtData["used"];
            $unit["mgmt_remain"]    = $mgmtRemain;

            // งบอื่นๆ รวม (Pool + ผู้บริหาร)
            $unit["other_remain"]   = $poolRemain + $mgmtRemain;

            // คืนงบได้เฉพาะ: สถานะโอนแล้ว + มีงบเหลือ (ยูนิต, Pool, หรือผู้บริหาร)
            $unit["is_returnable"]  = ($unit["sale_status"] === "transferred" && ($budgetRemain > 0 || $poolRemain > 0 || $mgmtRemain > 0));
            $result[] = $unit;
        }

        // เรียงตาม budget_remain มากไปน้อย
        usort($result, fn($a, $b) => $b["budget_remain"] <=> $a["budget_remain"]);

        return $result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 14. getReturnHistory — ประวัติการคืนงบ
    // ═══════════════════════════════════════════════════════════════════════

    public function getReturnHistory(int $projectId, int $page = 1, int $perPage = 20): array
    {
        $offset = ($page - 1) * $perPage;

        $builder = $this->db->table("budget_movements bm")
            ->select("bm.id, bm.unit_id, bm.amount, bm.budget_source_type, bm.note, bm.created_at, bm.created_by, pu.unit_code, u.name as created_by_name")
            ->join("project_units pu", "pu.id = bm.unit_id")
            ->join("users u", "u.id = bm.created_by", "left")
            ->where("bm.movement_type", "RETURN")
            ->whereIn("bm.budget_source_type", ["UNIT_STANDARD", "PROJECT_POOL", "MANAGEMENT_SPECIAL"])
            ->where("bm.status", "approved")
            ->where("bm.project_id", $projectId);

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults(false);

        $data = $builder->orderBy("bm.created_at", "DESC")
            ->limit($perPage, $offset)
            ->get()->getResultArray();

        return [
            "data"     => $data,
            "total"    => $total,
            "page"     => $page,
            "per_page" => $perPage,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private helpers
    // ═══════════════════════════════════════════════════════════════════════

    private function sumByTypes(int $projectId, int $unitId, string $sourceType, array $moveTypes): float
    {
        $row = $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('unit_id', $unitId)
            ->where('budget_source_type', $sourceType)
            ->whereIn('movement_type', $moveTypes)
            ->where('status', 'approved')
            ->get()->getRowArray();
        return (float) ($row['total'] ?? 0);
    }

    private function sumByType(int $projectId, int $unitId, string $sourceType, string $moveType): float
    {
        $row = $this->db->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $projectId)
            ->where('unit_id', $unitId)
            ->where('budget_source_type', $sourceType)
            ->where('movement_type', $moveType)
            ->where('status', 'approved')
            ->get()->getRowArray();
        return (float) ($row['total'] ?? 0);
    }

    /**
     * ออกเลขที่เคลื่อนไหวงบ — ใช้ NumberSeriesService (SELECT ... FOR UPDATE ป้องกัน race condition)
     */
    private function generateMovementNo(int $projectId, ?int $createdBy = null): string
    {
        return $this->numberSeriesSvc->generate(
            $projectId,
            'BUDGET_MOVE',
            null,
            'budget_movements',
            $createdBy
        );
    }
}
