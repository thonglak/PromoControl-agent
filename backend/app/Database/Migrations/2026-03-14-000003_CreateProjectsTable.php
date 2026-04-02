<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateProjectsTable extends Migration
{
    public function up(): void
    {
        // ตารางโครงการ: เก็บข้อมูลโครงการอสังหาริมทรัพย์ทั้งหมด
        $this->forge->addField([
            'id'                 => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'code'               => ['type' => 'VARCHAR', 'constraint' => 50],
            'name'               => ['type' => 'VARCHAR', 'constraint' => 255],
            'description'        => ['type' => 'TEXT', 'null' => true],
            'company_name'       => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'location'           => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'project_type'       => ['type' => 'ENUM', 'constraint' => ['condo', 'house', 'townhouse', 'mixed']],
            'approval_required'  => ['type' => 'BOOLEAN', 'default' => true],
            'pool_budget_amount' => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'status'             => ['type' => 'ENUM', 'constraint' => ['active', 'inactive', 'completed'], 'default' => 'active'],
            'start_date'         => ['type' => 'DATE', 'null' => true],
            'end_date'           => ['type' => 'DATE', 'null' => true],
            'created_at'         => ['type' => 'DATETIME', 'null' => true],
            'updated_at'         => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('code');

        $this->forge->createTable('projects', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('projects', true);
    }
}
