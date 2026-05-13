<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่มคอลัมน์ discount_convert_value ใน sales_transaction_items
 *
 * รองรับการ "แยกก้อน" ของแถมงบยูนิตในรายการขายเดียวกัน เช่น แอร์ 60,000:
 *   - used_value             = 60,000  (ก้อนทั้งหมดที่หักจากงบยูนิต)
 *   - discount_convert_value = 40,000  (ส่วนที่แปลงเป็นส่วนลด)
 *   - ของแถมจริง (premium part) = used_value - discount_convert_value = 20,000
 *
 * Backfill: rows เดิมที่ convert_to_discount=1 → set discount_convert_value = used_value
 * เพื่อรักษา behavior เดิม (ก้อนทั้งหมดถือเป็น discount)
 *
 * idempotent — run ซ้ำได้
 */
class AddDiscountConvertValueToSalesTransactionItems extends Migration
{
    public function up(): void
    {
        if (!$this->db->fieldExists('discount_convert_value', 'sales_transaction_items')) {
            $this->forge->addColumn('sales_transaction_items', [
                'discount_convert_value' => [
                    'type'       => 'DECIMAL',
                    'constraint' => '15,2',
                    'default'    => 0,
                    'after'      => 'used_value',
                ],
            ]);

            // Backfill: convert_to_discount=1 → discount_convert_value = used_value
            $this->db->query(
                'UPDATE `sales_transaction_items` '
                . 'SET `discount_convert_value` = `used_value` '
                . 'WHERE `convert_to_discount` = 1'
            );
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('discount_convert_value', 'sales_transaction_items')) {
            $this->forge->dropColumn('sales_transaction_items', 'discount_convert_value');
        }
    }
}
