<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class RemoveCustomerSalespersonColumns extends Migration
{
    public function up(): void
    {
        // ลบ customer_name และ salesperson จากตาราง sales_transactions
        $this->forge->dropColumn('sales_transactions', 'customer_name');
        $this->forge->dropColumn('sales_transactions', 'salesperson');

        // ลบ customer_name และ salesperson จากตาราง project_units
        $this->forge->dropColumn('project_units', 'customer_name');
        $this->forge->dropColumn('project_units', 'salesperson');
    }

    public function down(): void
    {
        // คืน customer_name และ salesperson ให้ sales_transactions
        $this->forge->addColumn('sales_transactions', [
            'customer_name' => [
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => true,
                'default'    => null,
                'after'      => 'unit_id',
            ],
            'salesperson' => [
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => true,
                'default'    => null,
                'after'      => 'customer_name',
            ],
        ]);

        // คืน customer_name และ salesperson ให้ project_units
        $this->forge->addColumn('project_units', [
            'customer_name' => [
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => true,
                'default'    => null,
            ],
            'salesperson' => [
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => true,
                'default'    => null,
            ],
        ]);
    }
}
