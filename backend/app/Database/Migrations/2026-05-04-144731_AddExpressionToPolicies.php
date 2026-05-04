<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddExpressionToPolicies extends Migration
{
    public function up(): void
    {
        // เพิ่ม override_expression + condition_expression ใน fee_rate_policies
        // - override_expression: สูตร override (เช่น "contract_price * 0.015")
        // - condition_expression: เงื่อนไขแบบ boolean (เช่น "contract_price > 5000000")
        // เก็บ override_rate, override_buyer_share, conditions (JSON) ไว้สำหรับ backward compat
        $this->forge->addColumn('fee_rate_policies', [
            'override_expression' => [
                'type' => 'TEXT',
                'null' => true,
                'after' => 'override_buyer_share',
            ],
            'condition_expression' => [
                'type' => 'TEXT',
                'null' => true,
                'after' => 'override_expression',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('fee_rate_policies', ['override_expression', 'condition_expression']);
    }
}
