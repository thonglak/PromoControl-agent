<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddExpressionModeToFeeFormulas extends Migration
{
    public function up(): void
    {
        // เพิ่ม 'expression' ใน ENUM base_field + เพิ่มคอลัมน์ formula_expression
        // expression mode: เขียนสูตรเอง ใช้ตัวแปรหลายตัวบวก/คูณกันได้
        $this->forge->modifyColumn('fee_formulas', [
            'base_field' => [
                'type'       => 'ENUM',
                'constraint' => ['appraisal_price', 'base_price', 'net_price', 'manual_input', 'expression'],
            ],
        ]);

        $this->forge->addColumn('fee_formulas', [
            'formula_expression' => [
                'type' => 'TEXT',
                'null' => true,
                'after' => 'manual_input_label',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('fee_formulas', 'formula_expression');
        $this->forge->modifyColumn('fee_formulas', [
            'base_field' => [
                'type'       => 'ENUM',
                'constraint' => ['appraisal_price', 'base_price', 'net_price', 'manual_input'],
            ],
        ]);
    }
}
