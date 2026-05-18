<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่ม 4 columns ใหม่ใน project_legacy_reconciliation สำหรับข้อมูลกระทบยอดระบบเก่าเพิ่มเติม
 *
 * - legacy_sold_units              : จำนวนยูนิตที่ขายไปแล้วในระบบเก่า
 * - legacy_sold_net_price          : มูลค่าขายสุทธิระบบเก่า
 * - legacy_total_discount_amount   : มูลค่าส่วนลดรวมระบบเก่า
 * - legacy_value_achieved          : มูลค่าโครงการที่ทำได้ระบบเก่า
 */
class AddLegacySalesFieldsToProjectLegacyReconciliation extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('project_legacy_reconciliation', [
            'legacy_sold_units' => [
                'type'       => 'INT',
                'constraint' => 11,
                'null'       => false,
                'default'    => 0,
                'after'      => 'legacy_total_profit',
            ],
            'legacy_sold_net_price' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => false,
                'default'    => 0,
                'after'      => 'legacy_sold_units',
            ],
            'legacy_total_discount_amount' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => false,
                'default'    => 0,
                'after'      => 'legacy_sold_net_price',
            ],
            'legacy_value_achieved' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => false,
                'default'    => 0,
                'after'      => 'legacy_total_discount_amount',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('project_legacy_reconciliation', [
            'legacy_sold_units',
            'legacy_sold_net_price',
            'legacy_total_discount_amount',
            'legacy_value_achieved',
        ]);
    }
}
