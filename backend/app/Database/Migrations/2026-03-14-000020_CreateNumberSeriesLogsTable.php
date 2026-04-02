<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateNumberSeriesLogsTable extends Migration
{
    public function up(): void
    {
        // ตารางประวัติการออกเลขที่เอกสาร — เก็บทุก generated number
        $this->forge->addField([
            'id'               => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'number_series_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'generated_number' => ['type' => 'VARCHAR', 'constraint' => 100],
            'reference_id'     => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'reference_table'  => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'generated_by'     => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'generated_at'     => ['type' => 'DATETIME'],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('number_series_id');
        $this->forge->addForeignKey('number_series_id', 'number_series', 'id', 'RESTRICT', 'CASCADE');
        $this->forge->addForeignKey('generated_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('number_series_logs', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('number_series_logs', true);
    }
}
