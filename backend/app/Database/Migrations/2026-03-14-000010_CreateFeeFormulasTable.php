<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateFeeFormulasTable extends Migration
{
    public function up(): void
    {
        // ตารางสูตรคำนวณค่าธรรมเนียม — ผูก 1:1 กับ promotion_item ที่ value_mode='calculated'
        // base_field: ฐานคำนวณ — appraisal_price, base_price, net_price, หรือ manual_input
        $this->forge->addField([
            'id'                  => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'promotion_item_id'   => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'base_field'          => ['type' => 'ENUM', 'constraint' => ['appraisal_price', 'base_price', 'net_price', 'manual_input']],
            'manual_input_label'  => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'default_rate'        => ['type' => 'DECIMAL', 'constraint' => '10,6', 'default' => 0],
            'buyer_share'         => ['type' => 'DECIMAL', 'constraint' => '5,4', 'default' => 1.0],
            'description'         => ['type' => 'TEXT', 'null' => true],
            'created_at'          => ['type' => 'DATETIME', 'null' => true],
            'updated_at'          => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('promotion_item_id'); // 1 item : 1 สูตร
        $this->forge->addForeignKey('promotion_item_id', 'promotion_item_master', 'id', 'RESTRICT', 'CASCADE');

        $this->forge->createTable('fee_formulas', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('fee_formulas', true);
    }
}
