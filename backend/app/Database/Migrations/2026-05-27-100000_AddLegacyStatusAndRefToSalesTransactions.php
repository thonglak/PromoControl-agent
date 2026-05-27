<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่มสถานะ 'legacy' + คอลัมน์ legacy_ref ใน sales_transactions
 *
 * - 'legacy' = รายการขายที่ sync มาจากระบบเก่า (Caldiscount discount_records)
 *   ระบบเก่ากระทบยอดงบไปแล้ว → ไม่นับเข้างบใดๆ ของระบบนี้
 *   ทุก budget query กรองด้วย status='active' อยู่แล้ว จึงตัด 'legacy' ออกอัตโนมัติ
 * - legacy_ref = dir_code จาก caldiscount.discount_records (trace กลับไปยัง record ต้นทาง)
 */
class AddLegacyStatusAndRefToSalesTransactions extends Migration
{
    public function up(): void
    {
        $this->forge->modifyColumn('sales_transactions', [
            'status' => [
                'type'       => 'ENUM',
                'constraint' => ['draft', 'confirmed', 'active', 'cancelled', 'legacy'],
                'default'    => 'active',
            ],
        ]);

        if (!$this->db->fieldExists('legacy_ref', 'sales_transactions')) {
            $this->forge->addColumn('sales_transactions', [
                'legacy_ref' => [
                    'type'       => 'VARCHAR',
                    'constraint' => 20,
                    'null'       => true,
                    'after'      => 'status',
                ],
            ]);
        }
    }

    public function down(): void
    {
        // เคลียร์ค่าก่อน revert enum กัน truncate error
        $this->db->table('sales_transactions')->where('status', 'legacy')->delete();

        if ($this->db->fieldExists('legacy_ref', 'sales_transactions')) {
            $this->forge->dropColumn('sales_transactions', 'legacy_ref');
        }

        $this->forge->modifyColumn('sales_transactions', [
            'status' => [
                'type'       => 'ENUM',
                'constraint' => ['draft', 'confirmed', 'active', 'cancelled'],
                'default'    => 'active',
            ],
        ]);
    }
}
