<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ตาราง premium_import_batches — หัวข้อมูลการ import ไฟล์ Premium.xlsx
 *
 * 1 แถว = 1 ชีต/โครงการ ต่อการ import 1 ครั้ง
 * ใช้คุมสถานะ validate → sync และรองรับการ rollback
 *
 * status:
 *   pending     = นำเข้า staging แล้ว ยังไม่ตรวจสอบ
 *   validated   = ตรวจสอบ/จับคู่ unit เรียบร้อย พร้อม sync
 *   synced      = sync เข้า project_units / promotion เรียบร้อย
 *   failed      = นำเข้า/ตรวจสอบไม่ผ่าน
 *   rolled_back = ย้อนกลับการ sync แล้ว
 */
class CreatePremiumImportBatchesTable extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('premium_import_batches')) {
            return;
        }

        $this->forge->addField([
            'id'               => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id'       => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'source_file_name' => ['type' => 'VARCHAR', 'constraint' => 255],
            'sheet_name'       => ['type' => 'VARCHAR', 'constraint' => 100],
            'project_code'     => ['type' => 'VARCHAR', 'constraint' => 50, 'null' => true], // รหัสโครงการที่อ่านจากแถว "โครงการ" ในชีต
            'total_rows'       => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'matched_rows'     => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'unmatched_rows'   => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'synced_rows'      => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'status'           => ['type' => 'ENUM', 'constraint' => ['pending', 'validated', 'synced', 'failed', 'rolled_back'], 'default' => 'pending'],
            'note'             => ['type' => 'TEXT', 'null' => true],
            'imported_by'      => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'imported_at'      => ['type' => 'DATETIME', 'null' => true],
            'synced_at'        => ['type' => 'DATETIME', 'null' => true],
            'created_at'       => ['type' => 'DATETIME', 'null' => true],
            'updated_at'       => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey(['project_id', 'status']); // INDEX สำหรับกรองตามโครงการ + สถานะ
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('imported_by', 'users', 'id', 'RESTRICT', 'SET NULL');

        $this->forge->createTable('premium_import_batches', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('premium_import_batches', true);
    }
}
