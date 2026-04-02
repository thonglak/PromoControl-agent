<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePromotionItemMasterTable extends Migration
{
    public function up(): void
    {
        // ตาราง master รายการของแถม/ส่วนลด — ใช้ร่วมกันทุกโครงการ
        // category: discount=ส่วนลด, premium=ของแถม, expense_support=ค่าใช้จ่าย
        // value_mode: fixed=ค่าคงที่, actual=ตามจริง, manual=กรอกเอง, calculated=คำนวณจากสูตร
        $this->forge->addField([
            'id'                 => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'code'               => ['type' => 'VARCHAR', 'constraint' => 50],
            'name'               => ['type' => 'VARCHAR', 'constraint' => 255],
            'category'           => ['type' => 'ENUM', 'constraint' => ['discount', 'premium', 'expense_support']],
            'default_value'      => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'max_value'          => ['type' => 'DECIMAL', 'constraint' => '15,2', 'null' => true],
            'default_used_value' => ['type' => 'DECIMAL', 'constraint' => '15,2', 'null' => true],
            'value_mode'         => ['type' => 'ENUM', 'constraint' => ['fixed', 'actual', 'manual', 'calculated'], 'default' => 'fixed'],
            'is_unit_standard'   => ['type' => 'BOOLEAN', 'default' => false],
            'sort_order'         => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'eligible_start_date'=> ['type' => 'DATE', 'null' => true],
            'eligible_end_date'  => ['type' => 'DATE', 'null' => true],
            'created_at'         => ['type' => 'DATETIME', 'null' => true],
            'updated_at'         => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('sort_order');

        $this->forge->createTable('promotion_item_master', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('promotion_item_master', true);
    }
}
