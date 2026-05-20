<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่มโหมดค่า unit_table ให้ promotion_item_master
 *
 * unit_table = ดึงจำนวนเงินรายยูนิตจากตาราง (เช่น promotion_item_unit_values)
 * value_source = key ของแหล่งข้อมูล — ใช้เมื่อ value_mode = unit_table
 */
class AddUnitTableValueMode extends Migration
{
    public function up(): void
    {
        $this->db->query(
            "ALTER TABLE `promotion_item_master`
             MODIFY `value_mode` ENUM('fixed','actual','manual','calculated','unit_table')
             NOT NULL DEFAULT 'fixed'"
        );

        $this->forge->addColumn('promotion_item_master', [
            'value_source' => [
                'type'       => 'VARCHAR',
                'constraint' => 50,
                'null'       => true,
                'after'      => 'value_mode',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('promotion_item_master', 'value_source');

        // คืน enum เดิม (ถ้ามีแถวที่ใช้ unit_table อยู่ คำสั่งนี้จะ error — ต้องแก้ข้อมูลก่อน)
        $this->db->query(
            "ALTER TABLE `promotion_item_master`
             MODIFY `value_mode` ENUM('fixed','actual','manual','calculated')
             NOT NULL DEFAULT 'fixed'"
        );
    }
}
