<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateBottomLinesTable extends Migration
{
    public function up(): void
    {
        // ตารางประวัติ import ราคาต้นทุน
        // backup_table_name: ชื่อตาราง backup ที่สร้างโดยอัตโนมัติเมื่อ import (เพื่อ rollback)
        $this->forge->addField([
            'id'                 => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'import_key'         => ['type' => 'VARCHAR', 'constraint' => 100],
            'project_id'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'file_name'          => ['type' => 'VARCHAR', 'constraint' => 255],
            'total_rows'         => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'matched_rows'       => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'unmatched_rows'     => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'updated_rows'       => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'backup_table_name'  => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'mapping_preset_id'  => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'status'             => ['type' => 'ENUM', 'constraint' => ['completed', 'failed', 'rolled_back']],
            'note'               => ['type' => 'TEXT', 'null' => true],
            'imported_by'        => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'imported_at'        => ['type' => 'DATETIME'],
            'created_at'         => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('import_key');
        $this->forge->addKey('project_id');
        // mapping_preset_id ใช้ SET NULL เพราะ preset อาจถูกลบหลังจาก import แล้ว
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('mapping_preset_id', 'bottom_line_mapping_presets', 'id', 'RESTRICT', 'SET NULL');
        $this->forge->addForeignKey('imported_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('bottom_lines', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('bottom_lines', true);
    }
}
