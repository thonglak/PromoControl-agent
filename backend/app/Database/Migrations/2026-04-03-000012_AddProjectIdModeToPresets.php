<?php
namespace App\Database\Migrations;
use CodeIgniter\Database\Migration;

class AddProjectIdModeToPresets extends Migration
{
    public function up(): void
    {
        $this->db->query("ALTER TABLE `api_field_mapping_presets` ADD COLUMN `project_id_mode` ENUM('from_snapshot','from_field','none') NOT NULL DEFAULT 'from_snapshot' AFTER `upsert_key`");
        $this->db->query("ALTER TABLE `api_field_mapping_presets` ADD COLUMN `project_id_field` VARCHAR(100) NULL DEFAULT NULL AFTER `project_id_mode`");
    }

    public function down(): void
    {
        $this->forge->dropColumn('api_field_mapping_presets', 'project_id_mode');
        $this->forge->dropColumn('api_field_mapping_presets', 'project_id_field');
    }
}
