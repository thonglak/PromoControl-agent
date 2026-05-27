<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่ม column monitor_token ใน projects
 * - 64 ตัวอักษร hex (sha256/random_bytes(32)) — unguessable
 * - UNIQUE: 1 project = 1 token
 * - ใช้กับ /api/public/monitor/{token} (public endpoint ไม่ต้อง auth)
 */
class AddMonitorTokenToProjects extends Migration
{
    public function up(): void
    {
        if (!$this->db->fieldExists('monitor_token', 'projects')) {
            $this->forge->addColumn('projects', [
                'monitor_token' => [
                    'type'       => 'VARCHAR',
                    'constraint' => 64,
                    'null'       => true,
                    'after'      => 'code',
                ],
            ]);
            $this->db->query('ALTER TABLE projects ADD UNIQUE INDEX `monitor_token` (`monitor_token`)');
        }
    }

    public function down(): void
    {
        if ($this->db->fieldExists('monitor_token', 'projects')) {
            $this->db->query('ALTER TABLE projects DROP INDEX `monitor_token`');
            $this->forge->dropColumn('projects', 'monitor_token');
        }
    }
}
