<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddProjectIdAndIsActiveToPromotionItemMaster extends Migration
{
    public function up(): void
    {
        // เพิ่ม project_id — ของแถมแยกตามโครงการ ไม่ใช้ร่วมกันข้ามโครงการ
        $fields = [
            'project_id' => [
                'type'       => 'BIGINT',
                'constraint' => 20,
                'unsigned'   => true,
                'null'       => false,
                'after'      => 'id',
            ],
        ];
        $this->forge->addColumn('promotion_item_master', $fields);

        // เพิ่ม is_active — ใช้ soft-disable รายการของแถมโดยไม่ต้องลบ
        $fields2 = [
            'is_active' => [
                'type'       => 'TINYINT',
                'constraint' => 1,
                'null'       => false,
                'default'    => 1,
                'after'      => 'is_unit_standard',
            ],
        ];
        $this->forge->addColumn('promotion_item_master', $fields2);

        // INDEX บน project_id สำหรับ query กรองตามโครงการ
        $this->db->query('ALTER TABLE `promotion_item_master` ADD INDEX `idx_pim_project_id` (`project_id`)');

        // FK: project_id → projects.id
        $this->db->query('ALTER TABLE `promotion_item_master` ADD CONSTRAINT `fk_pim_project_id` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE');

        // UNIQUE KEY (project_id, code) — รหัสของแถมซ้ำได้ข้ามโครงการ แต่ห้ามซ้ำภายในโครงการเดียวกัน
        $this->db->query('ALTER TABLE `promotion_item_master` ADD UNIQUE KEY `uq_pim_project_code` (`project_id`, `code`)');
    }

    public function down(): void
    {
        // ลบ FK, UNIQUE KEY, INDEX ก่อนถึงจะ DROP คอลัมน์ได้
        $this->db->query('ALTER TABLE `promotion_item_master` DROP FOREIGN KEY `fk_pim_project_id`');
        $this->db->query('ALTER TABLE `promotion_item_master` DROP INDEX `uq_pim_project_code`');
        $this->db->query('ALTER TABLE `promotion_item_master` DROP INDEX `idx_pim_project_id`');

        $this->forge->dropColumn('promotion_item_master', 'project_id');
        $this->forge->dropColumn('promotion_item_master', 'is_active');
    }
}
