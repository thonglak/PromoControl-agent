<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ตาราง system_settings — key/value storage สำหรับค่าตั้งค่าทั่วระบบ
 *
 * setting_value เก็บเป็น JSON เพื่อรองรับหลายชนิดข้อมูล (number, string, boolean, object)
 * โดยไม่ต้องเปลี่ยน schema เมื่อเพิ่ม setting ใหม่ในอนาคต
 *
 * Seed ค่าเริ่มต้น: transfer_fee_percent = 1.0
 */
class CreateSystemSettingsTable extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('system_settings')) {
            return;
        }

        $this->forge->addField([
            'id'            => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'setting_key'   => ['type' => 'VARCHAR', 'constraint' => 100],
            'setting_value' => ['type' => 'JSON', 'null' => true],
            'description'   => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'updated_by'    => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true, 'null' => true],
            'updated_at'    => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('setting_key');

        $this->forge->createTable('system_settings', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);

        // Seed ค่าเริ่มต้น
        $this->db->table('system_settings')->insert([
            'setting_key'   => 'transfer_fee_percent',
            'setting_value' => json_encode(1.0),
            'description'   => 'อัตราค่าธรรมเนียมโอน (%) — ใช้คำนวณ default ของ additional_expense_amount ใน sales-entry',
            'updated_at'    => date('Y-m-d H:i:s'),
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('system_settings', true);
    }
}
