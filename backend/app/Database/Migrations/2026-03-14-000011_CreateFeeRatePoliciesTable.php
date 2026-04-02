<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateFeeRatePoliciesTable extends Migration
{
    public function up(): void
    {
        // ตารางมาตรการพิเศษ/นโยบายรัฐ — override อัตราค่าธรรมเนียม
        // conditions JSON: {"max_base_price": 3000000, "project_types": ["condo","house"]}
        $this->forge->addField([
            'id'                   => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'fee_formula_id'       => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'policy_name'          => ['type' => 'VARCHAR', 'constraint' => 255],
            'override_rate'        => ['type' => 'DECIMAL', 'constraint' => '10,6', 'default' => 0],
            'override_buyer_share' => ['type' => 'DECIMAL', 'constraint' => '5,4', 'null' => true],
            'conditions'           => ['type' => 'JSON', 'null' => true],
            'effective_from'       => ['type' => 'DATE'],
            'effective_to'         => ['type' => 'DATE'],
            'is_active'            => ['type' => 'BOOLEAN', 'default' => true],
            'priority'             => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'created_by'           => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at'           => ['type' => 'DATETIME', 'null' => true],
            'updated_at'           => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey(['fee_formula_id', 'is_active', 'priority']); // INDEX สำหรับค้นหา policy ที่ active
        $this->forge->addForeignKey('fee_formula_id', 'fee_formulas', 'id', 'RESTRICT', 'CASCADE');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('fee_rate_policies', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('fee_rate_policies', true);
    }
}
