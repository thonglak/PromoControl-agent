<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateApiFieldMappingTables extends Migration
{
    public function up(): void
    {
        // ตารางเก็บ preset การ map field จาก API ภายนอกกับ project_units
        $this->forge->addField([
            'id'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'name'       => ['type' => 'VARCHAR', 'constraint' => 255],
            'is_default' => ['type' => 'BOOLEAN', 'default' => false],
            'created_by' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('project_id');
        $this->forge->addUniqueKey(['project_id', 'name']);
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'RESTRICT', 'SET NULL');

        $this->forge->createTable('api_field_mapping_presets', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);

        // ตารางเก็บรายละเอียดคู่ field (source → target) ของแต่ละ preset
        $this->forge->addField([
            'id'               => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'preset_id'        => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'source_field'     => ['type' => 'VARCHAR', 'constraint' => 255],
            'target_field'     => ['type' => 'VARCHAR', 'constraint' => 255],
            'transform_type'   => ['type' => 'ENUM', 'constraint' => ['none', 'number', 'date', 'status_map'], 'default' => 'none'],
            'transform_value'  => ['type' => 'TEXT', 'null' => true],
            'sort_order'       => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('preset_id');
        $this->forge->addForeignKey('preset_id', 'api_field_mapping_presets', 'id', 'CASCADE', 'CASCADE');

        $this->forge->createTable('api_field_mapping_columns', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('api_field_mapping_columns', true);
        $this->forge->dropTable('api_field_mapping_presets', true);
    }
}
