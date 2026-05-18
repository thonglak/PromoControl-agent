<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เปลี่ยน UNIQUE constraint ของ sales_transactions.sale_no
 *
 * เดิม: UNIQUE(sale_no) — global cross-project → ทุก project ต้องไม่ชน
 *       ปัญหา: number_series แยกต่อ project แต่ทุก project ใช้ prefix SO + format ปีเดียวกัน
 *              → SO-2569-0001 ของ project A ชนกับ SO-2569-0001 ของ project B
 *
 * ใหม่: UNIQUE(project_id, sale_no) — composite → unique ต่อ project
 */
class ChangeSaleNoUniqueToComposite extends Migration
{
    public function up(): void
    {
        // drop unique key เดิม (key_name = 'sale_no')
        $this->db->query('ALTER TABLE sales_transactions DROP INDEX `sale_no`');

        // add composite unique
        $this->db->query('ALTER TABLE sales_transactions ADD UNIQUE INDEX `sale_no_per_project` (`project_id`, `sale_no`)');
    }

    public function down(): void
    {
        $this->db->query('ALTER TABLE sales_transactions DROP INDEX `sale_no_per_project`');
        $this->db->query('ALTER TABLE sales_transactions ADD UNIQUE INDEX `sale_no` (`sale_no`)');
    }
}
