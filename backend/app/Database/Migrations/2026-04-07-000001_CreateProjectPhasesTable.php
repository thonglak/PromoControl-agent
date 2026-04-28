<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateProjectPhasesTable extends Migration
{
    public function up(): void
    {
        // ตาราง Phase ของโครงการ เช่น "Phase 1", "Phase 2"
        // ใช้สำหรับแบ่งกลุ่มยูนิตตามเฟสการขาย
        $this->forge->addField([
            'id'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'name'       => ['type' => 'VARCHAR', 'constraint' => 100],
            // ลำดับการแสดงผล — ยิ่งน้อยยิ่งแสดงก่อน
            'sort_order' => ['type' => 'INT', 'default' => 0],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        // ชื่อ phase ห้ามซ้ำภายในโครงการเดียวกัน
        $this->forge->addUniqueKey(['project_id', 'name']);
        $this->forge->addKey(['project_id', 'sort_order']);
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('project_phases', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('project_phases', true);
    }
}
