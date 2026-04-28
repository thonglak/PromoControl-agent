<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ลดฟิลด์ house_models เหลือแค่ code, name, area_sqm
 * ลบ: description, bedrooms, bathrooms, floors, default_base_price,
 *      default_unit_cost, default_budget, image_url, status, total_units
 */
class SimplifyHouseModels extends Migration
{
    public function up(): void
    {
        $dropColumns = [
            'description',
            'bedrooms',
            'bathrooms',
            'floors',
            'default_base_price',
            'default_unit_cost',
            'default_budget',
            'image_url',
            'status',
            'total_units',
        ];

        $this->forge->dropColumn('house_models', $dropColumns);
    }

    public function down(): void
    {
        $this->forge->addColumn('house_models', [
            'description'        => ['type' => 'TEXT', 'null' => true, 'after' => 'name'],
            'bedrooms'           => ['type' => 'TINYINT', 'constraint' => 3, 'unsigned' => true, 'default' => 0, 'after' => 'description'],
            'bathrooms'          => ['type' => 'TINYINT', 'constraint' => 3, 'unsigned' => true, 'default' => 0, 'after' => 'bedrooms'],
            'floors'             => ['type' => 'TINYINT', 'constraint' => 3, 'unsigned' => true, 'default' => 1, 'after' => 'bathrooms'],
            'default_base_price' => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0, 'after' => 'area_sqm'],
            'default_unit_cost'  => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0, 'after' => 'default_base_price'],
            'default_budget'     => ['type' => 'DECIMAL', 'constraint' => '15,2', 'default' => 0, 'after' => 'default_unit_cost'],
            'image_url'          => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true, 'after' => 'default_budget'],
            'status'             => ['type' => 'ENUM', 'constraint' => ['active', 'inactive'], 'default' => 'active', 'after' => 'image_url'],
            'total_units'        => ['type' => 'INT', 'constraint' => 11, 'default' => 0, 'after' => 'status'],
        ]);
    }
}
