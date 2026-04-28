<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateSyncTargetTablesAndUpdatePresets extends Migration
{
    public function up(): void
    {
        // ตารางเก็บรายการ table เป้าหมายที่รองรับการ sync จาก API ภายนอก
        $this->forge->addField([
            'id'                  => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'table_name'          => ['type' => 'VARCHAR', 'constraint' => 100],
            'label'               => ['type' => 'VARCHAR', 'constraint' => 255],
            'default_upsert_key'  => ['type' => 'VARCHAR', 'constraint' => 100],
            'is_active'           => ['type' => 'BOOLEAN', 'default' => true],
            'created_at'          => ['type' => 'DATETIME', 'null' => true],
            'updated_at'          => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('table_name');

        $this->forge->createTable('sync_target_tables', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);

        // เพิ่ม target_table — ระบุ table เป้าหมายสำหรับ preset นี้
        $this->db->query("ALTER TABLE `api_field_mapping_presets` ADD COLUMN `target_table` VARCHAR(100) NOT NULL DEFAULT 'project_units' AFTER `name`");

        // เพิ่ม upsert_key — ระบุ field ที่ใช้เป็น key สำหรับ upsert
        $this->db->query("ALTER TABLE `api_field_mapping_presets` ADD COLUMN `upsert_key` VARCHAR(100) NOT NULL DEFAULT 'unit_code' AFTER `target_table`");

        // seed ค่าเริ่มต้น: project_units เป็น sync target แรก
        $this->db->table('sync_target_tables')->insert([
            'table_name'         => 'project_units',
            'label'              => 'ยูนิตโครงการ',
            'default_upsert_key' => 'unit_code',
            'is_active'          => 1,
            'created_at'         => date('Y-m-d H:i:s'),
            'updated_at'         => date('Y-m-d H:i:s'),
        ]);
    }

    public function down(): void
    {
        // ลบคอลัมน์ที่เพิ่มใน api_field_mapping_presets
        $this->db->query('ALTER TABLE `api_field_mapping_presets` DROP COLUMN `upsert_key`');
        $this->db->query('ALTER TABLE `api_field_mapping_presets` DROP COLUMN `target_table`');

        // ลบตาราง sync_target_tables
        $this->forge->dropTable('sync_target_tables', true);
    }
}
