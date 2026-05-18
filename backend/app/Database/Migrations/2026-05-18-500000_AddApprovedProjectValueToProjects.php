<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่ม column `approved_project_value` ใน projects
 *
 * - NULL/0 = ใช้ fallback คำนวณจาก SUM(base_price) ของ project_units (ระบบใหม่)
 * - > 0    = ใช้ค่าที่ user กรอกเอง (override ตัวคำนวณ + Dashboard combined ไม่บวก legacy units อีก)
 */
class AddApprovedProjectValueToProjects extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('projects', [
            'approved_project_value' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => true,
                'default'    => null,
                'after'      => 'pool_budget_amount',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('projects', ['approved_project_value']);
    }
}
