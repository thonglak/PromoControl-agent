<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateSalesTransactionsTable extends Migration
{
    public function up(): void
    {
        // ตารางรายการขาย: บันทึกการขายพร้อมราคา ส่วนลด และกำไร
        // profit คำนวณจาก net_price - total_cost — ห้ามเปลี่ยนสูตร
        $this->forge->addField([
            'id'                    => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'sale_no'               => ['type' => 'VARCHAR', 'constraint' => 50],
            'project_id'            => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'unit_id'               => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'base_price'            => ['type' => 'DECIMAL', 'constraint' => '15,2'],
            'unit_cost'             => ['type' => 'DECIMAL', 'constraint' => '15,2'],
            'net_price'             => ['type' => 'DECIMAL', 'constraint' => '15,2'],
            'total_cost'            => ['type' => 'DECIMAL', 'constraint' => '15,2'],
            'profit'                => ['type' => 'DECIMAL', 'constraint' => '15,2'],
            'total_discount'        => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'total_promo_cost'      => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'total_expense_support' => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'customer_name'         => ['type' => 'VARCHAR', 'constraint' => 255],
            'salesperson'           => ['type' => 'VARCHAR', 'constraint' => 255],
            'sale_date'             => ['type' => 'DATE'],
            'status'                => ['type' => 'ENUM', 'constraint' => ['draft', 'pending', 'approved'], 'default' => 'draft'],
            'created_by'            => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at'            => ['type' => 'DATETIME', 'null' => true],
            'updated_at'            => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('sale_no');
        $this->forge->addKey(['project_id', 'status']);
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('unit_id', 'project_units', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('sales_transactions', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('sales_transactions', true);
    }
}
