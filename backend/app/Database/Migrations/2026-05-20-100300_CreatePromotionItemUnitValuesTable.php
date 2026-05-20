<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ตาราง promotion_item_unit_values — จำนวนเงินของแถมระดับ unit
 *
 * เดิม schema มีแค่ promotion_item_units (เชื่อม item ↔ unit ว่าใช้ได้/ไม่ได้)
 * แต่ไม่มีที่เก็บ "จำนวนเงิน" ที่ต่างกันรายแปลง
 * (เช่น คชจ ฟรีวันโอน คำนวณตามราคาบ้าน → ทุกแปลงไม่เท่ากัน)
 *
 * ตารางนี้คือปลายทางของการ sync จาก premium_import_values:
 *   1 แถว = จำนวนเงินของแถม 1 รายการ ของ 1 unit
 * ถ้า unit ใดไม่มีแถวที่นี่ = ใช้ promotion_item_master.default_value แทน
 */
class CreatePromotionItemUnitValuesTable extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('promotion_item_unit_values')) {
            return;
        }

        $this->forge->addField([
            'id'                => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'promotion_item_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'unit_id'           => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'amount'            => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'source_batch_id'   => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true], // batch ที่ sync ค่านี้เข้ามา
            'created_at'        => ['type' => 'DATETIME', 'null' => true],
            'updated_at'        => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['promotion_item_id', 'unit_id']); // 1 ของแถม มีค่าได้ค่าเดียวต่อ unit
        $this->forge->addForeignKey('promotion_item_id', 'promotion_item_master', 'id', 'RESTRICT', 'CASCADE');
        $this->forge->addForeignKey('unit_id', 'project_units', 'id', 'RESTRICT', 'CASCADE');
        $this->forge->addForeignKey('source_batch_id', 'premium_import_batches', 'id', 'RESTRICT', 'SET NULL');

        $this->forge->createTable('promotion_item_unit_values', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('promotion_item_unit_values', true);
    }
}
