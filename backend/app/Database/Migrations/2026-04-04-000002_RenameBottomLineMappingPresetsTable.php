<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class RenameBottomLineMappingPresetsTable extends Migration
{
    public function up(): void
    {
        // เปลี่ยนชื่อตารางให้ตรงกับ schema doc และ code ที่ใช้งาน
        $this->forge->renameTable('bottom_line_mapping_presets', 'bottom_line_mappings');
    }

    public function down(): void
    {
        $this->forge->renameTable('bottom_line_mappings', 'bottom_line_mapping_presets');
    }
}
