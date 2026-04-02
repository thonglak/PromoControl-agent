<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateBottomLineMappingPresetsTable extends Migration
{
    public function up(): void
    {
        // ตาราง preset ตั้งค่า column mapping สำหรับ Excel import ราคาต้นทุน
        // แต่ละ project มีได้หลาย preset; is_default = ใช้โดยอัตโนมัติเมื่อ import
        $this->forge->addField([
            'id'          => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id'  => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'preset_name' => ['type' => 'VARCHAR', 'constraint' => 255],
            'is_default'  => ['type' => 'BOOLEAN', 'default' => false],
            'created_by'  => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at'  => ['type' => 'DATETIME', 'null' => true],
            'updated_at'  => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey(['project_id', 'is_default']);
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('bottom_line_mapping_presets', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('bottom_line_mapping_presets', true);
    }
}
