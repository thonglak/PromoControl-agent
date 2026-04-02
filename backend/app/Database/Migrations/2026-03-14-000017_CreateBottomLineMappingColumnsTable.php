<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateBottomLineMappingColumnsTable extends Migration
{
    public function up(): void
    {
        // ตารางรายละเอียด column mapping: source_column (Excel) → target_field (ระบบ)
        // target_field เช่น: unit_code, unit_cost, appraisal_price
        $this->forge->addField([
            'id'                => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'mapping_preset_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'source_column'     => ['type' => 'VARCHAR', 'constraint' => 255],
            'target_field'      => ['type' => 'VARCHAR', 'constraint' => 100],
            'created_at'        => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('mapping_preset_id');
        $this->forge->addForeignKey('mapping_preset_id', 'bottom_line_mapping_presets', 'id', 'RESTRICT', 'CASCADE');

        $this->forge->createTable('bottom_line_mapping_columns', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('bottom_line_mapping_columns', true);
    }
}
