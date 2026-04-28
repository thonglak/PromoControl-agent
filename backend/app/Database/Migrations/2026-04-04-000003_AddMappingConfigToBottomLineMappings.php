<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddMappingConfigToBottomLineMappings extends Migration
{
    public function up(): void
    {
        // เพิ่ม mapping_config JSON column ตาม schema doc
        // ใช้เก็บ column mapping เช่น { "unit_code_column": "A", "unit_cost_column": "B" }
        $this->forge->addColumn('bottom_line_mappings', [
            'mapping_config' => [
                'type' => 'JSON',
                'null' => true,
                'after' => 'preset_name',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('bottom_line_mappings', 'mapping_config');
    }
}
