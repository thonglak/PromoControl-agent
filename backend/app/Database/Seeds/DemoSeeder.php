<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;
use App\Services\ProjectService;

/**
 * DemoSeeder — ข้อมูลสำหรับ development และทดสอบ
 *
 * สร้าง:
 *   - 1 โครงการ (โครงการทดสอบ PJ001 — ประเภท condo)
 *   - 2 house models (Type A Studio, Type B One-Bedroom)
 *   - 5 units (2+2 ตาม model + 1 พิเศษไม่ระบุ model)
 *   - 4 number_series (SALE, BUDGET_MOVE, BOTTOM_LINE, UNIT_ALLOC)
 *   - 3 promotion items (ส่วนลดเงินสด, แอร์ฟรี, ค่าโอน)
 *
 * หมายเหตุ: ไม่ seed admin user — ใช้ /api/auth/setup สร้างผ่าน UI
 *
 * วิธีใช้:
 *   docker exec promo_php php /var/www/backend/spark db:seed DemoSeeder
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $now = date('Y-m-d H:i:s');

        // ---- 1. สร้างโครงการ ----------------------------------------
        echo "  Creating demo project...\n";

        $this->db->table('projects')->insert([
            'code'               => 'PJ001',
            'name'               => 'โครงการทดสอบ',
            'description'        => 'โครงการคอนโดมิเนียมระดับกลาง ทำเลย่านรัชดาภิเษก เหมาะสำหรับทดสอบระบบ',
            'company_name'       => 'บริษัท ทดสอบ ดีเวลลอปเมนท์ จำกัด',
            'location'           => 'ถนนรัชดาภิเษก เขตดินแดง กรุงเทพมหานคร',
            'project_type'       => 'condo',
            'approval_required'  => true,
            'pool_budget_amount' => 1000000.00,
            'status'             => 'active',
            'start_date'         => '2024-01-01',
            'end_date'           => '2026-12-31',
            'created_at'         => $now,
            'updated_at'         => $now,
        ]);

        $projectId = $this->db->insertID();
        echo "    Project ID: {$projectId} (PJ001)\n";

        // ---- 2. สร้าง house models ----------------------------------
        echo "  Creating house models...\n";

        $this->db->table('house_models')->insert([
            'project_id'         => $projectId,
            'code'               => 'TYPE-A',
            'name'               => 'Type A — Studio (30 ตร.ม.)',
            'description'        => 'ห้องสตูดิโอ พื้นที่ใช้สอย 30 ตร.ม. เหมาะสำหรับคู่รักหรือผู้อยู่คนเดียว',
            'bedrooms'           => 0,
            'bathrooms'          => 1,
            'floors'             => 1,
            'area_sqm'           => 30.00,
            'land_area_sqw'      => null,
            'default_base_price' => 2500000.00,
            'default_unit_cost'  => 1800000.00,
            'default_budget'     => 100000.00,
            'image_url'          => null,
            'status'             => 'active',
            'total_units'        => 2,
            'created_at'         => $now,
            'updated_at'         => $now,
        ]);
        $modelAId = $this->db->insertID();

        $this->db->table('house_models')->insert([
            'project_id'         => $projectId,
            'code'               => 'TYPE-B',
            'name'               => 'Type B — 1 Bedroom (45 ตร.ม.)',
            'description'        => 'ห้อง 1 ห้องนอน พื้นที่ใช้สอย 45 ตร.ม. วิวเมือง ชั้น 8 ขึ้นไป',
            'bedrooms'           => 1,
            'bathrooms'          => 1,
            'floors'             => 1,
            'area_sqm'           => 45.00,
            'land_area_sqw'      => null,
            'default_base_price' => 3500000.00,
            'default_unit_cost'  => 2600000.00,
            'default_budget'     => 150000.00,
            'image_url'          => null,
            'status'             => 'active',
            'total_units'        => 2,
            'created_at'         => $now,
            'updated_at'         => $now,
        ]);
        $modelBId = $this->db->insertID();
        echo "    Model A ID: {$modelAId} (TYPE-A), Model B ID: {$modelBId} (TYPE-B)\n";

        // ---- 3. สร้าง units -----------------------------------------
        echo "  Creating project units...\n";

        $units = [
            // Type A — Studio
            [
                'project_id'      => $projectId,
                'house_model_id'  => $modelAId,
                'unit_code'       => 'A0501',
                'unit_number'     => 'A05-01',
                'floor'           => '5',
                'building'        => 'A',
                'area_sqm'        => 30.00,
                'unit_type'       => 'Studio',
                'base_price'      => 2500000.00,
                'unit_cost'       => 1800000.00,
                'appraisal_price' => 2450000.00,
                'standard_budget' => 100000.00,
                'status'          => 'available',
            ],
            [
                'project_id'      => $projectId,
                'house_model_id'  => $modelAId,
                'unit_code'       => 'A0801',
                'unit_number'     => 'A08-01',
                'floor'           => '8',
                'building'        => 'A',
                'area_sqm'        => 30.00,
                'unit_type'       => 'Studio',
                'base_price'      => 2600000.00,
                'unit_cost'       => 1850000.00,
                'appraisal_price' => 2500000.00,
                'standard_budget' => 100000.00,
                'status'          => 'available',
            ],
            // Type B — 1 Bedroom
            [
                'project_id'      => $projectId,
                'house_model_id'  => $modelBId,
                'unit_code'       => 'B1001',
                'unit_number'     => 'B10-01',
                'floor'           => '10',
                'building'        => 'B',
                'area_sqm'        => 45.00,
                'unit_type'       => '1 Bedroom',
                'base_price'      => 3500000.00,
                'unit_cost'       => 2600000.00,
                'appraisal_price' => 3400000.00,
                'standard_budget' => 150000.00,
                'status'          => 'available',
            ],
            [
                'project_id'      => $projectId,
                'house_model_id'  => $modelBId,
                'unit_code'       => 'B1201',
                'unit_number'     => 'B12-01',
                'floor'           => '12',
                'building'        => 'B',
                'area_sqm'        => 45.00,
                'unit_type'       => '1 Bedroom',
                'base_price'      => 3600000.00,
                'unit_cost'       => 2650000.00,
                'appraisal_price' => 3500000.00,
                'standard_budget' => 150000.00,
                'status'          => 'reserved', // ห้องที่จองแล้ว — ทดสอบ filter status
            ],
            // Special unit — ไม่ระบุ house model (ห้องพิเศษ Penthouse)
            [
                'project_id'      => $projectId,
                'house_model_id'  => null,
                'unit_code'       => 'PH3001',
                'unit_number'     => 'PH30-01',
                'floor'           => '30',
                'building'        => 'A',
                'area_sqm'        => 120.00,
                'unit_type'       => 'Penthouse',
                'base_price'      => 12000000.00,
                'unit_cost'       => 8500000.00,
                'appraisal_price' => 11500000.00,
                'standard_budget' => 500000.00,
                'status'          => 'available',
            ],
        ];

        foreach ($units as &$unit) {
            $unit['bottom_line_key'] = null;
            $unit['customer_name']   = null;
            $unit['salesperson']     = null;
            $unit['sale_date']       = null;
            $unit['transfer_date']   = null;
            $unit['remark']          = null;
            $unit['created_at']      = $now;
            $unit['updated_at']      = $now;
            $this->db->table('project_units')->insert($unit);
        }
        echo "    5 units created\n";

        // ---- 4. สร้าง number_series ผ่าน ProjectService ------------
        echo "  Creating number series (via ProjectService)...\n";

        $projectService = new ProjectService();
        $projectService->initDefaultNumberSeries($projectId);
        echo "    4 number series created for project {$projectId}\n";

        // ---- 5. สร้าง promotion items --------------------------------
        echo "  Creating promotion items...\n";

        $promotionItems = [
            // 1. ส่วนลดเงินสด (discount, fixed, is_unit_standard=true)
            [
                'code'               => 'DISC-CASH',
                'name'               => 'ส่วนลดเงินสด',
                'category'           => 'discount',
                'default_value'      => 50000.00,
                'max_value'          => 100000.00,
                'default_used_value' => 50000.00,
                'value_mode'         => 'fixed',
                'is_unit_standard'   => true,
                'sort_order'         => 1,
                'eligible_start_date'=> null,
                'eligible_end_date'  => null,
                'created_at'         => $now,
                'updated_at'         => $now,
            ],
            // 2. แอร์ฟรี (premium, fixed, is_unit_standard=true)
            [
                'code'               => 'PREM-AC',
                'name'               => 'แอร์ฟรี (พร้อมติดตั้ง)',
                'category'           => 'premium',
                'default_value'      => 30000.00,
                'max_value'          => 50000.00,
                'default_used_value' => 30000.00,
                'value_mode'         => 'fixed',
                'is_unit_standard'   => true,
                'sort_order'         => 2,
                'eligible_start_date'=> null,
                'eligible_end_date'  => null,
                'created_at'         => $now,
                'updated_at'         => $now,
            ],
            // 3. ค่าโอน (expense_support, calculated, is_unit_standard=false)
            //    มูลค่าคำนวณจาก fee_formulas — ดู fee_formulas สำหรับสูตร
            [
                'code'               => 'EXP-TRANSFER',
                'name'               => 'ค่าธรรมเนียมโอนกรรมสิทธิ์',
                'category'           => 'expense_support',
                'default_value'      => 0.00,
                'max_value'          => null,
                'default_used_value' => null,
                'value_mode'         => 'calculated',
                'is_unit_standard'   => false,
                'sort_order'         => 3,
                'eligible_start_date'=> null,
                'eligible_end_date'  => null,
                'created_at'         => $now,
                'updated_at'         => $now,
            ],
        ];

        foreach ($promotionItems as $item) {
            $this->db->table('promotion_item_master')->insert($item);
        }

        $transferItemId = $this->db->insertID();
        echo "    3 promotion items created\n";

        // สร้าง fee_formula สำหรับค่าโอน (2% ของ appraisal_price แบ่งครึ่ง)
        $this->db->table('fee_formulas')->insert([
            'promotion_item_id'  => $transferItemId,
            'base_field'         => 'appraisal_price',
            'manual_input_label' => null,
            'default_rate'       => 0.020000, // 2% ค่าธรรมเนียมโอนปกติ
            'buyer_share'        => 0.5000,   // แบ่งครึ่ง — ผู้ซื้อรับภาระ 50%
            'description'        => 'ค่าธรรมเนียมโอนกรรมสิทธิ์ปกติ 2% คิดจากราคาประเมิน แบ่งครึ่งกับผู้ซื้อ',
            'created_at'         => $now,
            'updated_at'         => $now,
        ]);

        // สร้าง fee_rate_policy มาตรการลดค่าโอน (ถ้าราคา ≤ 7M)
        $feeFormulaId = $this->db->insertID();
        $this->db->table('fee_rate_policies')->insert([
            'fee_formula_id'       => $feeFormulaId,
            'policy_name'          => 'มาตรการลดค่าธรรมเนียมโอน-จดจำนอง 2568-2569',
            'override_rate'        => 0.010000, // ลดเหลือ 1%
            'override_buyer_share' => null,     // ใช้ buyer_share เดิม (0.5)
            'conditions'           => json_encode(['max_base_price' => 7000000]),
            'effective_from'       => '2024-11-01',
            'effective_to'         => '2026-06-30',
            'is_active'            => true,
            'priority'             => 10,
            'created_by'           => null,
            'created_at'           => $now,
            'updated_at'           => $now,
        ]);
        echo "    fee_formula + fee_rate_policy for ค่าโอน created\n";

        // สรุป
        echo "\n  ✓ DemoSeeder complete:\n";
        echo "    - 1 project  (PJ001 — โครงการทดสอบ)\n";
        echo "    - 2 house models (TYPE-A, TYPE-B)\n";
        echo "    - 5 units (A0501, A0801, B1001, B1201, PH3001)\n";
        echo "    - 4 number series (SO, BM, BL, UA)\n";
        echo "    - 3 promotion items (DISC-CASH, PREM-AC, EXP-TRANSFER)\n";
        echo "    - 1 fee_formula + 1 fee_rate_policy\n";
        echo "\n  ℹ️  สร้าง Admin user ผ่าน http://localhost:8080/api/auth/setup\n";
    }
}
