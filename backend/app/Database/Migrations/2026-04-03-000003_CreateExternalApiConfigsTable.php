<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * สร้างตาราง external_api_configs
 *
 * เก็บการตั้งค่า API ภายนอกที่ใช้ดึงข้อมูลยูนิตต่อโครงการ
 * เช่น Narai Connect API endpoint สำหรับแต่ละโครงการ
 */
class CreateExternalApiConfigsTable extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'name'       => ['type' => 'VARCHAR', 'constraint' => 255],
            'api_url'    => ['type' => 'TEXT'],
            'is_active'  => ['type' => 'BOOLEAN', 'default' => true],
            'created_by' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('project_id');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        // created_by ใช้ SET NULL เพราะ user อาจถูกลบหลังสร้าง config แล้ว
        $this->forge->addForeignKey('created_by', 'users', 'id', 'RESTRICT', 'SET NULL');

        $this->forge->createTable('external_api_configs', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('external_api_configs', true);
    }
}
