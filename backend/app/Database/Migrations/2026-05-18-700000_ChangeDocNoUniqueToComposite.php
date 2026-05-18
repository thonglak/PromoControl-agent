<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เปลี่ยน UNIQUE constraint ของ document number ใน 2 table เป็น composite per project
 *
 * เดิม:
 *   budget_movements.movement_no — UNIQUE global
 *   bottom_lines.import_key      — UNIQUE global
 * ปัญหาเดียวกับ sales_transactions.sale_no — ทุก project ใช้ prefix + format ปีเดียวกัน
 * ผ่าน number_series → generate เลข run no ของแต่ละ project ที่ชนกันได้
 *
 * ใหม่:
 *   UNIQUE(project_id, movement_no)
 *   UNIQUE(project_id, import_key)
 */
class ChangeDocNoUniqueToComposite extends Migration
{
    public function up(): void
    {
        // budget_movements
        $this->db->query('ALTER TABLE budget_movements DROP INDEX `movement_no`');
        $this->db->query('ALTER TABLE budget_movements ADD UNIQUE INDEX `movement_no_per_project` (`project_id`, `movement_no`)');

        // bottom_lines
        $this->db->query('ALTER TABLE bottom_lines DROP INDEX `import_key`');
        $this->db->query('ALTER TABLE bottom_lines ADD UNIQUE INDEX `import_key_per_project` (`project_id`, `import_key`)');
    }

    public function down(): void
    {
        $this->db->query('ALTER TABLE budget_movements DROP INDEX `movement_no_per_project`');
        $this->db->query('ALTER TABLE budget_movements ADD UNIQUE INDEX `movement_no` (`movement_no`)');

        $this->db->query('ALTER TABLE bottom_lines DROP INDEX `import_key_per_project`');
        $this->db->query('ALTER TABLE bottom_lines ADD UNIQUE INDEX `import_key` (`import_key`)');
    }
}
