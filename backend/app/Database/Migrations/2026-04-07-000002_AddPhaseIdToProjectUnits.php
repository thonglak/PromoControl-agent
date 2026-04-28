<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddPhaseIdToProjectUnits extends Migration
{
    public function up(): void
    {
        // เพิ่ม phase_id (FK → project_phases.id) ใน project_units
        // nullable เพราะ unit เดิมยังไม่มี phase
        $fields = [
            'phase_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
                'null'       => true,
                'after'      => 'project_id',
            ],
        ];
        $this->forge->addColumn('project_units', $fields);

        // เพิ่ม INDEX และ FK สำหรับ phase_id
        $this->db->query('ALTER TABLE `project_units` ADD INDEX `idx_phase_id` (`phase_id`)');
        $this->db->query('ALTER TABLE `project_units` ADD CONSTRAINT `fk_project_units_phase_id` FOREIGN KEY (`phase_id`) REFERENCES `project_phases` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT');
    }

    public function down(): void
    {
        $this->db->query('ALTER TABLE `project_units` DROP FOREIGN KEY `fk_project_units_phase_id`');
        $this->db->query('ALTER TABLE `project_units` DROP INDEX `idx_phase_id`');
        $this->forge->dropColumn('project_units', 'phase_id');
    }
}
