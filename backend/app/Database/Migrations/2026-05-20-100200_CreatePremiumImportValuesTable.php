<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ตาราง premium_import_values — ค่าของแถมรายแปลงแบบ long-format
 *
 * 1 แถว = 1 รายการของแถม ของ 1 แปลง
 * เก็บแบบแนวตั้ง (long-format) เพราะคอลัมน์ของแถมในแต่ละชีต/โครงการไม่เท่ากัน
 * (เช่น SBT มี 3 รายการ / TCE มี 5 รายการ) — ไม่ต้อง ALTER TABLE เมื่อมีของแถมใหม่
 *
 * premium_label   = ชื่อหัวคอลัมน์ตามไฟล์ Excel เป๊ะ ๆ (เช่น "คชจ ฟรีวันโอน", "Air นอนใหญ่")
 * premium_category = หมวดตามกฎระบบ:
 *   expense_support = ค่าใช้จ่าย (คชจ ฟรีวันโอน)
 *   premium         = ของแถม (Air *, กันขโมย)
 *   discount        = ส่วนลด (ส่วนลด, ลดเพิ่ม)
 * promotion_item_id = จับคู่กับ promotion_item_master ตอน validate (เติมภายหลัง)
 */
class CreatePremiumImportValuesTable extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('premium_import_values')) {
            return;
        }

        $this->forge->addField([
            'id'                => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'import_unit_id'    => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'premium_label'     => ['type' => 'VARCHAR', 'constraint' => 255],
            'premium_category'  => ['type' => 'ENUM', 'constraint' => ['discount', 'premium', 'expense_support']],
            'amount'            => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'column_index'      => ['type' => 'TINYINT', 'constraint' => 3, 'unsigned' => true, 'default' => 0], // ลำดับคอลัมน์ของแถมในชีต
            'promotion_item_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at'        => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['import_unit_id', 'premium_label']); // ของแถมชื่อเดียวกันห้ามซ้ำในแปลงเดียว
        $this->forge->addForeignKey('import_unit_id', 'premium_import_units', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('promotion_item_id', 'promotion_item_master', 'id', 'RESTRICT', 'SET NULL');

        $this->forge->createTable('premium_import_values', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('premium_import_values', true);
    }
}
