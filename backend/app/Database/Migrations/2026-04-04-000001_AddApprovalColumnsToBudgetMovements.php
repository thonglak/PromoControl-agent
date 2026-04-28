<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่มคอลัมน์ approved_by, approved_at ให้ budget_movements
 * — ใช้ติดตามว่าใครอนุมัติและเมื่อไหร่
 */
class AddApprovalColumnsToBudgetMovements extends Migration
{
    public function up(): void
    {
        if (!$this->db->fieldExists('approved_by', 'budget_movements')) {
            $this->forge->addColumn('budget_movements', [
                'approved_by' => [
                    'type'       => 'BIGINT',
                    'constraint' => 20,
                    'unsigned'   => true,
                    'null'       => true,
                    'after'      => 'created_by',
                ],
            ]);
        }

        if (!$this->db->fieldExists('approved_at', 'budget_movements')) {
            $this->forge->addColumn('budget_movements', [
                'approved_at' => [
                    'type'  => 'DATETIME',
                    'null'  => true,
                    'after' => 'approved_by',
                ],
            ]);
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('approved_at', 'budget_movements')) {
            $this->forge->dropColumn('budget_movements', 'approved_at');
        }
        if ($this->db->fieldExists('approved_by', 'budget_movements')) {
            $this->forge->dropColumn('budget_movements', 'approved_by');
        }
    }
}
