<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class RenameUnitsFromApiToSyncFromApi extends Migration
{
    public function up(): void
    {
        // 1. เปลี่ยนชื่อตาราง main
        $this->db->query('RENAME TABLE `units_from_api` TO `sync_from_api`');

        // 2. เปลี่ยนชื่อ dynamic snapshot tables (units_API... → sync_API...)
        $tables = $this->db->query("SHOW TABLES LIKE 'units\\_API%'")->getResultArray();
        foreach ($tables as $row) {
            $oldName = array_values($row)[0];
            $newName = 'sync_' . substr($oldName, 6); // ตัด 'units_' prefix แล้วเติม 'sync_'
            $this->db->query("RENAME TABLE `{$oldName}` TO `{$newName}`");
        }
    }

    public function down(): void
    {
        // ย้อนกลับ: sync_from_api → units_from_api
        $this->db->query('RENAME TABLE `sync_from_api` TO `units_from_api`');

        $tables = $this->db->query("SHOW TABLES LIKE 'sync\\_API%'")->getResultArray();
        foreach ($tables as $row) {
            $oldName = array_values($row)[0];
            $newName = 'units_' . substr($oldName, 5); // ตัด 'sync_' prefix แล้วเติม 'units_'
            $this->db->query("RENAME TABLE `{$oldName}` TO `{$newName}`");
        }
    }
}
