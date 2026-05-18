<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * ย้าย 4 fields ที่ใช้กับ Dashboard ออกจาก project_legacy_reconciliation → projects
 * พร้อมเพิ่ม legacy_dashboard_as_of_date ใหม่ใน projects
 *
 * fields ที่เพิ่มใน `projects`:
 * - legacy_sold_units              : จำนวนยูนิตที่ขายในระบบเก่า (สำหรับ Dashboard)
 * - legacy_sold_net_price          : มูลค่าขายสุทธิระบบเก่า (สำหรับ Dashboard)
 * - legacy_total_discount_amount   : มูลค่าส่วนลดรวมระบบเก่า (สำหรับ Dashboard)
 * - legacy_value_achieved          : มูลค่าโครงการที่ทำได้ระบบเก่า (สำหรับ Dashboard)
 * - legacy_dashboard_as_of_date    : วันที่ cutoff สำหรับ Dashboard (แยกจาก as_of_date ของ X/Y)
 *
 * fields ที่ DROP ออกจาก `project_legacy_reconciliation`:
 * - legacy_sold_units, legacy_sold_net_price, legacy_total_discount_amount, legacy_value_achieved
 */
class MoveLegacyDashboardFieldsToProjects extends Migration
{
    public function up(): void
    {
        // ─── เพิ่ม 5 columns ใน projects ───────────────────────────────────
        $this->forge->addColumn('projects', [
            'legacy_sold_units' => [
                'type'       => 'INT',
                'constraint' => 11,
                'null'       => false,
                'default'    => 0,
                'after'      => 'pool_budget_amount',
            ],
            'legacy_sold_net_price' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => false,
                'default'    => 0,
                'after'      => 'legacy_sold_units',
            ],
            'legacy_total_discount_amount' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => false,
                'default'    => 0,
                'after'      => 'legacy_sold_net_price',
            ],
            'legacy_value_achieved' => [
                'type'       => 'DECIMAL',
                'constraint' => '15,2',
                'null'       => false,
                'default'    => 0,
                'after'      => 'legacy_total_discount_amount',
            ],
            'legacy_dashboard_as_of_date' => [
                'type'  => 'DATE',
                'null'  => true,
                'after' => 'legacy_value_achieved',
            ],
        ]);

        // ─── คัดลอกข้อมูลจาก project_legacy_reconciliation → projects ────
        // (กรณีมีข้อมูลอยู่แล้วก่อน migration นี้)
        if ($this->db->tableExists('project_legacy_reconciliation')) {
            $this->db->query("
                UPDATE projects p
                INNER JOIN project_legacy_reconciliation plr ON plr.project_id = p.id
                SET
                    p.legacy_sold_units             = plr.legacy_sold_units,
                    p.legacy_sold_net_price         = plr.legacy_sold_net_price,
                    p.legacy_total_discount_amount  = plr.legacy_total_discount_amount,
                    p.legacy_value_achieved         = plr.legacy_value_achieved
            ");
        }

        // ─── DROP 4 columns ออกจาก project_legacy_reconciliation ──────────
        if ($this->db->tableExists('project_legacy_reconciliation')) {
            $this->forge->dropColumn('project_legacy_reconciliation', [
                'legacy_sold_units',
                'legacy_sold_net_price',
                'legacy_total_discount_amount',
                'legacy_value_achieved',
            ]);
        }
    }

    public function down(): void
    {
        // ─── คืน 4 columns กลับไปยัง project_legacy_reconciliation ────────
        if ($this->db->tableExists('project_legacy_reconciliation')) {
            $this->forge->addColumn('project_legacy_reconciliation', [
                'legacy_sold_units' => [
                    'type'       => 'INT',
                    'constraint' => 11,
                    'null'       => false,
                    'default'    => 0,
                    'after'      => 'legacy_total_profit',
                ],
                'legacy_sold_net_price' => [
                    'type'       => 'DECIMAL',
                    'constraint' => '15,2',
                    'null'       => false,
                    'default'    => 0,
                    'after'      => 'legacy_sold_units',
                ],
                'legacy_total_discount_amount' => [
                    'type'       => 'DECIMAL',
                    'constraint' => '15,2',
                    'null'       => false,
                    'default'    => 0,
                    'after'      => 'legacy_sold_net_price',
                ],
                'legacy_value_achieved' => [
                    'type'       => 'DECIMAL',
                    'constraint' => '15,2',
                    'null'       => false,
                    'default'    => 0,
                    'after'      => 'legacy_total_discount_amount',
                ],
            ]);

            // คืนข้อมูลกลับ
            $this->db->query("
                UPDATE project_legacy_reconciliation plr
                INNER JOIN projects p ON p.id = plr.project_id
                SET
                    plr.legacy_sold_units             = p.legacy_sold_units,
                    plr.legacy_sold_net_price         = p.legacy_sold_net_price,
                    plr.legacy_total_discount_amount  = p.legacy_total_discount_amount,
                    plr.legacy_value_achieved         = p.legacy_value_achieved
            ");
        }

        // ─── DROP 5 columns ออกจาก projects ───────────────────────────────
        $this->forge->dropColumn('projects', [
            'legacy_sold_units',
            'legacy_sold_net_price',
            'legacy_total_discount_amount',
            'legacy_value_achieved',
            'legacy_dashboard_as_of_date',
        ]);
    }
}
