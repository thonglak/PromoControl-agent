<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateNumberSeriesTable extends Migration
{
    public function up(): void
    {
        // ตารางตั้งค่าเลขที่เอกสารอัตโนมัติ per project per document_type
        // year_format: YYYY_BE=พ.ศ., YYYY_AD=ค.ศ., NONE=ไม่แสดงปี
        // reset_cycle: YEARLY=รีเซ็ตทุกปี, MONTHLY=รีเซ็ตทุกเดือน, NEVER=ไม่รีเซ็ต
        $this->forge->addField([
            'id'              => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id'      => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'document_type'   => ['type' => 'ENUM', 'constraint' => ['SALE', 'BUDGET_MOVE', 'BOTTOM_LINE', 'UNIT_ALLOC']],
            'prefix'          => ['type' => 'VARCHAR', 'constraint' => 20],
            'separator'       => ['type' => 'VARCHAR', 'constraint' => 5, 'default' => '-'],
            'year_format'     => ['type' => 'ENUM', 'constraint' => ['YYYY_BE', 'YYYY_AD', 'YY_BE', 'YY_AD', 'NONE'], 'default' => 'YYYY_BE'],
            'year_separator'  => ['type' => 'VARCHAR', 'constraint' => 5, 'default' => '-'],
            'running_digits'  => ['type' => 'INT', 'constraint' => 11, 'default' => 4],
            'reset_cycle'     => ['type' => 'ENUM', 'constraint' => ['YEARLY', 'MONTHLY', 'NEVER'], 'default' => 'YEARLY'],
            'next_number'     => ['type' => 'INT', 'constraint' => 11, 'default' => 1],
            'last_reset_date' => ['type' => 'DATE', 'null' => true],
            'sample_output'   => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'is_active'       => ['type' => 'BOOLEAN', 'default' => true],
            'created_at'      => ['type' => 'DATETIME', 'null' => true],
            'updated_at'      => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['project_id', 'document_type']);
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'CASCADE');

        $this->forge->createTable('number_series', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('number_series', true);
    }
}
