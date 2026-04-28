<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * สร้างตาราง units_from_api
 *
 * เก็บประวัติการดึงข้อมูลยูนิตจาก API ภายนอก (Narai Connect)
 * แต่ละ record คือ 1 ครั้งที่มีการดึงข้อมูล
 *
 * หมายเหตุ: dynamic table `units_{code}` ที่เก็บรายละเอียดยูนิตจริง
 * จะถูกสร้างโดย Service ไม่ใช่ migration
 */
class CreateUnitsFromApiTable extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'            => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'code'          => ['type' => 'VARCHAR', 'constraint' => 100],
            'project_id'    => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'config_id'     => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            // api_url: snapshot URL ที่ใช้จริงตอนดึงข้อมูล (อาจต่างจาก config ปัจจุบัน)
            'api_url'       => ['type' => 'TEXT'],
            'total_rows'    => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'status'        => ['type' => 'ENUM', 'constraint' => ['completed', 'failed']],
            'error_message' => ['type' => 'TEXT', 'null' => true],
            'fetched_by'    => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'created_at'    => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('code');
        $this->forge->addKey('project_id');
        $this->forge->addKey('config_id');
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        // config_id ใช้ SET NULL เพราะ config อาจถูกลบหลังจาก fetch แล้ว
        $this->forge->addForeignKey('config_id', 'external_api_configs', 'id', 'RESTRICT', 'SET NULL');
        $this->forge->addForeignKey('fetched_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('units_from_api', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('units_from_api', true);
    }
}
