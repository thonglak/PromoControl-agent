<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * CancelSaleService — ยกเลิกรายการขาย
 *
 * กฎสำคัญ:
 * 1. ยกเลิกได้เฉพาะ transaction status = 'active'
 * 2. ห้ามยกเลิกถ้ายูนิต status = 'transferred'
 * 3. ห้ามยกเลิกถ้ามี manual RETURN movement (คืนงบเข้า Pool แล้ว)
 * 4. UNIT_STANDARD: void เฉพาะ USE (งบคงอยู่กับยูนิต)
 * 5. PROJECT_POOL: void ALLOCATE + USE → Pool ได้งบคืนจาก voided ALLOCATE
 * 6. MANAGEMENT_SPECIAL: void เฉพาะ USE + สร้าง RETURN = ยอด ALLOCATE
 *    (ห้าม void ALLOCATE เพราะจะทำให้ remaining ติดลบ)
 *    → ALLOCATE คงอยู่, RETURN หักออก → remaining = 0
 *    → Pool เพิ่มจาก RETURN (getPoolBalance นับ RETURN ทุก source)
 * 7. เปลี่ยนสถานะยูนิตเป็น available
 * 8. ทั้งหมดอยู่ใน 1 DB transaction
 */
class CancelSaleService
{
    private BaseConnection $db;
    private NumberSeriesService $numberSeriesSvc;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->numberSeriesSvc = new NumberSeriesService();
    }

    private function generateMovementNo(int $projectId, ?int $createdBy = null): string
    {
        return $this->numberSeriesSvc->generate($projectId, 'BUDGET_MOVE', null, 'budget_movements', $createdBy);
    }

    /**
     * ยกเลิกรายการขาย
     *
     * @param int    $transactionId
     * @param string $cancelDate  YYYY-MM-DD วันที่ยกเลิก (required, validate ที่ controller)
     * @param string $reason      เหตุผล (optional — รับ '' ได้)
     * @param int    $cancelledBy
     */
    public function cancelSale(int $transactionId, string $cancelDate, string $reason, int $cancelledBy): array
    {
        $this->db->transBegin();

        try {
            // 1. ดึง transaction
            $transaction = $this->db->table('sales_transactions')
                ->where('id', $transactionId)
                ->get()->getRowArray();

            if (!$transaction) {
                throw new RuntimeException('ไม่พบรายการขาย');
            }

            // 2. ตรวจ status
            if ($transaction['status'] !== 'active') {
                throw new RuntimeException('รายการนี้ถูกยกเลิกแล้ว');
            }

            // 3. ตรวจสถานะยูนิต
            $unit = $this->db->table('project_units')
                ->where('id', $transaction['unit_id'])
                ->get()->getRowArray();

            if (!$unit) {
                throw new RuntimeException('ไม่พบยูนิต');
            }

            if ($unit['status'] === 'transferred') {
                throw new RuntimeException('ไม่สามารถยกเลิกได้ — ยูนิตโอนกรรมสิทธิ์แล้ว');
            }

            // 4. ตรวจ RETURN movement ที่ผู้ใช้สร้างเอง (ไม่รวม auto-return จากการยกเลิกขาย)
            $hasManualReturn = (int) $this->db->table('budget_movements')
                ->where('unit_id', $transaction['unit_id'])
                ->where('project_id', $transaction['project_id'])
                ->whereIn('movement_type', ['RETURN', 'SPECIAL_BUDGET_RETURN'])
                ->where('status', 'approved')
                ->groupStart()
                    ->where('reference_type IS NULL')
                    ->orWhere('reference_type !=', 'sales_transaction_cancel')
                ->groupEnd()
                ->countAllResults();

            if ($hasManualReturn > 0) {
                throw new RuntimeException('ไม่สามารถยกเลิกได้ — มีการคืนงบเข้า Pool แล้ว ต้อง void การคืนงบก่อน');
            }

            // 5. Void budget movements ที่เกี่ยวข้อง
            $voidedMovements = [];
            $now = date('Y-m-d H:i:s');
            $projectId = (int) $transaction['project_id'];
            $unitId    = (int) $transaction['unit_id'];

            // 5a. Void USE ของ UNIT_STANDARD (งบยูนิตคงอยู่กับยูนิต ไม่คืน Pool)
            $useMovements = $this->db->table('budget_movements')
                ->where('unit_id', $unitId)
                ->where('project_id', $projectId)
                ->where('budget_source_type', 'UNIT_STANDARD')
                ->whereIn('movement_type', ['USE', 'SPECIAL_BUDGET_USE'])
                ->where('status', 'approved')
                ->get()->getResultArray();

            foreach ($useMovements as $movement) {
                $this->db->table('budget_movements')
                    ->where('id', $movement['id'])
                    ->update(['status' => 'voided', 'updated_at' => $now]);

                $voidedMovements[] = [
                    'movement_id' => (int) $movement['id'],
                    'type'        => $movement['movement_type'],
                    'source'      => $movement['budget_source_type'],
                    'amount'      => (float) $movement['amount'],
                ];
            }

            // 5b. PROJECT_POOL: void ALLOCATE + USE
            //     → void ALLOCATE ทำให้ Pool ได้งบคืนอัตโนมัติ (getPoolBalance นับ PROJECT_POOL ALLOCATE)
            $poolMovements = $this->db->table('budget_movements')
                ->where('unit_id', $unitId)
                ->where('project_id', $projectId)
                ->where('budget_source_type', 'PROJECT_POOL')
                ->whereIn('movement_type', [
                    'ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE',
                    'USE', 'SPECIAL_BUDGET_USE',
                ])
                ->where('status', 'approved')
                ->get()->getResultArray();

            foreach ($poolMovements as $movement) {
                $this->db->table('budget_movements')
                    ->where('id', $movement['id'])
                    ->update(['status' => 'voided', 'updated_at' => $now]);

                $voidedMovements[] = [
                    'movement_id' => (int) $movement['id'],
                    'type'        => $movement['movement_type'],
                    'source'      => $movement['budget_source_type'],
                    'amount'      => (float) $movement['amount'],
                ];
            }

            // 5c. MANAGEMENT_SPECIAL: void เฉพาะ USE + สร้าง RETURN ย้ายงบเข้า Pool
            //     ห้าม void ALLOCATE! เพราะ:
            //     - getPoolBalance ไม่นับ MGMT ALLOCATE → void ไม่เพิ่ม Pool
            //     - ต้องสร้าง RETURN แทน → แต่ถ้า void ALLOCATE ด้วย remaining จะติดลบ
            //       (allocated=0, returned=X → remaining = -X)
            //     - คง ALLOCATE ไว้ + สร้าง RETURN → remaining = allocated - returned = 0 ✓
            $mgmtUseMovements = $this->db->table('budget_movements')
                ->where('unit_id', $unitId)
                ->where('project_id', $projectId)
                ->where('budget_source_type', 'MANAGEMENT_SPECIAL')
                ->whereIn('movement_type', ['USE', 'SPECIAL_BUDGET_USE'])
                ->where('status', 'approved')
                ->get()->getResultArray();

            foreach ($mgmtUseMovements as $movement) {
                $this->db->table('budget_movements')
                    ->where('id', $movement['id'])
                    ->update(['status' => 'voided', 'updated_at' => $now]);

                $voidedMovements[] = [
                    'movement_id' => (int) $movement['id'],
                    'type'        => $movement['movement_type'],
                    'source'      => $movement['budget_source_type'],
                    'amount'      => (float) $movement['amount'],
                ];
            }

            // คำนวณ RETURN ที่ต้องสร้าง = ALLOCATE - RETURN ที่มีอยู่แล้ว
            // ป้องกัน RETURN ซ้ำ (กรณียกเลิกหลายครั้ง ALLOCATE เดิมยังอยู่)
            $mgmtAllocRow = $this->db->table('budget_movements')
                ->selectSum('amount', 'total')
                ->where('unit_id', $unitId)
                ->where('project_id', $projectId)
                ->where('budget_source_type', 'MANAGEMENT_SPECIAL')
                ->whereIn('movement_type', ['ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'])
                ->where('status', 'approved')
                ->get()->getRowArray();
            $mgmtAllocatedTotal = abs((float) ($mgmtAllocRow['total'] ?? 0));

            $mgmtReturnRow = $this->db->table('budget_movements')
                ->selectSum('amount', 'total')
                ->where('unit_id', $unitId)
                ->where('project_id', $projectId)
                ->where('budget_source_type', 'MANAGEMENT_SPECIAL')
                ->whereIn('movement_type', ['RETURN', 'SPECIAL_BUDGET_RETURN'])
                ->where('status', 'approved')
                ->get()->getRowArray();
            $mgmtReturnedTotal = abs((float) ($mgmtReturnRow['total'] ?? 0));

            $mgmtToReturn = $mgmtAllocatedTotal - $mgmtReturnedTotal;

            // สร้าง RETURN เฉพาะส่วนที่ยังไม่เคยคืน → ป้องกัน Pool บวกซ้ำ
            if ($mgmtToReturn > 0) {
                $movementNo = $this->generateMovementNo($projectId, $cancelledBy);
                $this->db->table('budget_movements')->insert([
                    'movement_no'        => $movementNo,
                    'project_id'         => $projectId,
                    'unit_id'            => $unitId,
                    'movement_type'      => 'RETURN',
                    'budget_source_type' => 'MANAGEMENT_SPECIAL',
                    'amount'             => $mgmtToReturn,
                    'status'             => 'approved',
                    'reference_id'       => $transactionId,
                    'reference_type'     => 'sales_transaction_cancel',
                    'note'               => 'คืนงบผู้บริหารเข้า Pool อัตโนมัติ (ยกเลิกขาย)',
                    'created_by'         => $cancelledBy,
                    'approved_by'        => $cancelledBy,
                    'approved_at'        => $now,
                    'created_at'         => $now,
                ]);
            }

            // 6. อัปเดต transaction
            $this->db->table('sales_transactions')
                ->where('id', $transactionId)
                ->update([
                    'status'        => 'cancelled',
                    'cancelled_at'  => $now,
                    'cancelled_by'  => $cancelledBy,
                    'cancel_date'   => $cancelDate,
                    'cancel_reason' => $reason !== '' ? $reason : null,
                    'updated_at'    => $now,
                ]);

            // 7. อัปเดตสถานะยูนิต → available
            $this->db->table('project_units')
                ->where('id', $transaction['unit_id'])
                ->update([
                    'status'     => 'available',
                    'updated_at' => $now,
                ]);

            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException($e->getMessage());
        }

        // ดึงชื่อผู้ยกเลิก
        $cancelledByUser = $this->db->table('users')
            ->select('name')
            ->where('id', $cancelledBy)
            ->get()->getRowArray();

        return [
            'transaction_id'   => $transactionId,
            'status'           => 'cancelled',
            'cancelled_at'     => $now,
            'cancelled_by'     => $cancelledByUser['name'] ?? '',
            'cancel_date'      => $cancelDate,
            'cancel_reason'    => $reason !== '' ? $reason : null,
            'voided_movements' => $voidedMovements,
            'unit_status'      => 'available',
        ];
    }
}
