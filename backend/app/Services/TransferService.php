<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * TransferService — โอนกรรมสิทธิ์ยูนิต
 *
 * กฎสำคัญ:
 * 1. เฉพาะ transaction.status = 'active' เท่านั้น
 * 2. เฉพาะ unit.status = 'sold' เท่านั้น
 * 3. transfer_date ต้องไม่เกินวันปัจจุบัน
 * 4. เปลี่ยน unit.status → 'transferred'
 * 5. บันทึก transfer_date, transferred_by, transferred_at
 * 6. เปลี่ยนแล้วย้อนกลับไม่ได้
 */
class TransferService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    public function markAsTransferred(int $transactionId, string $transferDate, int $transferredBy): array
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

            // 2. ตรวจ transaction status
            if ($transaction['status'] !== 'active') {
                throw new RuntimeException('ไม่สามารถโอนกรรมสิทธิ์ได้ — รายการถูกยกเลิกแล้ว');
            }

            // 3. ตรวจสถานะยูนิต
            $unit = $this->db->table('project_units')
                ->where('id', $transaction['unit_id'])
                ->get()->getRowArray();

            if (!$unit) {
                throw new RuntimeException('ไม่พบยูนิต');
            }

            if ($unit['status'] !== 'sold') {
                if ($unit['status'] === 'transferred') {
                    throw new RuntimeException('ยูนิตนี้โอนกรรมสิทธิ์แล้ว');
                }
                throw new RuntimeException('ไม่สามารถโอนกรรมสิทธิ์ได้ — สถานะยูนิตต้องเป็น "ขายแล้ว" เท่านั้น');
            }

            // 4. ตรวจ transfer_date ไม่เกินวันปัจจุบัน
            $transferDateObj = new \DateTime($transferDate);
            $today = new \DateTime('today');
            if ($transferDateObj > $today) {
                throw new RuntimeException('วันที่โอนต้องไม่เกินวันปัจจุบัน');
            }

            $now = date('Y-m-d H:i:s');

            // 5. อัปเดตสถานะยูนิต
            $this->db->table('project_units')
                ->where('id', $transaction['unit_id'])
                ->update([
                    'status'     => 'transferred',
                    'updated_at' => $now,
                ]);

            // 6. อัปเดต transaction
            $this->db->table('sales_transactions')
                ->where('id', $transactionId)
                ->update([
                    'transfer_date'  => $transferDate,
                    'transferred_by' => $transferredBy,
                    'transferred_at' => $now,
                    'updated_at'     => $now,
                ]);

            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException($e->getMessage());
        }

        // ดึงชื่อผู้บันทึก
        $transferredByUser = $this->db->table('users')
            ->select('name')
            ->where('id', $transferredBy)
            ->get()->getRowArray();

        return [
            'transaction_id' => $transactionId,
            'unit_status'    => 'transferred',
            'transfer_date'  => $transferDate,
            'transferred_by' => $transferredByUser['name'] ?? '',
            'transferred_at' => $now,
        ];
    }
}
