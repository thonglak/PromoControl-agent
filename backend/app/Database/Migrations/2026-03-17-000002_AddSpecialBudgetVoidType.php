<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddSpecialBudgetVoidType extends Migration
{
    public function up(): void
    {
        $this->db->query("ALTER TABLE budget_movements MODIFY COLUMN movement_type ENUM(
            'ALLOCATE', 'USE', 'RETURN', 'ADJUST',
            'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE',
            'SPECIAL_BUDGET_USE', 'SPECIAL_BUDGET_RETURN',
            'SPECIAL_BUDGET_TRANSFER_OUT', 'SPECIAL_BUDGET_TRANSFER_IN',
            'SPECIAL_BUDGET_VOID'
        ) NOT NULL");
    }

    public function down(): void
    {
        $this->db->query("ALTER TABLE budget_movements MODIFY COLUMN movement_type ENUM(
            'ALLOCATE', 'USE', 'RETURN', 'ADJUST',
            'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE',
            'SPECIAL_BUDGET_USE', 'SPECIAL_BUDGET_RETURN',
            'SPECIAL_BUDGET_TRANSFER_OUT', 'SPECIAL_BUDGET_TRANSFER_IN'
        ) NOT NULL");
    }
}
