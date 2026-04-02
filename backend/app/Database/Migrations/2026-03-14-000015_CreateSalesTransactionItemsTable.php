<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateSalesTransactionItemsTable extends Migration
{
    public function up(): void
    {
        // ตารางรายการของแถม/ส่วนลดต่อการขาย
        // effective_category ขับเคลื่อนการคำนวณ — premium อาจแปลงเป็น discount ได้
        $this->forge->addField([
            'id'                    => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'sales_transaction_id'  => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'promotion_item_id'     => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'original_category'     => ['type' => 'ENUM', 'constraint' => ['discount', 'premium', 'expense_support']],
            'effective_category'    => ['type' => 'ENUM', 'constraint' => ['discount', 'premium', 'expense_support']],
            'used_value'            => ['type' => 'DECIMAL', 'constraint' => '15,2'],
            'funding_source_type'   => [
                'type'       => 'ENUM',
                'constraint' => ['UNIT_STANDARD', 'PROJECT_POOL', 'MANAGEMENT_SPECIAL'],
            ],
            'remark'                => ['type' => 'TEXT', 'null' => true],
            'created_at'            => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('sales_transaction_id');
        $this->forge->addForeignKey('sales_transaction_id', 'sales_transactions', 'id', 'RESTRICT', 'CASCADE');
        $this->forge->addForeignKey('promotion_item_id', 'promotion_item_master', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('sales_transaction_items', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('sales_transaction_items', true);
    }
}
