<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class RemoveAreaSqmFromProjectUnits extends Migration
{
    public function up(): void
    {
        // ลบ column area_sqm ออกจาก project_units
        // เนื่องจากใช้ area_sqm จาก house_models แทน (JOIN ตอน query)
        $this->forge->dropColumn('project_units', 'area_sqm');
    }

    public function down(): void
    {
        // คืน column area_sqm กลับถ้า rollback
        $this->forge->addColumn('project_units', [
            'area_sqm' => [
                'type'       => 'DECIMAL',
                'constraint' => '10,2',
                'null'       => true,
                'after'      => 'building',
            ],
        ]);
    }
}
