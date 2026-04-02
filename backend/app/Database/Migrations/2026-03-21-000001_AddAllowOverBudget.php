<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddAllowOverBudget extends Migration
{
    public function up(): void
    {
        // เพิ่ม flag อนุญาตให้บันทึกเกินงบได้ (ค่าเริ่มต้น = ไม่อนุญาต)
        $this->forge->addColumn('projects', [
            'allow_over_budget' => [
                'type' => 'BOOLEAN',
                'default' => false,
                'after' => 'approval_required',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('projects', 'allow_over_budget');
    }
}
