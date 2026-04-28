<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ย้าย land_area_sqw จาก house_models → project_units
 * เหตุผล: บ้าน type เดียวกัน ขนาดที่ดินต่างกันได้ ต้องเก็บที่ระดับ unit
 */
class MoveLandAreaToProjectUnits extends Migration
{
    public function up(): void
    {
        // เพิ่ม land_area_sqw ใน project_units (หลัง area_sqm)
        $this->forge->addColumn('project_units', [
            'land_area_sqw' => [
                'type'       => 'DECIMAL',
                'constraint' => '10,2',
                'null'       => true,
                'after'      => 'area_sqm',
            ],
        ]);

        // คัดลอกค่า land_area_sqw จาก house_models → project_units (เฉพาะ unit ที่ยังไม่มีค่า)
        $this->db->query('
            UPDATE project_units pu
            INNER JOIN house_models hm ON hm.id = pu.house_model_id
            SET pu.land_area_sqw = hm.land_area_sqw
            WHERE pu.land_area_sqw IS NULL
              AND hm.land_area_sqw IS NOT NULL
        ');

        // ลบ land_area_sqw จาก house_models
        $this->forge->dropColumn('house_models', 'land_area_sqw');
    }

    public function down(): void
    {
        // คืน land_area_sqw กลับไป house_models
        $this->forge->addColumn('house_models', [
            'land_area_sqw' => [
                'type'       => 'DECIMAL',
                'constraint' => '10,2',
                'null'       => true,
                'after'      => 'area_sqm',
            ],
        ]);

        $this->forge->dropColumn('project_units', 'land_area_sqw');
    }
}
