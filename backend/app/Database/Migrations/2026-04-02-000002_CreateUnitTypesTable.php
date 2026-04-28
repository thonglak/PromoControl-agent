<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateUnitTypesTable extends Migration
{
    public function up(): void
    {
        // ตารางประเภทยูนิต: กำหนดเองต่อโครงการ เช่น "บ้านเดี่ยว", "ทาวน์โฮม", "คอนโด 1 ห้องนอน"
        // ใช้เฉพาะโครงการ project_type='mixed' ที่มีหลายประเภทยูนิตในโครงการเดียว
        $this->forge->addField([
            'id'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            // ชื่อประเภทยูนิต เช่น "บ้านเดี่ยว", "ทาวน์โฮม", "Penthouse"
            'name'       => ['type' => 'VARCHAR', 'constraint' => 100],
            // ลำดับการแสดงผล — ยิ่งน้อยยิ่งแสดงก่อน
            'sort_order' => ['type' => 'INT', 'default' => 0],
            // สถานะ active/inactive — ถ้า false จะไม่แสดงในตัวเลือก
            'is_active'  => ['type' => 'BOOLEAN', 'default' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        // ชื่อห้ามซ้ำภายในโครงการเดียวกัน
        $this->forge->addUniqueKey(['project_id', 'name']);
        // INDEX สำหรับดึงรายการตาม project_id
        $this->forge->addKey('project_id');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('unit_types', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('unit_types', true);
    }
}
