<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateImportConfigTables extends Migration
{
    public function up(): void
    {
        // ตาราง import_configs: เก็บการตั้งค่า import แบบ generic ใช้ได้กับหลายประเภท
        // แต่ละ project+import_type มีได้หลาย config; is_default = ใช้โดยอัตโนมัติ
        $this->forge->addField([
            'id'             => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'project_id'     => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'config_name'    => ['type' => 'VARCHAR', 'constraint' => 100],
            // ประเภทการ import: bottom_line=ราคาต้นทุน, unit=ยูนิต, promotion=โปรโมชัน, custom=กำหนดเอง
            'import_type'    => ['type' => 'ENUM', 'constraint' => ['bottom_line', 'unit', 'promotion', 'custom']],
            'target_table'   => ['type' => 'VARCHAR', 'constraint' => 100],
            // ประเภทไฟล์ที่รองรับ
            'file_type'      => ['type' => 'ENUM', 'constraint' => ['xlsx', 'xls', 'csv'], 'default' => 'xlsx'],
            'sheet_name'     => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            // แถวที่เป็น header ในไฟล์ Excel (เริ่มนับจาก 1)
            'header_row'     => ['type' => 'INT', 'default' => 1],
            // แถวเริ่มต้นข้อมูลจริง (ปกติ header+1)
            'data_start_row' => ['type' => 'INT', 'default' => 2],
            // เป็น config หลักของ project+import_type นี้หรือไม่
            'is_default'     => ['type' => 'BOOLEAN', 'default' => false],
            'created_by'     => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'created_at'     => ['type' => 'DATETIME', 'null' => true],
            'updated_at'     => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['project_id', 'config_name']);
        $this->forge->addKey(['project_id', 'import_type', 'is_default']);
        $this->forge->addForeignKey('project_id', 'projects', 'id', 'RESTRICT', 'RESTRICT');
        $this->forge->addForeignKey('created_by', 'users', 'id', 'RESTRICT', 'RESTRICT');

        $this->forge->createTable('import_configs', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);

        // ตาราง import_config_columns: รายละเอียด column mapping สำหรับแต่ละ import config
        // source_column = คอลัมน์ใน Excel (A, B, C, ...) → target_field = field ในระบบ
        $this->forge->addField([
            'id'               => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'import_config_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            // คอลัมน์ใน Excel เช่น "A", "B", "AA"
            'source_column'    => ['type' => 'VARCHAR', 'constraint' => 10],
            // field ในระบบ เช่น unit_code, unit_cost, appraisal_price
            'target_field'     => ['type' => 'VARCHAR', 'constraint' => 100],
            // label ภาษาไทยสำหรับแสดงผล เช่น "รหัสยูนิต", "ราคาต้นทุน"
            'field_label'      => ['type' => 'VARCHAR', 'constraint' => 255],
            // ประเภทข้อมูลสำหรับการแปลงค่าเมื่อ import
            'data_type'        => ['type' => 'ENUM', 'constraint' => ['string', 'number', 'date', 'decimal'], 'default' => 'string'],
            // ถ้า true = ต้องมีค่า ห้ามว่าง
            'is_required'      => ['type' => 'BOOLEAN', 'default' => false],
            // ถ้า true = ใช้เป็น key สำหรับ matching กับข้อมูลในระบบ
            'is_key_field'     => ['type' => 'BOOLEAN', 'default' => false],
            'sort_order'       => ['type' => 'INT', 'default' => 0],
            'created_at'       => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addKey('import_config_id');
        $this->forge->addForeignKey('import_config_id', 'import_configs', 'id', 'RESTRICT', 'CASCADE');

        $this->forge->createTable('import_config_columns', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('import_config_columns', true);
        $this->forge->dropTable('import_configs', true);
    }
}
