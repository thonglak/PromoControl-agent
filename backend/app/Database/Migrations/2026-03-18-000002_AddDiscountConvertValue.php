<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddDiscountConvertValue extends Migration
{
    public function up()
    {
        $this->forge->addColumn('promotion_item_master', [
            'discount_convert_value' => [
                'type' => 'DECIMAL',
                'constraint' => '15,2',
                'null' => true,
                'default' => null,
                'after' => 'default_used_value',
            ],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('promotion_item_master', 'discount_convert_value');
    }
}
