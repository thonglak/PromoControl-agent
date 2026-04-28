<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AddNameToSyncFromApi extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('sync_from_api', [
            'name' => [
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => true,
                'default'    => null,
                'after'      => 'code',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('sync_from_api', 'name');
    }
}
