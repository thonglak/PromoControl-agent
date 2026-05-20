<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ลดค่า enum ของ budget_movements.status เหลือ approved/voided
 *
 * ระบบยกเลิกขั้นตอนรออนุมัติงบแล้ว movement ทุกรายการเป็น approved ทันที
 * สถานะ pending/rejected จึงไม่ถูกใช้อีก
 *
 * แปลงข้อมูลเดิมก่อน ALTER:
 *   pending  → approved  (รายการที่เคยรออนุมัติ ถือว่าอนุมัติแล้ว)
 *   rejected → voided    (รายการที่เคยถูกปฏิเสธ ถือว่ายกเลิก)
 * และเปลี่ยนค่า default ของคอลัมน์จาก pending → approved
 */
class NarrowBudgetMovementStatusEnum extends Migration
{
    public function up(): void
    {
        // 1. แปลงข้อมูลเดิมที่ยังใช้ค่าเก่า
        $this->db->table('budget_movements')
            ->where('status', 'pending')->update(['status' => 'approved']);
        $this->db->table('budget_movements')
            ->where('status', 'rejected')->update(['status' => 'voided']);

        // 2. ลด enum + เปลี่ยน default
        $this->db->query(
            "ALTER TABLE `budget_movements`
             MODIFY `status` ENUM('approved','voided') NULL DEFAULT 'approved'"
        );
    }

    public function down(): void
    {
        // คืน enum เดิม (ข้อมูลที่แปลงไปแล้วคืนค่าเดิมไม่ได้ — irreversible)
        $this->db->query(
            "ALTER TABLE `budget_movements`
             MODIFY `status` ENUM('pending','approved','rejected','voided') NULL DEFAULT 'pending'"
        );
    }
}
