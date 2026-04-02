<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่มคอลัมน์สำหรับยกเลิกขาย (cancel) + โอนกรรมสิทธิ์ (transfer)
 *
 * Cancel columns: cancelled_at, cancelled_by, cancel_reason
 * Transfer columns: transfer_date, transferred_by, transferred_at
 * Status ENUM: เพิ่ม 'active'
 *
 * ใช้ fieldExists() เพื่อ idempotent — run ซ้ำได้โดยไม่ error
 */
class AddCancelAndTransferColumns extends Migration
{
    public function up(): void
    {
        // --- อัปเดต status ENUM ให้รวม 'active' ---
        $this->forge->modifyColumn('sales_transactions', [
            'status' => [
                'type'       => 'ENUM',
                'constraint' => ['draft', 'confirmed', 'active', 'cancelled'],
                'default'    => 'active',
            ],
        ]);

        // --- Cancel columns ---
        if (!$this->db->fieldExists('cancelled_at', 'sales_transactions')) {
            $this->forge->addColumn('sales_transactions', [
                'cancelled_at' => [
                    'type'  => 'DATETIME',
                    'null'  => true,
                    'after' => 'status',
                ],
            ]);
        }

        if (!$this->db->fieldExists('cancelled_by', 'sales_transactions')) {
            $this->forge->addColumn('sales_transactions', [
                'cancelled_by' => [
                    'type'       => 'INT',
                    'constraint' => 11,
                    'unsigned'   => true,
                    'null'       => true,
                    'after'      => 'cancelled_at',
                ],
            ]);
        }

        if (!$this->db->fieldExists('cancel_reason', 'sales_transactions')) {
            $this->forge->addColumn('sales_transactions', [
                'cancel_reason' => [
                    'type'       => 'VARCHAR',
                    'constraint' => 500,
                    'null'       => true,
                    'after'      => 'cancelled_by',
                ],
            ]);
        }

        // --- Transfer columns ---
        if (!$this->db->fieldExists('transfer_date', 'sales_transactions')) {
            $this->forge->addColumn('sales_transactions', [
                'transfer_date' => [
                    'type'  => 'DATE',
                    'null'  => true,
                    'after' => 'cancel_reason',
                ],
            ]);
        }

        if (!$this->db->fieldExists('transferred_by', 'sales_transactions')) {
            $this->forge->addColumn('sales_transactions', [
                'transferred_by' => [
                    'type'       => 'INT',
                    'constraint' => 11,
                    'unsigned'   => true,
                    'null'       => true,
                    'after'      => 'transfer_date',
                ],
            ]);
        }

        if (!$this->db->fieldExists('transferred_at', 'sales_transactions')) {
            $this->forge->addColumn('sales_transactions', [
                'transferred_at' => [
                    'type'  => 'DATETIME',
                    'null'  => true,
                    'after' => 'transferred_by',
                ],
            ]);
        }

        // --- budget_movements: เพิ่ม sale_transaction_id ---
        if (!$this->db->fieldExists('sale_transaction_id', 'budget_movements')) {
            $this->forge->addColumn('budget_movements', [
                'sale_transaction_id' => [
                    'type'       => 'BIGINT',
                    'constraint' => 20,
                    'unsigned'   => true,
                    'null'       => true,
                    'after'      => 'reference_type',
                ],
            ]);
        }
    }

    public function down(): void
    {
        // Transfer columns
        if ($this->db->fieldExists('transferred_at', 'sales_transactions')) {
            $this->forge->dropColumn('sales_transactions', 'transferred_at');
        }
        if ($this->db->fieldExists('transferred_by', 'sales_transactions')) {
            $this->forge->dropColumn('sales_transactions', 'transferred_by');
        }
        if ($this->db->fieldExists('transfer_date', 'sales_transactions')) {
            $this->forge->dropColumn('sales_transactions', 'transfer_date');
        }

        // Cancel columns
        if ($this->db->fieldExists('cancel_reason', 'sales_transactions')) {
            $this->forge->dropColumn('sales_transactions', 'cancel_reason');
        }
        if ($this->db->fieldExists('cancelled_by', 'sales_transactions')) {
            $this->forge->dropColumn('sales_transactions', 'cancelled_by');
        }
        if ($this->db->fieldExists('cancelled_at', 'sales_transactions')) {
            $this->forge->dropColumn('sales_transactions', 'cancelled_at');
        }

        // sale_transaction_id
        if ($this->db->fieldExists('sale_transaction_id', 'budget_movements')) {
            $this->forge->dropColumn('budget_movements', 'sale_transaction_id');
        }

        // Revert status ENUM
        $this->forge->modifyColumn('sales_transactions', [
            'status' => [
                'type'       => 'ENUM',
                'constraint' => ['draft', 'confirmed', 'cancelled'],
                'default'    => 'draft',
            ],
        ]);
    }
}
