<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ขยาย ENUM ของ `sales_transactions.additional_expense_mode` เพิ่มค่า `as_unit_expense`
 *
 * - add_to_net      : บวกเข้าราคาขายสุทธิ (ลูกค้าจ่ายเอง — ไม่กระทบงบ/กำไร)
 * - as_premium     : ของแถมเพิ่มเติม (บริษัทจ่ายให้ — หักจากงบผู้บริหาร MANAGEMENT_SPECIAL)
 * - as_unit_expense (ใหม่): บริษัทจ่ายให้ — ผูกกับรายการ expense_support ใน Panel A (หักจาก UNIT_STANDARD)
 *
 * ใช้ raw SQL `MODIFY COLUMN` เพราะ Forge ของ CI4 ไม่รองรับการแก้ ENUM แบบ alter
 * idempotent — เช็ค INFORMATION_SCHEMA ก่อน
 */
class AddAsUnitExpenseToAdditionalExpenseModeEnum extends Migration
{
    public function up(): void
    {
        $colType = $this->getColumnType();
        if ($colType === null) {
            return; // ไม่มี column → ข้าม (migration ก่อนหน้ายังไม่ถูกรัน)
        }
        if (str_contains($colType, "'as_unit_expense'")) {
            return; // มีค่าแล้ว — idempotent
        }

        $this->db->query(
            "ALTER TABLE `sales_transactions` "
            . "MODIFY COLUMN `additional_expense_mode` "
            . "ENUM('add_to_net','as_premium','as_unit_expense') NOT NULL DEFAULT 'add_to_net'"
        );
    }

    public function down(): void
    {
        $colType = $this->getColumnType();
        if ($colType === null || !str_contains($colType, "'as_unit_expense'")) {
            return;
        }

        // เคลียร์ row ที่ใช้ค่าใหม่ก่อน rollback (กัน data ค้าง)
        $this->db->table('sales_transactions')
            ->where('additional_expense_mode', 'as_unit_expense')
            ->update(['additional_expense_mode' => 'add_to_net']);

        $this->db->query(
            "ALTER TABLE `sales_transactions` "
            . "MODIFY COLUMN `additional_expense_mode` "
            . "ENUM('add_to_net','as_premium') NOT NULL DEFAULT 'add_to_net'"
        );
    }

    private function getColumnType(): ?string
    {
        $row = $this->db->query(
            "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
            . "WHERE TABLE_SCHEMA = DATABASE() "
            . "AND TABLE_NAME = 'sales_transactions' "
            . "AND COLUMN_NAME = 'additional_expense_mode'"
        )->getRowArray();
        return $row['COLUMN_TYPE'] ?? null;
    }
}
