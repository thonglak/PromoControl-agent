<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * CancelSaleService — ยกเลิกรายการขาย
 *
 * แนวคิด: ยกเลิก = "เหมือนไม่มีอะไรเกิดขึ้น" — void ทุก movement ที่เกี่ยวข้อง
 * ไม่สร้าง RETURN ใหม่ ไม่ดันเงินเข้า Pool (balance ทุกแหล่งเด้งกลับสู่สภาพก่อนขาย)
 *
 * กฎสำคัญ:
 * 1. ยกเลิกได้เฉพาะ transaction status = 'active'
 * 2. ห้ามยกเลิกถ้ายูนิต status = 'transferred'
 * 3. ห้ามยกเลิกถ้ามี manual RETURN movement (กัน remaining ติดลบหลัง void ALLOCATE)
 * 4. UNIT_STANDARD: void เฉพาะ USE (งบคงอยู่กับยูนิต ALLOCATE ของยูนิตไม่เกี่ยวกับการขาย)
 * 5. PROJECT_POOL: void ALLOCATE + USE → Pool balance เด้งกลับเองเพราะ voided ไม่ถูกนับ
 * 6. MANAGEMENT_SPECIAL: void ALLOCATE + USE (ไม่สร้าง RETURN — งบ MGMT หายไปเหมือนไม่เคย allocate)
 * 7. เปลี่ยนสถานะยูนิตเป็น available
 * 8. ทั้งหมดอยู่ใน 1 DB transaction
 */
class CancelSaleService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
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
            if ($transaction['status'] === 'legacy') {
                throw new RuntimeException('รายการขายระบบเก่า (Caldiscount) ยกเลิกไม่ได้');
            }
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

            // 5c. MANAGEMENT_SPECIAL: void ทั้ง ALLOCATE + USE — เหมือนไม่เคย allocate งบ MGMT
            //     ไม่สร้าง RETURN ใหม่: งบผู้บริหารไม่ดันเข้า Pool ตอนยกเลิก
            //     guard ข้อ 3 (manual RETURN check) กัน remaining ติดลบจากกรณี
            //     ALLOCATE ถูก void แล้วยังมี RETURN เก่าค้างไว้
            $mgmtMovements = $this->db->table('budget_movements')
                ->where('unit_id', $unitId)
                ->where('project_id', $projectId)
                ->where('budget_source_type', 'MANAGEMENT_SPECIAL')
                ->whereIn('movement_type', [
                    'ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE',
                    'USE', 'SPECIAL_BUDGET_USE',
                ])
                ->where('status', 'approved')
                ->get()->getResultArray();

            foreach ($mgmtMovements as $movement) {
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
