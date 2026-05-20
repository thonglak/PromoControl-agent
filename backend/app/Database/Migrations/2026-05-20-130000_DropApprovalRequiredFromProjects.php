<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ลบคอลัมน์ approval_required ออกจาก projects
 *
 * ระบบยกเลิกขั้นตอน "รออนุมัติงบ" — budget_movements ถูกบันทึกเป็น approved
 * ทันทีเสมอ คอลัมน์นี้จึงไม่มีผลต่อระบบอีกต่อไป
 *
 * หมายเหตุ: enum budget_movements.status ยังคงค่า 'pending'/'rejected' ไว้
 * (ไม่ถูกใช้แล้ว แต่คงไว้เพื่อความเข้ากันได้กับข้อมูลเดิม)
 */
class DropApprovalRequiredFromProjects extends Migration
{
    public function up(): void
    {
        if ($this->db->fieldExists('approval_required', 'projects')) {
            $this->forge->dropColumn('projects', 'approval_required');
        }
    }

    public function down(): void
    {
        if (! $this->db->fieldExists('approval_required', 'projects')) {
            $this->forge->addColumn('projects', [
                'approval_required' => [
                    'type'       => 'TINYINT',
                    'constraint' => 1,
                    'default'    => 0,
                    'after'      => 'project_type',
                ],
            ]);
        }
    }
}
