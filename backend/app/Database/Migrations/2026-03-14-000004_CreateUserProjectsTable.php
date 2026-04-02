<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateUserProjectsTable extends Migration
{
    public function up(): void
    {
        // ตารางเชื่อม user กับ project พร้อม access level (view/edit)
        $this->forge->addField([
            'id'           => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'user_id'      => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'project_id'   => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'access_level' => ['type' => 'ENUM', 'constraint' => ['view', 'edit'], 'default' => 'view'],
            'created_at'   => ['type' => 'DATETIME', 'null' => true],
            'updated_at'   => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['user_id', 'project_id']);
        $this->forge->addForeignKey('user_id', 'users', 'id', 'RESTRICT', 'CASCADE');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'CASCADE');

        $this->forge->createTable('user_projects', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('user_projects', true);
    }
}
