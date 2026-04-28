<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddUnitTypeIdToProjectUnits extends Migration
{
    public function up(): void
    {
        // เพิ่ม unit_type_id (FK → unit_types.id) ใน project_units
        // แทนที่ unit_type VARCHAR เดิม — ใช้ FK ไปยัง unit_types master ของโครงการ
        $fields = [
            'unit_type_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
                'null'       => true,
                'after'      => 'unit_type',
            ],
        ];
        $this->forge->addColumn('project_units', $fields);

        // เพิ่ม INDEX และ FK สำหรับ unit_type_id
        $this->db->query('ALTER TABLE `project_units` ADD INDEX `idx_unit_type_id` (`unit_type_id`)');
        $this->db->query('ALTER TABLE `project_units` ADD CONSTRAINT `fk_project_units_unit_type_id` FOREIGN KEY (`unit_type_id`) REFERENCES `unit_types` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT');
    }

    public function down(): void
    {
        $this->db->query('ALTER TABLE `project_units` DROP FOREIGN KEY `fk_project_units_unit_type_id`');
        $this->db->query('ALTER TABLE `project_units` DROP INDEX `idx_unit_type_id`');
        $this->forge->dropColumn('project_units', 'unit_type_id');
    }
}
