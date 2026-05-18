<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * เพิ่ม column `legacy_source` ใน project_units
 *
 * Flag บอกว่าสถานะ (sold/transferred) + วันที่ขาย/โอน ของ unit นี้
 * มาจากระบบเก่า Caldiscount (ไม่ใช่ผ่านการขายในระบบใหม่)
 *
 * - NULL = unit ปกติของระบบใหม่
 * - 'caldiscount' = sync มาจาก Caldiscount (snapshot) — ไม่นำมาคำนวณซ้ำ
 *
 * ใช้ field status / sale_date / transfer_date ที่มีอยู่แล้วใน table
 */
class AddLegacySourceToProjectUnits extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('project_units', [
            'legacy_source' => [
                'type'       => 'ENUM',
                'constraint' => ['caldiscount'],
                'null'       => true,
                'default'    => null,
                'after'      => 'status',
            ],
        ]);

        $this->forge->addKey('legacy_source');
        $this->forge->processIndexes('project_units');
    }

    public function down(): void
    {
        $this->forge->dropColumn('project_units', ['legacy_source']);
    }
}
