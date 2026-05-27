<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เปลี่ยนจาก projects.monitor_token (1:1) → monitor_links + pivot (M:N)
 *
 * - monitor_links: ลิงค์สาธารณะ (token + name + creator)
 * - monitor_link_projects: pivot (1 link → N projects)
 * - drop projects.monitor_token (ของเก่า)
 */
class CreateMonitorLinksTables extends Migration
{
    public function up(): void
    {
        // drop column เดิม
        if ($this->db->fieldExists('monitor_token', 'projects')) {
            $this->db->query('ALTER TABLE projects DROP INDEX `monitor_token`');
            $this->forge->dropColumn('projects', 'monitor_token');
        }

        // monitor_links
        $this->forge->addField([
            'id'         => ['type' => 'BIGINT', 'unsigned' => true, 'auto_increment' => true],
            'token'      => ['type' => 'VARCHAR', 'constraint' => 64, 'null' => false],
            'name'       => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => false],
            'created_by' => ['type' => 'BIGINT', 'unsigned' => true, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('token');
        $this->forge->createTable('monitor_links', true);

        // monitor_link_projects (pivot)
        $this->forge->addField([
            'monitor_link_id' => ['type' => 'BIGINT', 'unsigned' => true, 'null' => false],
            'project_id'      => ['type' => 'BIGINT', 'unsigned' => true, 'null' => false],
        ]);
        $this->forge->addPrimaryKey(['monitor_link_id', 'project_id']);
        $this->forge->addKey('project_id');
        $this->forge->addForeignKey('monitor_link_id', 'monitor_links', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('project_id',      'projects',      'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('monitor_link_projects', true);
    }

    public function down(): void
    {
        $this->forge->dropTable('monitor_link_projects', true);
        $this->forge->dropTable('monitor_links', true);

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
}
