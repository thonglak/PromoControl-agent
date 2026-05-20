<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ตาราง premium_import_units — ข้อมูลรายแปลงจากไฟล์ Premium.xlsx
 *
 * 1 แถว = 1 แปลง (1 แถวข้อมูลในชีต)
 * เก็บคอลัมน์คงที่ทุกชีต: เลขแปลง, เนื้อที่ดิน, แบบบ้าน, ราคา (Bottom Line)
 * ค่าของแถมที่ไม่คงที่จะแยกไปเก็บที่ premium_import_values
 *
 * ฟิลด์ matched_* และ match_status ถูกเติมตอน validate ก่อน sync:
 *   - plot_no จับคู่กับ project_units.unit_number (ในโครงการเดียวกัน)
 *   - house_model_code จับคู่กับ house_models.code
 *
 * match_status:
 *   unmatched = ยังจับคู่ unit ไม่ได้
 *   matched   = จับคู่ unit ได้ 1 รายการ
 *   ambiguous = จับคู่ได้มากกว่า 1 รายการ (เลขแปลงซ้ำ)
 *   synced    = sync เข้า project_units เรียบร้อย
 */
class CreatePremiumImportUnitsTable extends Migration
{
    public function up(): void
    {
        if ($this->db->tableExists('premium_import_units')) {
            return;
        }

        $this->forge->addField([
            'id'                     => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'batch_id'               => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true],
            'seq'                    => ['type' => 'INT', 'constraint' => 11, 'null' => true],   // ลำดับในชีต
            'plot_no'                => ['type' => 'VARCHAR', 'constraint' => 50],               // เลขแปลง
            'land_area_sqw'          => ['type' => 'DECIMAL', 'constraint' => '10,2', 'null' => true], // เนื้อที่ดิน (ตร.ว.)
            'house_model_code'       => ['type' => 'VARCHAR', 'constraint' => 50, 'null' => true],     // แบบบ้าน (ข้อความดิบจาก Excel)
            'bottom_line_price'      => ['type' => 'DECIMAL', 'constraint' => '15,2', 'null' => true], // ราคา (Bottom Line) → sync เข้า project_units.unit_cost
            'raw_row_index'          => ['type' => 'INT', 'constraint' => 11, 'null' => true],   // เลขแถวจริงในชีต Excel เพื่อตรวจสอบย้อนกลับ
            'matched_unit_id'        => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'matched_house_model_id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'null' => true],
            'match_status'           => ['type' => 'ENUM', 'constraint' => ['unmatched', 'matched', 'ambiguous', 'synced'], 'default' => 'unmatched'],
            'created_at'             => ['type' => 'DATETIME', 'null' => true],
        ]);

        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['batch_id', 'plot_no']); // ห้ามเลขแปลงซ้ำภายใน batch เดียวกัน
        $this->forge->addKey('match_status');
        $this->forge->addForeignKey('batch_id', 'premium_import_batches', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('matched_unit_id', 'project_units', 'id', 'RESTRICT', 'SET NULL');
        $this->forge->addForeignKey('matched_house_model_id', 'house_models', 'id', 'RESTRICT', 'SET NULL');

        $this->forge->createTable('premium_import_units', false, [
            'ENGINE'  => 'InnoDB',
            'CHARSET' => 'utf8mb4',
            'COLLATE' => 'utf8mb4_unicode_ci',
        ]);
    }

    public function down(): void
    {
        $this->forge->dropTable('premium_import_units', true);
    }
}
