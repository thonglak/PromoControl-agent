<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddMeterInstallFeesToProjects extends Migration
{
    public function up(): void
    {
        // เพิ่มค่าติดตั้งมิเตอร์ไฟฟ้า + ประปา ใน projects
        $this->forge->addColumn('projects', [
            'electric_meter_fee' => [
                'type'       => 'DECIMAL',
                'constraint' => '10,2',
                'null'       => true,
                'default'    => 0,
                'after'      => 'common_fee_rate',
            ],
            'water_meter_fee' => [
                'type'       => 'DECIMAL',
                'constraint' => '10,2',
                'null'       => true,
                'default'    => 0,
                'after'      => 'electric_meter_fee',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('projects', ['electric_meter_fee', 'water_meter_fee']);
    }
}
