<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePromotionItemHouseModelsTable extends Migration
{
    public function up(): void
    {
        // ตารางเชื่อม: รายการส่งเสริมการขาย ↔ แบบบ้านที่ใช้ได้
        // ถ้าไม่มีข้อมูล = ใช้ได้กับทุกแบบบ้าน
        $this->forge->addField([
            'id'                 => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'promotion_item_id'  => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'house_model_id'     => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['promotion_item_id', 'house_model_id']);
        $this->forge->addForeignKey('promotion_item_id', 'promotion_item_master', 'id', 'RESTRICT', 'CASCADE');
        $this->forge->addForeignKey('house_model_id', 'house_models', 'id', 'RESTRICT', 'CASCADE');

        $this->forge->createTable('promotion_item_house_models', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('promotion_item_house_models', true);
    }
}
