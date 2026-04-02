<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateUnitBudgetAllocationsTable extends Migration
{
    public function up(): void
    {
        // ตารางตั้งงบผูกยูนิต: เชื่อมงบประเภทต่างๆ เข้ากับยูนิต
        // UNIQUE(unit_id, budget_source_type) — แต่ละยูนิตมีงบแต่ละประเภทได้ครั้งเดียว
        $this->forge->addField([
            'id'                 => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'unit_id'            => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'project_id'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'budget_source_type' => [
                'type'       => 'ENUM',
                'constraint' => ['PROJECT_POOL', 'MANAGEMENT_SPECIAL'],
            ],
            'allocated_amount'   => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'movement_id'        => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'note'               => ['type' => 'TEXT', 'null' => true],
            'created_by'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at'         => ['type' => 'DATETIME', 'null' => true],
            'updated_at'         => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['unit_id', 'budget_source_type']);
        $this->forge->addForeignKey('unit_id', 'project_units', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('movement_id', 'budget_movements', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('unit_budget_allocations', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('unit_budget_allocations', true);
    }
}
