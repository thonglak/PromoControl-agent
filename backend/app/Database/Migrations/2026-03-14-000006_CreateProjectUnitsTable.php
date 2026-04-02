<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateProjectUnitsTable extends Migration
{
    public function up(): void
    {
        // ตารางยูนิต: บ้าน/คอนโดแต่ละหน่วย — เก็บราคาและสถานะการขาย
        $this->forge->addField([
            'id'               => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id'       => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'house_model_id'   => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'unit_code'        => ['type' => 'VARCHAR', 'constraint' => 50],
            'unit_number'      => ['type' => 'VARCHAR', 'constraint' => 50],
            'floor'            => ['type' => 'VARCHAR', 'constraint' => 20, 'null' => true],
            'building'         => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'area_sqm'         => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true],
            'unit_type'        => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'base_price'       => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'unit_cost'        => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'appraisal_price'  => ['type' => 'DECIMAL', 'constraint' => '15,2', 'null' => true],
            'bottom_line_key'  => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'standard_budget'  => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'status'           => ['type' => 'ENUM', 'constraint' => ['available', 'reserved', 'sold', 'transferred'], 'default' => 'available'],
            'customer_name'    => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'salesperson'      => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'sale_date'        => ['type' => 'DATE', 'null' => true],
            'transfer_date'    => ['type' => 'DATE', 'null' => true],
            'remark'           => ['type' => 'TEXT', 'null' => true],
            'created_at'       => ['type' => 'DATETIME', 'null' => true],
            'updated_at'       => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['project_id', 'unit_code']);
        $this->forge->addKey(['project_id', 'status']); // INDEX สำหรับกรอง status ตาม project
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('house_model_id', 'house_models', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('project_units', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('project_units', true);
    }
}
