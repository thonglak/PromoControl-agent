<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ตาราง project_legacy_reconciliation — เก็บตัวเลขสรุปจากระบบเก่า (legacy) เพื่อนำมากระทบยอด
 * กับข้อมูลจริงในระบบ PromoControl (แสดงผลเปรียบเทียบเท่านั้น ไม่กระทบสูตรคำนวณใดๆ)
 *
 * 1 row ต่อ 1 โครงการ (project_id เป็น PRIMARY KEY)
 * - legacy_total_budget_remaining : งบคงเหลือรวมจากระบบเก่า
 * - legacy_total_profit           : กำไรรวมจากระบบเก่า
 * - as_of_date                   : วันที่ cutoff ของข้อมูลระบบเก่า
 * - note                         : หมายเหตุ
 */
class CreateProjectLegacyReconciliationTable extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('project_legacy_reconciliation')) {
            return;
        }

        $this->forge->addField([
            'project_id'                   => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'legacy_total_budget_remaining' => ['type' => 'DECIMAL', 'constraint' => '15,2', 'null' => false, 'default' => 0],
            'legacy_total_profit'           => ['type' => 'DECIMAL', 'constraint' => '15,2', 'null' => false, 'default' => 0],
            'as_of_date'                   => ['type' => 'DATE', 'null' => false],
            'note'                         => ['type' => 'TEXT', 'null' => true],
            'created_by'                   => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at'                   => ['type' => 'DATETIME', 'null' => true],
            'updated_by'                   => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'updated_at'                   => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('project_id', true); // PRIMARY KEY

        $this->forge->addForeignKey('project_id', 'projects', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'SET NULL', 'SET NULL');
        $this->forge->addForeignKey('updated_by', 'users', 'id', 'SET NULL', 'SET NULL');

        $this->forge->createTable('project_legacy_reconciliation', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('project_legacy_reconciliation', true);
    }
}
