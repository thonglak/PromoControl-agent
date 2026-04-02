<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddTransferTypesAndReferenceId extends Migration
{
    public function up(): void
    {
        // 1. เพิ่ม ENUM values: SPECIAL_BUDGET_TRANSFER_OUT, SPECIAL_BUDGET_TRANSFER_IN
        $this->db->query("ALTER TABLE budget_movements MODIFY COLUMN movement_type ENUM(
            'ALLOCATE', 'USE', 'RETURN', 'ADJUST',
            'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE',
            'SPECIAL_BUDGET_USE', 'SPECIAL_BUDGET_RETURN',
            'SPECIAL_BUDGET_TRANSFER_OUT', 'SPECIAL_BUDGET_TRANSFER_IN'
        ) NOT NULL");

        // 2. เพิ่ม status 'voided' ถ้ายังไม่มี
        $result = $this->db->query("SHOW COLUMNS FROM budget_movements LIKE 'status'")->getRowArray();
        if ($result && strpos($result['Type'], 'voided') === false) {
            $this->db->query("ALTER TABLE budget_movements MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'voided') DEFAULT 'pending'");
        }
    }

    public function down(): void
    {
        $this->db->query("ALTER TABLE budget_movements MODIFY COLUMN movement_type ENUM(
            'ALLOCATE', 'USE', 'RETURN', 'ADJUST',
            'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE',
            'SPECIAL_BUDGET_USE', 'SPECIAL_BUDGET_RETURN'
        ) NOT NULL");
    }
}
