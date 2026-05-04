<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่มคอลัมน์ cancel_date (วันที่ที่ใช้ยกเลิกขายจริง — บังคับกรอกเมื่อยกเลิก)
 *
 * แยกออกจาก cancelled_at (timestamp ที่ระบบบันทึก) เพราะ:
 * - cancelled_at = เวลาที่กดในระบบ
 * - cancel_date = วันที่ทางธุรกิจที่ใช้ยกเลิก (อาจย้อนหลังได้)
 *
 * idempotent — run ซ้ำได้
 */
class AddCancelDateToSalesTransactions extends Migration
{
    public function up(): void
    {
        if (!$this->db->fieldExists('cancel_date', 'sales_transactions')) {
            $this->forge->addColumn('sales_transactions', [
                'cancel_date' => [
                    'type'  => 'DATE',
                    'null'  => true,
                    'after' => 'cancelled_at',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('cancel_date', 'sales_transactions')) {
            $this->forge->dropColumn('sales_transactions', 'cancel_date');
        }
    }
}
