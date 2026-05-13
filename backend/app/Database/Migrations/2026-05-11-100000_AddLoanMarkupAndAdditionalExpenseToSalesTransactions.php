<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่ม 3 คอลัมน์รองรับ "ขอบวกเพิ่ม" และ "ค่าใช้จ่ายบวกเพิ่ม" ในรายการขาย
 *
 * - loan_markup_amount       : ขอบวกเพิ่มเพื่อยื่นกู้ธนาคาร (virtual — ไม่กระทบงบ/กำไร แสดงคู่ขนาน)
 * - additional_expense_amount: ค่าธรรมเนียมโอน (ค่าใช้จ่ายบวกเพิ่ม)
 * - additional_expense_mode  : โหมดการคิดค่าธรรมเนียมโอน
 *     - add_to_net : บวกเข้าราคาขายสุทธิ (ลูกค้าจ่ายเอง — ไม่กระทบกำไร/งบ)
 *     - as_premium : ของแถมเพิ่มเติม (บริษัทจ่ายให้ — หักจากงบผู้บริหาร MANAGEMENT_SPECIAL)
 *
 * idempotent — run ซ้ำได้
 */
class AddLoanMarkupAndAdditionalExpenseToSalesTransactions extends Migration
{
    public function up(): void
    {
        $columns = [];

        if (!$this->db->fieldExists('loan_markup_amount', 'sales_transactions')) {
            $columns['loan_markup_amount'] = [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'default'    => 0,
                'after'      => 'contract_price',
            ];
        }

        if (!$this->db->fieldExists('additional_expense_amount', 'sales_transactions')) {
            $columns['additional_expense_amount'] = [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'default'    => 0,
                'after'      => 'loan_markup_amount',
            ];
        }

        if (!$this->db->fieldExists('additional_expense_mode', 'sales_transactions')) {
            $columns['additional_expense_mode'] = [
                'type'       => 'ENUM',
                'constraint' => ['add_to_net', 'as_premium'],
                'default'    => 'add_to_net',
                'after'      => 'additional_expense_amount',
            ];
        }

        if (!empty($columns)) {
            $this->forge->addColumn('sales_transactions', $columns);
        }
    }

    public function down(): void
    {
        foreach (['additional_expense_mode', 'additional_expense_amount', 'loan_markup_amount'] as $col) {
            if ($this->db->fieldExists($col, 'sales_transactions')) {
                $this->forge->dropColumn('sales_transactions', $col);
            }
        }
    }
}
