<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddLoginSecurityToUsers extends Migration
{
    public function up(): void
    {
        // เพิ่ม column สำหรับ login lockout — ป้องกัน brute force
        // failed_attempts: นับครั้งที่ login ผิดติดต่อกัน, reset เป็น 0 เมื่อ login สำเร็จ
        // locked_until: เวลาที่บัญชีจะถูกปลดล็อก (null = ไม่ถูกล็อก)
        $this->forge->addColumn('users', [
            'failed_attempts' => [
                'type'       => 'TINYINT',
                'constraint' => 3,
                'unsigned'   => true,
                'default'    => 0,
                'after'      => 'last_login_at',
            ],
            'locked_until' => [
                'type'  => 'DATETIME',
                'null'  => true,
                'after' => 'failed_attempts',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('users', ['failed_attempts', 'locked_until']);
    }
}
