<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateBudgetMovementsTable extends Migration
{
    public function up(): void
    {
        // ตาราง ledger งบประมาณ — ทุกการเปลี่ยนแปลงงบต้องผ่านตารางนี้
        // balance ต้องคำนวณจาก SUM(amount) เสมอ — ห้าม update balance โดยตรง
        $this->forge->addField([
            'id'                 => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'movement_no'        => ['type' => 'VARCHAR', 'constraint' => 50],
            'project_id'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'unit_id'            => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'movement_type'      => [
                'type'       => 'ENUM',
                'constraint' => [
                    'ALLOCATE', 'USE', 'RETURN', 'ADJUST',
                    'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE',
                    'SPECIAL_BUDGET_USE', 'SPECIAL_BUDGET_RETURN',
                ],
            ],
            'budget_source_type' => [
                'type'       => 'ENUM',
                'constraint' => ['UNIT_STANDARD', 'PROJECT_POOL', 'MANAGEMENT_SPECIAL'],
            ],
            'amount'             => ['type' => 'DECIMAL', 'constraint' => '15,2'],
            'status'             => ['type' => 'ENUM', 'constraint' => ['pending', 'approved'], 'default' => 'pending'],
            'reference_id'       => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'reference_type'     => ['type' => 'VARCHAR', 'constraint' => 50, 'null' => true],
            'note'               => ['type' => 'TEXT', 'null' => true],
            'created_by'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at'         => ['type' => 'DATETIME', 'null' => true],
            'updated_at'         => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('movement_no');
        $this->forge->addKey(['unit_id', 'budget_source_type', 'status']); // INDEX สำหรับคำนวณยอดงบต่อยูนิต
        $this->forge->addKey('project_id');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('unit_id', 'project_units', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('budget_movements', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('budget_movements', true);
    }
}
