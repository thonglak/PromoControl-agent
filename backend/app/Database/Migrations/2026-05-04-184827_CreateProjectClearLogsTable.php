<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ตาราง audit log สำหรับการล้างข้อมูลการขายของโครงการ
 *
 * เก็บประวัติว่าใครล้างโครงการไหน เมื่อไหร่ ใช้ mode ไหน เหตุผลคืออะไร
 * และจำนวนรายการที่ถูกลบ/รีเซ็ตในแต่ละครั้ง
 *
 * idempotent — run ซ้ำได้
 */
class CreateProjectClearLogsTable extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('project_clear_logs')) return;

        $this->forge->addField([
            'id'                          => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'project_id'                  => ['type' => 'BIGINT', 'unsigned' => true],
            'project_name'                => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'comment' => 'snapshot ชื่อโครงการ ณ เวลาล้าง'],
            'user_id'                     => ['type' => 'BIGINT', 'unsigned' => true],
            'user_name'                   => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true, 'comment' => 'snapshot ชื่อผู้ทำรายการ'],
            'mode'                        => ['type' => 'ENUM("sales_only","full_reset")', 'comment' => 'sales_only=เฉพาะการขาย / full_reset=รีเซ็ตทั้งหมด'],
            'reason'                      => ['type' => 'TEXT', 'null' => true],
            'deleted_transaction_items'   => ['type' => 'INT', 'unsigned' => true, 'default' => 0],
            'deleted_transactions'        => ['type' => 'INT', 'unsigned' => true, 'default' => 0],
            'deleted_movements'           => ['type' => 'INT', 'unsigned' => true, 'default' => 0],
            'deleted_allocations'         => ['type' => 'INT', 'unsigned' => true, 'default' => 0],
            'reset_units'                 => ['type' => 'INT', 'unsigned' => true, 'default' => 0],
            'created_at'                  => ['type' => 'DATETIME', 'null' => false],
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addKey('project_id');
        $this->forge->addKey('user_id');
        $this->forge->addKey('created_at');
        $this->forge->createTable('project_clear_logs');
    }

    public function down(): void
    {
        if ($this->db->tableExists('project_clear_logs')) {
            $this->forge->dropTable('project_clear_logs');
        }
    }
}
