<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class UpdateSalesTransactionTables extends Migration
{
    public function up(): void
    {
        // อัปเดต sales_transactions: เปลี่ยน status enum + เพิ่ม total_promo_burden
        $this->forge->modifyColumn('sales_transactions', [
            'status' => [
                'type'       => 'ENUM',
                'constraint' => ['draft', 'confirmed', 'cancelled'],
                'default'    => 'draft',
            ],
        ]);

        $this->forge->addColumn('sales_transactions', [
            'total_promo_burden' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'default'    => 0,
                'after'      => 'total_expense_support',
            ],
        ]);

        // อัปเดต sales_transaction_items: เพิ่ม convert_to_discount และ manual_input_value
        $this->forge->addColumn('sales_transaction_items', [
            'convert_to_discount' => [
                'type'       => 'TINYINT',
                'constraint' => 1,
                'default'    => 0,
                'after'      => 'effective_category',
            ],
            'manual_input_value' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => true,
                'after'      => 'used_value',
            ],
        ]);
    }

    public function down(): void
    {
        // Rollback sales_transaction_items
        $this->forge->dropColumn('sales_transaction_items', ['convert_to_discount', 'manual_input_value']);

        // Rollback sales_transactions
        $this->forge->dropColumn('sales_transactions', ['total_promo_burden']);
        $this->forge->modifyColumn('sales_transactions', [
            'status' => [
                'type'       => 'ENUM',
                'constraint' => ['draft', 'pending', 'approved'],
                'default'    => 'draft',
            ],
        ]);
    }
}
