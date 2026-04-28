<?php
namespace App\Database\Migrations;
use CodeIgniter\Database\Migration;

class AddFkLookupTransformType extends Migration
{
    public function up(): void
    {
        $this->db->query("ALTER TABLE `api_field_mapping_columns` MODIFY COLUMN `transform_type` ENUM('none','number','date','status_map','fk_lookup') NOT NULL DEFAULT 'none'");
    }

    public function down(): void
    {
        $this->db->query("ALTER TABLE `api_field_mapping_columns` MODIFY COLUMN `transform_type` ENUM('none','number','date','status_map') NOT NULL DEFAULT 'none'");
    }
}
