<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateHouseModelsTable extends Migration
{
    public function up(): void
    {
        // ตารางแบบบ้าน: แต่ละโครงการมีได้หลายแบบบ้าน
        $this->forge->addField([
            'id'                 => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id'         => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'code'               => ['type' => 'VARCHAR', 'constraint' => 50],
            'name'               => ['type' => 'VARCHAR', 'constraint' => 255],
            'description'        => ['type' => 'TEXT', 'null' => true],
            'bedrooms'           => ['type' => 'TINYINT', 'constraint' => 3, 'unsigned' => true, 'default' => 0],
            'bathrooms'          => ['type' => 'TINYINT', 'constraint' => 3, 'unsigned' => true, 'default' => 0],
            'floors'             => ['type' => 'TINYINT', 'constraint' => 3, 'unsigned' => true, 'default' => 1],
            'area_sqm'           => ['type' => 'DECIMAL', 'constraint' => '10,2', 'default' => 0],
            'land_area_sqw'      => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true],
            'default_base_price' => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'default_unit_cost'  => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'default_budget'     => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0],
            'image_url'          => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'status'             => ['type' => 'ENUM', 'constraint' => ['active', 'inactive'], 'default' => 'active'],
            'total_units'        => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'created_at'         => ['type' => 'DATETIME', 'null' => true],
            'updated_at'         => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['project_id', 'code']);
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('house_models', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('house_models', true);
    }
}
