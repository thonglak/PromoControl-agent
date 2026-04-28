<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่มคอลัมน์ SSO สำหรับรองรับ Narai Connect OAuth2
 *
 * - narai_id       : user ID จาก Narai Connect (string เพราะมาจาก external system)
 * - sso_provider   : ชื่อ provider ('narai') — รองรับการขยายในอนาคต
 * - password_hash  : nullable เพื่อรองรับ user ที่ login ผ่าน SSO เท่านั้น
 * - failed_attempts, locked_until : เพิ่มถ้ายังไม่มี (migration 21 อาจเพิ่มแล้ว)
 */
class AddSsoColumnsToUsers extends Migration
{
    public function up(): void
    {
        // narai_id — รหัส user จาก Narai Connect (เช่น "3881")
        $this->forge->addColumn('users', [
            'narai_id' => [
                'type'       => 'VARCHAR',
                'constraint' => 50,
                'null'       => true,
                'default'    => null,
                'after'      => 'id',
            ],
        ]);

        // sso_provider — ระบุ provider ('narai') เผื่อรองรับหลาย provider ในอนาคต
        $this->forge->addColumn('users', [
            'sso_provider' => [
                'type'       => 'VARCHAR',
                'constraint' => 50,
                'null'       => true,
                'default'    => null,
                'after'      => 'narai_id',
            ],
        ]);

        // password_hash เปลี่ยนเป็น nullable สำหรับ SSO-only users
        $this->db->query(
            "ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL DEFAULT NULL"
        );

        // Index สำหรับ lookup ด้วย narai_id
        $this->db->query(
            "ALTER TABLE users ADD UNIQUE KEY uq_narai_id (narai_id)"
        );
    }

    public function down(): void
    {
        // ลบ index ก่อน
        $this->db->query("ALTER TABLE users DROP KEY uq_narai_id");

        $this->forge->dropColumn('users', 'narai_id');
        $this->forge->dropColumn('users', 'sso_provider');

        // คืน password_hash เป็น NOT NULL
        $this->db->query(
            "ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL"
        );
    }
}
