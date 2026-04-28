<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่ม narai_access_token ใน users table
 *
 * - narai_access_token : access token จาก Narai Connect ที่ใช้เรียก API ภายนอก
 *   เก็บแบบ nullable เพราะ user ทั่วไปที่ไม่ใช้ SSO จะไม่มี token นี้
 */
class AddNaraiAccessTokenToUsers extends Migration
{
    public function up(): void
    {
        // narai_access_token — token สำหรับเรียก Narai Connect API (nullable)
        $this->forge->addColumn('users', [
            'narai_access_token' => [
                'type'  => 'TEXT',
                'null'  => true,
                'after' => 'sso_provider',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('users', 'narai_access_token');
    }
}
