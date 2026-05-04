<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddCommonFeeRateToProjects extends Migration
{
    public function up(): void
    {
        // เพิ่ม common_fee_rate (อัตราค่าส่วนกลาง) ใน projects
        // เก็บเป็น DECIMAL เผื่อกรณีอัตรามีทศนิยม (เช่น 35.50)
        $this->forge->addColumn('projects', [
            'common_fee_rate' => [
                'type'       => 'DECIMAL',
                'constraint' => '10,2',
                'null'       => true,
                'default'    => 0,
                'after'      => 'pool_budget_amount',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('projects', 'common_fee_rate');
    }
}
