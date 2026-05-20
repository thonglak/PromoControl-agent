<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ตาราง promotion_value_sources — ทะเบียนแหล่งข้อมูลค่ารายยูนิต (value_mode=unit_table)
 *
 * ย้าย registry จากโค้ด → DB เพื่อให้ admin เพิ่ม/แก้ source ได้เองจากหน้าจอ
 * resolver เป็น generic: query {amount_column} จาก {source_table}
 * โดย match {item_column}=promotion_item_id และ {unit_column}=unit_id
 *
 * ชื่อตาราง/คอลัมน์ถูกตรวจกับ information_schema ก่อนใช้งานเสมอ (กัน SQL injection)
 * is_system=1 = source ที่ระบบสร้าง ลบไม่ได้
 */
class CreatePromotionValueSourcesTable extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('promotion_value_sources')) {
            return;
        }

        $this->forge->addField([
            'id'            => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'source_key'    => ['type' => 'VARCHAR', 'constraint' => 50],
            'label'         => ['type' => 'VARCHAR', 'constraint' => 255],
            'description'   => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'source_table'  => ['type' => 'VARCHAR', 'constraint' => 64],
            'item_column'   => ['type' => 'VARCHAR', 'constraint' => 64],
            'unit_column'   => ['type' => 'VARCHAR', 'constraint' => 64],
            'amount_column' => ['type' => 'VARCHAR', 'constraint' => 64],
            'is_active'     => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'is_system'     => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'created_at'    => ['type' => 'DATETIME', 'null' => true],
            'updated_at'    => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('source_key');

        $this->forge->createTable('promotion_value_sources', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);

        // Seed: แหล่งข้อมูลในตัว — จำนวนเงินรายยูนิตจากการนำเข้า Premium.xlsx
        $now = date('Y-m-d H:i:s');
        $this->db->table('promotion_value_sources')->insert([
            'source_key'    => 'promotion_item_unit_value',
            'label'         => 'ค่ารายยูนิตจากการนำเข้า',
            'description'   => 'ดึงจำนวนเงินรายยูนิตจากตาราง promotion_item_unit_values (นำเข้าจาก Premium.xlsx)',
            'source_table'  => 'promotion_item_unit_values',
            'item_column'   => 'promotion_item_id',
            'unit_column'   => 'unit_id',
            'amount_column' => 'amount',
            'is_active'     => 1,
            'is_system'     => 1,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('promotion_value_sources', true);
    }
}
