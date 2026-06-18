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

    /**
     * Insert แล้วดึง row กลับ — รวม error handling เป็นจุดเดียว
     * ป้องกันกรณี insert silent fail หรือ insertID() คืน 0
     * @throws RuntimeException ถ้า insert ล้มเหลว / อ่าน row กลับไม่ได้
     */
    private function insertAndFetch(string $table, array $payload): array
    {
        $ok = $this->db->table($table)->insert($payload);
        $insertId = (int) $this->db->insertID();

        if ($ok === false || $insertId <= 0) {
            $err = $this->db->error();
            $msg = $err['message'] ?? 'unknown DB error';
            throw new RuntimeException("บันทึก {$table} ไม่สำเร็จ: {$msg}");
        }

        $row = $this->db->table($table)->where('id', $insertId)->get()->getRowArray();
        if ($row === null) {
            throw new RuntimeException("บันทึก {$table} id={$insertId} แล้วแต่อ่านข้อมูลกลับไม่ได้");
        }

        return $row;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. getPoolBalance
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

        // budget_movement อนุมัติทันทีเสมอ — ไม่มีขั้นตอนรออนุมัติงบแล้ว
        $status = 'approved';

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

        return $this->insertAndFetch('budget_movements', [
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
            'approved_by'        => $data['created_by'] ?? null,
            'approved_at'        => $now,
            'created_at'         => $now,
        ]);
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

        // 7. budget_movement อนุมัติทันทีเสมอ — ไม่มีขั้นตอนรออนุมัติงบแล้ว
        $status = 'approved';

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
                'approved_by'        => $createdBy,
                'approved_at'        => $now,
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
    // 10. voidSpecialBudget — ยกเลิกงบพิเศษทั้งก้อน
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ยกเลิกงบพิเศษที่ตั้งไว้ (Void)
     * ใช้เมื่อตั้งงบผิด/ไม่ต้องการแล้ว
     *
     * กฎ:
     * - ยกเลิกได้เฉพาะ MANAGEMENT_SPECIAL / PROJECT_POOL
     * - ยกเลิกได้ตราบใดที่ยังมีงบที่ "ตั้งไว้" (มี movement ALLOCATE/ADD/TRANSFER_IN ที่ approved)
     *   แม้ใช้งบไปแล้วทั้งหมด (remaining ≤ 0) — สำหรับ MGMT_SPECIAL remaining ติดลบได้
     * - note optional (default 'ยกเลิกงบ')
     * - สร้าง movement type = SPECIAL_BUDGET_VOID, amount = -(ยอดที่ยกเลิก)
     * - remaining > 0 → void ALLOCATE เฉพาะยอดคงเหลือสุทธิ (อาจ over-void เมื่อ used > 0)
     *   remaining ≤ 0 → void ALLOCATE ทั้งก้อนที่ตั้งไว้
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

        // 2. note: optional — default 'ยกเลิกงบ' ถ้าว่าง
        if (trim($note) === '') {
            $note = 'ยกเลิกงบ';
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

        // 4. Summary + movements ที่จะยกเลิก
        //    ยกเลิกได้ตราบใดที่ยังมี "งบที่ตั้งไว้" (movement ALLOCATE/ADD/TRANSFER_IN ที่ approved)
        //    ไม่เช็ค remaining > 0 เพราะงบที่ถูกใช้ไปแล้ว (remaining ≤ 0) ก็ต้องยกเลิกการตั้งงบได้
        //    — งบผู้บริหารยอมให้ remaining ติดลบหลังยกเลิก (งบบริหารจัดการเอง)
        $summary   = $this->getUnitBudgetSummary($projectId, $unitId);
        $srcData   = $summary[$sourceType] ?? ['allocated' => 0, 'used' => 0, 'remaining' => 0];
        $allocated = $srcData['allocated'];
        $used      = $srcData['used'];
        $remaining = $srcData['remaining'];

        // void จากใหม่สุดไปเก่าสุด
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

        // ไม่มีงบที่ตั้งไว้ (ไม่มี movement ให้ void) → ยกเลิกไม่ได้
        if (empty($allocMovements)) {
            throw new RuntimeException('ไม่มีงบที่จะยกเลิก');
        }

        $now = date('Y-m-d H:i:s');

        $this->db->transBegin();
        try {
            // 5. Void ALLOCATE
            //    - remaining > 0 → void เฉพาะยอดคงเหลือสุทธิ (remaining) คงประวัติ used /
            //      RETURN จากยกเลิกขายที่เคยเพิ่ม Pool ไว้ไม่ให้กระทบ
            //    - remaining ≤ 0 (ใช้งบเกินที่ตั้ง) → void ทั้งก้อน, remaining จะติดลบ = -used หลัง void
            $voidAll = $remaining <= 0;
            $toVoid  = $remaining;
            $voided  = 0;
            foreach ($allocMovements as $mov) {
                if (!$voidAll && $toVoid <= 0) break;
                $movAmt = abs((float) $mov['amount']);
                $this->db->table('budget_movements')
                    ->where('id', $mov['id'])
                    ->update(['status' => 'voided', 'updated_at' => $now]);
                $toVoid -= $movAmt;
                $voided += $movAmt;
            }

            // ยอดที่บันทึกใน VOID log: remaining > 0 → ยอดคงเหลือสุทธิ, remaining ≤ 0 → ยอด gross ที่ void จริง
            $voidLogAmount = $remaining > 0 ? $remaining : $voided;

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
                    'amount'             => -$voidLogAmount,
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
    // 11b. autoReturnRemainingOnTransfer — คืนงบเหลือทั้งหมดเข้า Pool (ใช้ตอนโอนกรรมสิทธิ์)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * คืน remaining ทั้ง 3 source กลับ Pool — สำหรับเรียกตอนโอนกรรมสิทธิ์
     *
     * คุณสมบัติ:
     * - ไม่จัดการ transaction เอง (caller ต้องครอบ transBegin/transCommit ให้)
     * - ไม่ check unit.status (เพราะตอนโอน status อาจยังไม่ commit)
     * - ข้ามถ้าไม่มีงบเหลือ (return [])
     * - Reference type = 'sales_transaction_transfer' เพื่อ trace ที่มา
     *
     * @return array ข้อมูล RETURN movements ที่สร้าง (empty ถ้าไม่มีงบเหลือ)
     */
    public function autoReturnRemainingOnTransfer(
        int $projectId,
        int $unitId,
        int $transactionId,
        int $createdBy,
        string $note = 'คืนงบเข้า Pool อัตโนมัติ (โอนกรรมสิทธิ์)'
    ): array {
        $summary       = $this->getUnitBudgetSummary($projectId, $unitId);
        $unitRemaining = $summary['UNIT_STANDARD']['remaining']      ?? 0;
        $poolRemaining = $summary['PROJECT_POOL']['remaining']       ?? 0;
        $mgmtRemaining = $summary['MANAGEMENT_SPECIAL']['remaining'] ?? 0;

        // ปัดเศษกัน floating-point เกือบ 0 (เช่น 0.00001)
        $unitRemaining = round($unitRemaining, 2);
        $poolRemaining = round($poolRemaining, 2);
        $mgmtRemaining = round($mgmtRemaining, 2);

        if ($unitRemaining <= 0 && $poolRemaining <= 0 && $mgmtRemaining <= 0) {
            return [];
        }

        $now      = date('Y-m-d H:i:s');
        $movements = [];

        $sources = [
            ['UNIT_STANDARD',      $unitRemaining],
            ['PROJECT_POOL',       $poolRemaining],
            ['MANAGEMENT_SPECIAL', $mgmtRemaining],
        ];

        foreach ($sources as [$source, $amount]) {
            if ($amount <= 0) continue;
            $movementNo = $this->generateMovementNo($projectId, $createdBy);
            $this->db->table('budget_movements')->insert([
                'movement_no'        => $movementNo,
                'project_id'         => $projectId,
                'unit_id'            => $unitId,
                'movement_type'      => 'RETURN',
                'budget_source_type' => $source,
                'amount'             => $amount,
                'status'             => 'approved',
                'reference_id'       => $transactionId,
                'reference_type'     => 'sales_transaction_transfer',
                'note'               => $note,
                'created_by'         => $createdBy,
                'approved_by'        => $createdBy,
                'approved_at'        => $now,
                'created_at'         => $now,
            ]);
            $movements[] = [
                'source' => $source,
                'amount' => $amount,
            ];
        }

        return $movements;
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
