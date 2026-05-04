<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddContractPriceToSalesTransactions extends Migration
{
    public function up(): void
    {
        // เพิ่ม contract_price (ราคาหน้าสัญญา) ใน sales_transactions
        // เก็บแยกจาก base_price/net_price เพื่อใช้อ้างอิงทางสัญญา/audit
        // NULL allowed เพื่อรองรับข้อมูลเก่า — backend บังคับ required เฉพาะรายการใหม่/แก้ไข
        $this->forge->addColumn('sales_transactions', [
            'contract_price' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => true,
                'after'      => 'sale_date',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('sales_transactions', 'contract_price');
    }
}
