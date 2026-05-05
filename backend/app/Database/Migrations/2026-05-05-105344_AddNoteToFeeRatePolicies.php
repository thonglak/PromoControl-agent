<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddNoteToFeeRatePolicies extends Migration
{
    public function up(): void
    {
        // เพิ่ม note (หมายเหตุภายในของ policy) — optional
        $this->forge->addColumn('fee_rate_policies', [
            'note' => [
                'type' => 'TEXT',
                'null' => true,
                'after' => 'condition_expression',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('fee_rate_policies', 'note');
    }
}
