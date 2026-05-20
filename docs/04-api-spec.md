# API Specification

## Dashboard (Sales-Focused)
GET  /api/dashboard?project_id=&phase=          (ข้อมูลหลัก: ยอดขาย, stock, มูลค่าอนุมัติ — phase เป็น optional filter)
POST /api/dashboard/calculate-discount           (คำนวณส่วนลดประมาณการ body: { project_id, discount, phase? })
## Phases (เฟสโครงการ)
GET    /api/phases?project_id=                    (รายการ phase ของโครงการ พร้อม unit_count)
POST   /api/phases                                (สร้าง phase ใหม่ body: { project_id, name, sort_order? })
PUT    /api/phases/{id}                           (แก้ไข phase body: { name?, sort_order? })
DELETE /api/phases/{id}                           (ลบ phase — เฉพาะไม่มียูนิตอ้างอิง)

GET /api/dashboard response:
```json
{
  "data": {
    "sold_units": 8,
    "sold_net_price": 53390600.00,
    "avg_price_sold": 6673825.00,
    "remaining_units": 74,
    "stock_value": 528990000.00,
    "avg_price_remaining": 7148513.51,
    "total_units": 82,
    "approved_project_value": 584430000.00,
    "legacy": {
      "sold_units": 30,
      "sold_net_price": 120000000.00,
      "total_discount_amount": 5000000.00,
      "value_achieved": 130000000.00,
      "as_of_date": "2025-12-31"
    }
  }
}
```
หมายเหตุ: `legacy` = `null` ถ้ายังไม่ได้ตั้งค่า (ทั้ง 4 ตัวเลข = 0 และ `legacy_dashboard_as_of_date` IS NULL)
`legacy` มาจาก `projects` table (columns: `legacy_sold_units`, `legacy_sold_net_price`, `legacy_total_discount_amount`, `legacy_value_achieved`, `legacy_dashboard_as_of_date`)
`legacy` คือข้อมูล project-level (ไม่กรองตาม phase) — frontend combine เอง
ไม่มี `note` ใน legacy ของ Dashboard — note อยู่ใน `/api/projects/{id}/legacy-reconciliation` เท่านั้น

**นิยาม `sold_net_price` (ระบบใหม่)** = `SUM(net_price − total_promo_burden)` ของ `sales_transactions` ที่ `status='active'`
= ผลรวม "สุทธิหลังหักของแถม" (เทียบเท่าคอลัมน์ `net_after_promo` ในรายงาน Sales)
→ มีผลต่อเนื่อง: `avg_price_sold = sold_net_price / sold_units` และ `project_net_sales = sold_net_price + net_after_discount` (Section 4) ใช้ค่านี้เช่นกัน
หมายเหตุ: `legacy.sold_net_price` ยังคงเป็นค่าที่ user กรอกใน `projects.legacy_sold_net_price` ตามเดิม (ระบบเก่าไม่มี breakdown ของแถม)

POST /api/dashboard/calculate-discount request:
```json
{
  "project_id": 1,
  "discount": 50000,
  "phase": null
}
```

POST /api/dashboard/calculate-discount response:
```json
{
  "data": {
    "net_after_discount": 525290000.00,
    "avg_after_discount": 7098513.51,
    "total_discount_amount": 3700000.00,
    "discount_percent": 0.70,
    "project_net_sales": 578680600.00,
    "avg_price_project": 7057080.49,
    "approved_project_value": 584430000.00,
    "value_achieved": 578680600.00,
    "value_difference": -5749400.00,
    "difference_percent": -0.98,
    "remaining_units": 74,
    "stock_value": 528990000.00,
    "sold_net_price": 53390600.00,
    "total_units": 82,
    "legacy": {
      "sold_units": 30,
      "sold_net_price": 120000000.00,
      "total_discount_amount": 5000000.00,
      "value_achieved": 130000000.00,
      "as_of_date": "2025-12-31"
    }
  }
}
```
หมายเหตุ: `legacy` = `null` ถ้ายังไม่ได้ตั้งค่า (ดูเงื่อนไขเดียวกับ GET /api/dashboard)

GET /api/phases response:
```json
{
  "data": [
    { "id": 1, "name": "Phase 1", "sort_order": 1 },
    { "id": 2, "name": "Phase 2", "sort_order": 2 }
  ]
}
```

## Authentication Header

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

## Authentication
GET  /api/auth/check-setup    (public — ตรวจว่ามี user ในระบบหรือยัง)
POST /api/auth/setup          (public — สร้าง Admin คนแรก, ใช้ได้ครั้งเดียวเมื่อ users table ว่าง)
POST /api/auth/login          (public)
POST /api/auth/refresh        (public, uses httpOnly cookie)
POST /api/auth/logout         (authenticated)
GET  /api/auth/me             (authenticated)
PUT  /api/auth/change-password (authenticated)

## User Management (admin only)
GET    /api/users
GET    /api/users/{id}
POST   /api/users
PUT    /api/users/{id}
DELETE /api/users/{id}
PUT    /api/users/{id}/projects
PUT    /api/users/{id}/reset-password
GET    /api/users/browse-source                  # ค้นรายชื่อจาก back.por_users (q, page, per_page)
POST   /api/users/bulk-import                    # นำเข้าทีละหลายคนจาก por_users (default_role, use_ids[])

## Projects
GET    /api/projects
GET    /api/projects/{id}
POST   /api/projects
PUT    /api/projects/{id}
DELETE /api/projects/{id}
GET    /api/projects/{id}/units
GET    /api/projects/{id}/house-models
GET    /api/projects/{id}/legacy-reconciliation   (ข้อมูลกระทบยอดระบบเก่า — ทุก role ที่เข้าถึงโครงการได้)
PUT    /api/projects/{id}/legacy-reconciliation   (บันทึก/แก้ไข — admin, manager)
DELETE /api/projects/{id}/legacy-reconciliation   (ลบ — admin only)

### GET /api/projects/{id}/legacy-reconciliation

ข้อมูล X/Y เปรียบเทียบ (งบคงเหลือ + กำไร) จากระบบเก่า — ใช้กับหน้า รายการขาย
fields Dashboard (sold_units, sold_net_price ฯลฯ) ย้ายไปอยู่ใน `projects` table แล้ว

Response 200 (มีข้อมูล):
```json
{
  "data": {
    "project_id": "1",
    "legacy_total_budget_remaining": 12345678.00,
    "legacy_total_profit": 3456789.00,
    "as_of_date": "2025-12-31",
    "note": "ข้อมูล cutoff จากระบบเก่า Q4/2568",
    "updated_at": "2026-05-18 10:00:00",
    "updated_by": "1",
    "updated_by_name": "ชื่อคนแก้ล่าสุด"
  }
}
```
Response 200 (ยังไม่เคยตั้งค่า): `{ "data": null }` — ไม่ใช่ 404

### PUT /api/projects/{id}/legacy-reconciliation

Body:
```json
{
  "legacy_total_budget_remaining": 12345678.00,
  "legacy_total_profit": 3456789.00,
  "as_of_date": "2025-12-31",
  "note": "..."
}
```

Validation:
- `legacy_total_budget_remaining` (DECIMAL) — บังคับ, อนุญาตติดลบ
- `legacy_total_profit` (DECIMAL) — บังคับ, อนุญาตติดลบ
- `as_of_date` (DATE, YYYY-MM-DD) — บังคับ
- `note` (TEXT) — optional, ≤ 1000 ตัวอักษร

Upsert: INSERT ถ้าไม่มี / UPDATE ถ้ามีอยู่แล้ว — set `updated_by` = user ปัจจุบัน
Response: เหมือน GET (200)

### DELETE /api/projects/{id}/legacy-reconciliation

Response 200: `{ "success": true }`

POST/PUT body fields (สำหรับ Projects):
- `code`, `name`, `project_type`, `status`, `location`, `description`
- `pool_budget_amount` (DECIMAL 15,2) — งบ Pool ของโครงการ
- `common_fee_rate` (DECIMAL 10,2) — อัตราค่าส่วนกลาง (ทศนิยมได้)
- `electric_meter_fee` (DECIMAL 10,2) — ค่าติดตั้งมิเตอร์ไฟฟ้า
- `water_meter_fee` (DECIMAL 10,2) — ค่าติดตั้งมิเตอร์ประปา
- `approval_required` (boolean), `allow_over_budget` (boolean)
- `legacy_sold_units` (INT, default 0) — จำนวนยูนิตที่ขายในระบบเก่า (สำหรับ Dashboard legacy)
- `legacy_sold_net_price` (DECIMAL 15,2, default 0) — มูลค่าขายสุทธิระบบเก่า (อนุญาตติดลบ)
- `legacy_total_discount_amount` (DECIMAL 15,2, default 0) — มูลค่าส่วนลดรวมระบบเก่า (อนุญาตติดลบ)
- `legacy_value_achieved` (DECIMAL 15,2, default 0) — มูลค่าโครงการที่ทำได้ระบบเก่า (อนุญาตติดลบ)
- `legacy_dashboard_as_of_date` (DATE YYYY-MM-DD, nullable) — วันที่ cutoff สำหรับ Dashboard legacy

Validation (legacy dashboard fields — ทุก field optional):
- `legacy_sold_units`: integer >= 0
- `legacy_sold_net_price`, `legacy_total_discount_amount`, `legacy_value_achieved`: numeric (อนุญาตติดลบ)
- `legacy_dashboard_as_of_date`: YYYY-MM-DD หรือ null

## House Models
GET /api/house-models
GET /api/house-models/{id}
POST /api/house-models
PUT /api/house-models/{id}
DELETE /api/house-models/{id}    # 400 ถ้ายังมียูนิตผูกอยู่
                                  #   - sold/transferred → block ถาวร, response: { error, units:[{unit_code,status}] }
                                  #   - available/reserved → ขอให้ลบยูนิตก่อน, response: { error (พร้อมรหัสยูนิต preview), units:[{unit_code,status}] }

## Units
GET /api/units
GET /api/units/export          ← ส่งออก Excel (.xlsx) รองรับ filter เดียวกับ list
GET /api/units/{id}
POST /api/units
PUT /api/units/{id}
DELETE /api/units/{id}
POST /api/units/preview-recalculate     # dry-run: นับยูนิตที่จะถูกอัปเดต
POST /api/units/bulk-recalculate        # คำนวณ unit_cost / appraisal_price จากสูตร แบบ batch

GET  /api/units/sync-caldiscount/preview?project_id=    # preview sync ต้นทุน+ราคาประเมินจาก Caldiscount (np_products_profile.pd_bl, pd_price_ga)
POST /api/units/sync-caldiscount/apply                  # apply { project_id, unit_ids[] } → update unit_cost + appraisal_price

GET  /api/units/sync-caldiscount-sold/preview?project_id=  # preview sync สถานะขาย/โอนจาก Caldiscount (is_sold, is_trans, due_trans, date_trans)
                                                            #   summary: { total, will_update, no_change, conflict, not_found }
                                                            #   conflict = ยูนิตมี active sales_transaction ในระบบใหม่อยู่แล้ว → ข้าม
POST /api/units/sync-caldiscount-sold/apply              # apply { project_id, unit_ids[] }
                                                            #   set status (sold/transferred) + sale_date + transfer_date + legacy_source='caldiscount'
                                                            #   skip rows ที่ conflict (re-check ก่อน update กัน race)

## Unit Types (ประเภทยูนิต — กำหนดเองต่อโครงการ)
GET    /api/unit-types?project_id=     (รายการประเภทยูนิตของโครงการ)
POST   /api/unit-types                 (สร้างประเภทใหม่)
PUT    /api/unit-types/{id}            (แก้ไขชื่อ/ลำดับ)
DELETE /api/unit-types/{id}            (ลบ — เฉพาะไม่มียูนิตอ้างอิง)

## Bottom Line Import
POST /api/bottom-lines/upload           (upload Excel → return preview)
POST /api/bottom-lines/preview          (re-parse Excel ด้วย mapping ใหม่ → return preview)
POST /api/bottom-lines/import           (ยืนยัน import → backup + create table + update units)
GET  /api/bottom-lines                  (ประวัติ import ทั้งหมด)
GET  /api/bottom-lines/{import_key}     (รายละเอียด import ครั้งนั้น)
POST /api/bottom-lines/{import_key}/rollback  (rollback ไป backup)

mapping config รองรับ column (ทั้ง upload, preview, import):
- `unit_code_column` — บังคับ
- `bottom_line_price_column` — บังคับ
- `appraisal_price_column` — บังคับ
- `standard_budget_column` — ไม่บังคับ (ถ้าระบุจะอัปเดต project_units.standard_budget)
- `base_price_column` — ไม่บังคับ (ถ้าระบุจะอัปเดต project_units.base_price)

## Bottom Line Mappings
GET    /api/bottom-line-mappings
GET    /api/bottom-line-mappings/{id}
POST   /api/bottom-line-mappings
PUT    /api/bottom-line-mappings/{id}
DELETE /api/bottom-line-mappings/{id}

## Premium Import (นำเข้าของแถมจากไฟล์ Premium.xlsx ลง staging)
POST /api/premium-imports/upload         (upload Excel → parse ทุกชีต → return preview + temp_file) — role: admin, manager
POST /api/premium-imports/import         (ยืนยัน → เขียนลง staging 1 batch/ชีต) — role: admin, manager
POST /api/premium-imports/{id}/validate  (จับคู่ staging กับ DB จริง → status=validated) — role: admin, manager
POST /api/premium-imports/{id}/sync      (เขียนลง project_units + promotion → status=synced) — role: admin, manager
GET  /api/premium-imports                (ประวัติ batch ทั้งหมด, filter ?project_id=)
GET  /api/premium-imports/{id}           (รายละเอียด batch พร้อม units[] + premiums[] ต่อ unit)

หมายเหตุ:
- 1 ชีต = 1 โครงการ — จับคู่ projects.code จากช่อง "โครงการ" ในชีต
- คอลัมน์ของแถมไม่คงที่ → เก็บแบบ long-format; หมวด: discount / premium / expense_support
- import = staging เท่านั้น (premium_import_batches/_units/_values) ยังไม่แตะ project_units
- body ของ /import: `{ temp_file, sheet_names?: string[], file_name? }` (sheet_names ว่าง = ทุกชีต)

flow: import (pending) → validate (validated) → sync (synced)
- validate: จับคู่ plot_no↔project_units.unit_number, house_model_code↔house_models.code,
  premium_label↔promotion_item_master.name — เติม matched_* ใน staging (อ่านอย่างเดียวจาก DB จริง)
  response มี `plan[]` = แผนของแถมที่จะสร้าง (dry-run) แต่ละรายการมี key, proposed_name,
  strategy (group|unit_table), value, eligibility, existing_item_id — ให้ผู้ใช้ตรวจสอบ/แก้ชื่อ
- sync: รับ body `{ name_overrides: { <plan key>: "ชื่อใหม่" } }` (ไม่บังคับ) — ใช้ชื่อที่แก้ตอนสร้าง item
- sync: เขียน bottom_line_price→project_units.unit_cost, land_area_sqw→project_units.land_area_sqw,
  sync เฉพาะ unit ที่ match_status=matched
- sync จะสร้าง promotion_item_master ให้อัตโนมัติ โดยเลือกกลยุทธ์ต่อ label จากข้อมูล:
  - group-by-value : ถ้าจำนวนค่าที่ต่างกัน ≤ จำนวนแบบบ้าน (เช่น ส่วนลด, Air)
    → 1 รายการต่อ 1 ค่า, เก็บค่าใน default_value, eligibility = แบบบ้าน/ยูนิตที่มีค่านั้น
  - per-unit : ถ้าค่าต่างกันเยอะ (เช่น คชจ ฟรีวันโอน — ต่างเกือบทุกแปลง)
    → 1 รายการ, จำนวนเงินรายยูนิตเก็บใน promotion_item_unit_values
- eligibility: ผูกด้วยแบบบ้านเมื่อค่าผูกกับแบบบ้านสะอาด + house_models.code ตรงกับไฟล์,
  มิฉะนั้น fallback ผูกด้วยรายการยูนิต; ครอบคลุมทั้งโครงการ → เว้นว่าง (= ใช้ได้ทุกอัน)
- idempotent: รายการที่มีอยู่แล้วจับคู่ใหม่ (group=ชื่อ+ค่า, per-unit=ชื่อ) ไม่สร้างซ้ำ

## Promotion Items (แยกตามโครงการ — ต้อง filter project_id เสมอ)
GET    /api/promotion-items?project_id=  (รายการทั้งหมดของโครงการที่เลือก พร้อม eligibility: eligible_house_models[], eligible_units[], sort_order, eligible_start_date, eligible_end_date)
GET    /api/promotion-items/{id}         (รายละเอียดรายการ พร้อม eligibility — ต้องตรวจว่า item อยู่ในโครงการที่เลือก)
POST   /api/promotion-items              (สร้างรายการใหม่ พร้อม project_id + eligibility conditions)
PUT    /api/promotion-items/{id}         (แก้ไขรายการ พร้อม eligibility conditions — ห้ามเปลี่ยน project_id)
DELETE /api/promotion-items/{id}         (ลบรายการ — ถ้ายังไม่เคยถูกใช้ใน sales_transaction_items)
GET    /api/promotion-items/browse-source         (ค้นจาก caldiscount.freebies — q, pj_code, page, per_page, project_id; คืน suggested_value_mode + already_added)
GET    /api/promotion-items/source-projects       (list distinct fre_pj_code + count — สำหรับ filter dropdown)
GET    /api/promotion-items/value-sources         (รายการแหล่งข้อมูลค่ารายยูนิต — สำหรับ value_mode=unit_table; คืน key/label/description)
POST   /api/promotion-items/bulk-import           (นำเข้าทีละหลายรายการจาก freebies — project_id, default_category, fre_codes[])
POST   /api/promotion-items/import-json           (นำเข้าจากไฟล์ JSON ที่ export มา — project_id, items[]; resolve eligible_house_model_names/eligible_unit_codes ตามโครงการปลายทาง; รหัสซ้ำในโครงการจะถูกข้าม; สูงสุด 500 รายการ/ครั้ง)

value_mode: fixed | actual | manual | calculated | unit_table
- unit_table = ดึงจำนวนเงินรายยูนิตจากตารางตาม value_source (เช่น คชจ ฟรีวันโอน ที่ค่าต่างทุกแปลง)
- เมื่อ value_mode=unit_table ต้องระบุ value_source เป็น key จาก /value-sources (เช่น promotion_item_unit_value)
- engine (EligiblePromotionService) จะ resolve จำนวนเงินตาม unit แล้ว override default_value/default_used_value

## Fee Formulas (สูตรคำนวณค่าธรรมเนียม)
GET    /api/fee-formulas                      (รายการสูตรทั้งหมด พร้อม promotion_item + policy count)
GET    /api/fee-formulas/{id}                 (รายละเอียดสูตร พร้อม policies)
GET    /api/fee-formulas/variables            (รายการตัวแปรที่ใช้ได้ใน expression mode)
GET    /api/fee-formulas/export-json?project_id=X  (ส่งออกสูตรทั้งโครงการ พร้อม policies — รูปแบบ fee-formulas.v1)
POST   /api/fee-formulas/validate-expression  (ตรวจ syntax + ตัวแปรของสูตร)
POST   /api/fee-formulas                      (สร้างสูตรใหม่ → auto-update value_mode='calculated')
POST   /api/fee-formulas/import-json          (นำเข้าสูตรจากไฟล์ JSON — body: project_id, items[]; resolve โดย promotion_item_code; ข้ามถ้า code ไม่พบ / ไม่ใช่ value_mode='calculated' / มีสูตรอยู่แล้ว)
PUT    /api/fee-formulas/{id}                 (แก้ไขสูตร)
DELETE /api/fee-formulas/{id}                 (ลบสูตร → auto-update value_mode='fixed')

POST/PUT body fields:
- `promotion_item_id`, `base_field`, `default_rate`, `buyer_share`, `description`
- `manual_input_label` — สำหรับ `base_field='manual_input'`
- `formula_expression` — สำหรับ `base_field='expression'`

`base_field='expression'` (เขียนสูตรเอง):
- ตัวแปรที่ใช้ได้: `common_fee_rate`, `electric_meter_fee`, `water_meter_fee`, `pool_budget_amount`, `base_price`, `unit_cost`, `appraisal_price`, `land_area_sqw`, `area_sqm`, `standard_budget`, `contract_price`, `net_price`
- รองรับ `+ - * / ( )` และ `max, min, round, abs, floor, ceil`
- ผลลัพธ์ของสูตร IS ค่าสุดท้าย (ไม่นำไปคูณ rate × buyer_share อีก)
- ถ้าสูตรใช้ `contract_price` แต่ยังไม่กรอก → คืน `needs_input: true`

GET /api/promotion-items/eligible รองรับ query params:
- `contract_price` — สำหรับ recalculate expression formula ที่ใช้ตัวแปรนี้
- `net_price` — ราคาสุทธิปัจจุบัน (base_price - ผลรวมส่วนลด); ใช้ recalculate สูตรที่ `base_field='net_price'` หรือ expression ที่อ้าง `net_price` (ถ้าไม่ส่ง → fallback เป็น base_price + แสดง warning); FE คำนวณจาก panel 3A/3B แล้วยิงด้วย debounce 500ms ทุกครั้งที่รายการเปลี่ยน

## Fee Rate Policies (มาตรการ/นโยบาย)
GET    /api/fee-rate-policies                 (รายการนโยบายทั้งหมด)
GET    /api/fee-rate-policies/{id}            (รายละเอียดนโยบาย)
POST   /api/fee-rate-policies                 (สร้างนโยบายใหม่)
PUT    /api/fee-rate-policies/{id}            (แก้ไขนโยบาย)
DELETE /api/fee-rate-policies/{id}            (ลบนโยบาย)
PATCH  /api/fee-rate-policies/{id}/toggle     (เปิด/ปิดนโยบาย)
POST   /api/fee-formulas/validate-boolean-expression  (ตรวจ syntax สำหรับ boolean expression)

POST/PUT body fields:
- `policy_name`, `priority`, `effective_from`, `effective_to`, `is_active`
- `override_expression` (TEXT) — สูตร override (numeric) เช่น `contract_price * 0.015`
- `condition_expression` (TEXT) — เงื่อนไข boolean เช่น `contract_price > 5000000 and project_type == "condo"`
- `override_rate`, `override_buyer_share`, `conditions` (JSON) — legacy fields, backward compat

ตรรกะการ match:
1. ถ้ามี `condition_expression` → evaluate boolean (ใช้ก่อน legacy)
2. ถ้าไม่มี → fallback legacy JSON (`max_base_price`, `project_types`)
3. matched policy ที่ `priority` สูงสุดถูกใช้
4. ถ้ามี `override_expression` → ใช้แทน fee_formula expression
5. ถ้าไม่มี → ใช้ legacy `override_rate × override_buyer_share`

## Formula Tester (ทดสอบสูตร)
POST   /api/fee-formulas/test                 (ทดสอบสูตร — body: formula_id, mode='unit'|'manual', unit_id, sale_date, manual_input?, contract_price?, net_price?; ถ้าไม่ส่ง net_price → fallback เป็น base_price; ถ้าไม่ส่ง formula_id จะคืนทุกสูตร)
POST   /api/fee-formulas/test-batch           (ทดสอบสูตรเดียวกับทุกยูนิตในโครงการ — body: formula_id, sale_date, project_id)

## System Settings (ตั้งค่าระบบ — key/value ทั่วระบบ)
GET    /api/system-settings                   (รายการตัวแปรทั้งหมด — logged-in user ทุก role อ่านได้)
GET    /api/system-settings/{key}             (อ่านค่าเดียวตาม key)
PUT    /api/system-settings/{key}             (แก้ไขค่า — admin/manager; body: `{ "setting_value": <value> }`)

Schema row:
```json
{
  "id": 1,
  "setting_key": "transfer_fee_percent",
  "setting_value": 4.3,
  "description": "อัตราค่าธรรมเนียมโอน (%) — ใช้คำนวณ default ของ additional_expense_amount ใน sales-entry",
  "updated_by": 2,
  "updated_at": "2026-05-13 12:00:00"
}
```

- `setting_value` เก็บเป็น JSON ใน DB → รองรับ number / string / boolean / object ในอนาคต
- เพิ่ม key ใหม่ผ่าน migration/seed (controller จะปฏิเสธ key ที่ไม่ผ่าน validateValue)

Keys ปัจจุบัน:
- `transfer_fee_percent` (number, 0 ≤ x < 100) — ใช้คำนวณ default ของ `additional_expense_amount` ใน sales-entry

  สูตรหลัก (definition):
  ```
  additional_expense = (ราคาสุทธิยื่นกู้ − ราคาสุทธิ Net Price) × pct%
  ```
  โดย `ราคาสุทธิยื่นกู้ = net_price + loan_markup + (additional_expense ถ้า mode='add_to_net')`

  เนื่องจาก mode มี 3 แบบ จึงต้อง derive ออกมา 2 กรณี:

  - **mode `as_premium` หรือ `as_unit_expense`** (บริษัทจ่ายให้ลูกค้า) — `additional_expense` ไม่อยู่ใน `ราคาสุทธิยื่นกู้` ดังนั้น:
    - ผลต่าง = `loan_markup` เท่านั้น
    - `default = loan_markup × pct/100`

  - **mode `add_to_net`** (ลูกค้าจ่ายเอง บวกเข้าราคาสุทธิยื่นกู้) — `additional_expense` ถูกบวกเข้าใน `ราคาสุทธิยื่นกู้` ด้วย → ผลต่างจึงรวมตัวมันเอง:
    - `default = (loan_markup + default) × pct/100`
    - แก้สมการ closed-form: `default = loan_markup × p / (1 − p)` (โดย `p = pct/100`)
    - ทำให้ไม่ต้อง iterate และไม่เกิด feedback loop ในจอ

  ตัวอย่างที่อาจดูแปลกตา (เพื่อเข้าใจง่าย): `loan_markup = 200,000`, `pct = 1%`, mode = `add_to_net`
  ```
  default = 200,000 × 0.01 / (1 − 0.01) = 200,000 × 0.01 / 0.99 ≈ 2,020.20
  ```
  ตรวจกลับด้วยสูตรหลัก: `ราคาสุทธิยื่นกู้ − net = 200,000 + 2,020.20 = 202,020.20`; `202,020.20 × 1% = 2,020.20` ✓

  หมายเหตุ: ถ้า mode เดียวกันเป็น `as_premium` → `default = 200,000 × 1% = 2,000` ตรงๆ (ไม่ recursive)

## Number Series (เลขที่เอกสาร)
GET    /api/number-series                     (รายการ series ของโครงการที่เลือก)
GET    /api/number-series/{id}                (รายละเอียด series)
PUT    /api/number-series/{id}                (แก้ไข pattern, next_number)
POST   /api/number-series/preview             (Preview เลขที่จาก pattern)
POST   /api/number-series/provision           (สร้าง default series ที่ขาดให้ครบ — admin/manager; body: project_id; response: { created, types[] })
POST   /api/number-series/provision-all       (สแกนทุกโครงการ → fix ที่ขาด — admin only; response: { total_projects, fixed_projects, total_created, details[] })
GET    /api/number-series/{id}/logs           (ประวัติการออกเลขที่)
POST   /api/number-series/generate            (ออกเลขใหม่ — internal, ใช้ row lock)

## Sales Transactions
GET    /api/sales-transactions
GET    /api/sales-transactions/{id}
POST   /api/sales-transactions
PUT    /api/sales-transactions/{id}
POST   /api/sales-transactions/{id}/cancel     (ยกเลิกรายการขาย)
POST   /api/sales-transactions/{id}/transfer   (เปลี่ยนสถานะเป็นโอนแล้ว)

### GET /api/sales-transactions — summary.legacy field

`summary` object ใน response ของ GET /api/sales-transactions มี field `legacy` เพิ่มเติม:
```json
"summary": {
  "unit_budget_used": 0,
  "unit_budget_remaining": 0,
  "pool_budget_used": 0,
  "pool_budget_remaining": 0,
  "management_budget_used": 0,
  "management_budget_remaining": 0,
  "management_budget_returned": 0,
  "total_budget_remaining_all_units": 0,
  "total_profit": 0,
  "legacy": {
    "total_budget_remaining": 12345678.00,
    "total_profit": 3456789.00,
    "as_of_date": "2025-12-31",
    "note": "ข้อมูล cutoff จากระบบเก่า Q4/2568"
  }
}
```
- `legacy` = `null` ถ้ายังไม่ได้ตั้งค่าผ่าน `PUT /api/projects/{id}/legacy-reconciliation`
- ข้อมูลนี้ไม่กระทบสูตรคำนวณใดๆ — เป็น metadata เปรียบเทียบเท่านั้น

POST/PUT body (รายการขาย):
```json
{
  "project_id": 1,
  "unit_id": 10,
  "sale_date": "2026-05-04",
  "contract_price": 3500000,
  "loan_markup_amount": 100000,
  "additional_expense_amount": 50000,
  "additional_expense_mode": "add_to_net",
  "items": [
    { "promotion_item_id": 5, "used_value": 60000, "discount_convert_value": 40000, "funding_source_type": "UNIT_STANDARD" }
  ]
}
```

Field `contract_price` (DECIMAL 15,2): ราคาหน้าสัญญา — บังคับกรอก ต้อง > 0
- เก็บแยกจาก `base_price` / `net_price` ใช้อ้างอิงทางสัญญา/audit
- ไม่นำไปใช้ในสูตรคำนวณ profit / discount

Field `loan_markup_amount` (DECIMAL 15,2, default 0): ขอบวกเพิ่มเพื่อยื่นกู้ธนาคาร — optional
- เก็บเป็น virtual markup เพื่อแสดง "ราคาสุทธิยื่นกู้" คู่ขนานราคาสุทธิจริง
- ไม่กระทบ `net_price` / `profit` / budget — เป็นข้อมูลอ้างอิงล้วน

Field `additional_expense_amount` (DECIMAL 15,2, default 0): ค่าธรรมเนียมโอน — optional
Field `additional_expense_mode` (ENUM, default 'add_to_net'): โหมดการคิดค่าธรรมเนียมโอน
- `add_to_net` — ลูกค้าจ่ายเอง บวกเข้าราคาสุทธิยื่นกู้ ไม่กระทบ profit/budget
- `as_premium` — บริษัทจ่ายให้ลูกค้า ถือเป็น `expense_support` (รวมใน `total_expense_support`/`total_promo_burden`/`total_cost` → ลด `profit`) และหักจากงบ `MANAGEMENT_SPECIAL` ผ่าน budget_movements (movement_type=`SPECIAL_BUDGET_USE`)
- `as_unit_expense` — บริษัทจ่ายให้ลูกค้า ผูกกับรายการ `expense_support` ใน Panel A (funding_source=`UNIT_STANDARD`) → `additional_expense_amount` ถูก push เข้า `used_value` ของ item ที่ผูก (เลือกจาก dropdown ในหน้า sales-entry); ไม่สร้าง budget_movement พิเศษเพราะ amount ถูกบรรจุเป็น item ปกติแล้ว → ผลกระทบ profit/budget เหมือน expense_support ทั่วไป (กิน `UNIT_STANDARD`)
  - หมายเหตุ: payload ปัจจุบันไม่เก็บ `linked_item_id` แยก — backend infer จาก items (`category=expense_support` + `funding_source=UNIT_STANDARD`)

Field `items[].discount_convert_value` (DECIMAL 15,2, default 0): ส่วนของ `used_value` ที่แปลงเป็น discount — optional
- ใช้กับ category=`premium` + funding_source=`UNIT_STANDARD` เท่านั้น (validate)
- ต้อง `0 ≤ discount_convert_value ≤ used_value`
- ใช้ split รายการของแถมเป็น 2 ก้อนใน row เดียว: ของแถมจริง (premium) = `used_value − discount_convert_value`, ส่วนลด = `discount_convert_value`
- กระทบ `total_discount` (+= discount_convert_value) และ `total_promo_cost` (+= used_value − discount_convert_value)
- งบยูนิตยังหัก `used_value` เต็มก้อนเหมือนเดิม (movement ก้อนเดียว)
- ใน response ของ GET /sales-transactions/{id} → ส่ง `discount_convert_value` กลับใน `items[]` ด้วย (สำหรับ edit mode)
- รายการเดิมที่ `convert_to_discount=1` (ก่อน migration) ถูก backfill `discount_convert_value = used_value` (แปลงทั้งก้อน — ของแถมจริง=0)

### POST /api/sales-transactions/{id}/cancel — ยกเลิกขาย

```json
{
  "cancel_date": "2026-05-04",   // required, YYYY-MM-DD, ห้ามอนาคต
  "reason": "ลูกค้ายกเลิกสัญญา"   // optional, ≤ 500 ตัวอักษร (ละไว้/ส่ง '' ก็ได้ → NULL)
}
```

- ผลกระทบ: void budget movements ที่ผูกกับ transaction ทุกแหล่ง (ALLOCATE + USE) — balance ทุกแหล่งเด้งกลับสู่สภาพก่อนขาย ไม่สร้าง RETURN ใหม่ ไม่ดันงบเข้า Pool + เปลี่ยนสถานะยูนิตเป็น `available`
- รายละเอียด business rule + เงื่อนไข + schema ดู [docs/15-cancel-sale.md](./15-cancel-sale.md)

### POST /api/sales-transactions/{id}/transfer — โอนกรรมสิทธิ์

```json
{
  "transfer_date": "2026-05-04"   // required, YYYY-MM-DD, ห้ามอนาคต
}
```

- เงื่อนไข: `transaction.status = active` AND `unit.status = sold`
- ผลกระทบ: เปลี่ยนสถานะยูนิตเป็น `transferred` → ห้ามยกเลิกขายอีก

## Budget Movements
GET /api/budget-movements
POST /api/budget-movements
POST /api/budget-movements/transfer-special — โอนงบพิเศษระหว่าง unit (admin, manager)

### โอนงบพิเศษระหว่าง unit

| Method | Path | Description | Role |
|--------|------|-------------|------|
| POST | /api/budget-movements/transfer-special | โอนงบพิเศษระหว่าง unit | admin, manager |

Request body:
```json
{
  "from_unit_id": 1,
  "to_unit_id": 5,
  "budget_source_type": "MANAGEMENT_SPECIAL",
  "amount": 50000,
  "note": "โอนงบเหลือจาก A-001 ให้ B-002"
}
```

Response 200:
```json
{
  "data": {
    "transfer_out": {
      "id": 55,
      "movement_type": "SPECIAL_BUDGET_TRANSFER_OUT",
      "unit_id": 1,
      "amount": -50000,
      "status": "approved",
      "reference_id": 56
    },
    "transfer_in": {
      "id": 56,
      "movement_type": "SPECIAL_BUDGET_TRANSFER_IN",
      "unit_id": 5,
      "amount": 50000,
      "status": "approved",
      "reference_id": 55
    },
    "message": "โอนงบสำเร็จ"
  }
}
```

Error 422 (เกินงบ):
```json
{
  "error": "จำนวนเงินเกินงบคงเหลือ (เหลือ 50,000 บาท)"
}
```

## Sync Target Tables (ตั้งค่า target table สำหรับ sync — admin only)
GET    /api/sync-target-tables                   (รายการ target table ทั้งหมด)
POST   /api/sync-target-tables                   (เพิ่ม target table ใหม่)
PUT    /api/sync-target-tables/{id}              (แก้ไข target table)
DELETE /api/sync-target-tables/{id}              (ลบ target table — ถ้าไม่มี preset อ้างอิง)
GET    /api/sync-target-tables/{id}/columns      (ดึง columns ของ table จาก DB schema)

POST body:
```json
{
  "table_name": "promotion_item_master",
  "label": "รายการโปรโมชัน",
  "default_upsert_key": "item_code",
  "is_active": true
}
```

GET /api/sync-target-tables/{id}/columns response:
```json
{ "data": [{ "field": "unit_code", "type": "varchar", "label": "unit_code" }] }
```

## External API Configs (ตั้งค่า API ภายนอก — admin, manager)
GET    /api/external-api-configs?project_id=   (รายการ config ของโครงการ)
POST   /api/external-api-configs               (สร้าง config ใหม่)
PUT    /api/external-api-configs/{id}          (แก้ไข config)
DELETE /api/external-api-configs/{id}          (ลบ config — เฉพาะยังไม่มี snapshot อ้างอิง)

POST body (create/update):
```json
{
  "project_id": 1,
  "name": "Narai Unit API",
  "api_url": "https://api.narai.example.com/units",
  "is_active": true
}
```

## Sync from API (ดึงข้อมูลจาก API ภายนอก — admin, manager)
POST   /api/sync-from-api/fetch               (ดึงข้อมูลจาก API → สร้าง snapshot table)
POST   /api/sync-from-api/test                (ทดสอบเรียก API — ไม่สร้าง snapshot, body: { config_id?: int, url?: string })
GET    /api/sync-from-api?project_id=          (รายการ snapshot ทั้งหมดของโครงการ)
GET    /api/sync-from-api/{id}                (ดูข้อมูล snapshot + data จาก dynamic table)
POST   /api/sync-from-api/{id}/sync            (Sync snapshot เข้า project_units ด้วย mapping preset)
POST   /api/sync-from-api/{id}/sync-house-models  (สร้างแบบบ้านจาก snapshot + ผูก unit)
PUT    /api/sync-from-api/{id}                (แก้ไขชื่อแสดงผล snapshot — body: { name: string })
DELETE /api/sync-from-api/{id}                (ลบ snapshot + DROP dynamic table)

POST /api/sync-from-api/{id}/sync body:
```json
{
  "preset_id": 1
}
```
Response:
```json
{
  "data": {
    "created": 50,
    "updated": 30,
    "skipped": 2,
    "errors": [
      { "row": 15, "error": "Duplicate entry for key 'unit_code'" }
    ]
  }
}
```

POST /api/sync-from-api/{id}/sync-house-models body:
```json
{
  "preset_id": 1
}
```
Response:
```json
{
  "data": {
    "models_created": 5,
    "models_existing": 2,
    "units_linked": 120
  }
}
```

POST /api/sync-from-api/fetch body:
```json
{
  "config_id": 1
}
```

GET /api/sync-from-api/{id} response:
```json
{
  "snapshot": {
    "id": 1,
    "code": "API20260403143022",
    "name": "ข้อมูลยูนิต Q2/2026",
    "project_id": 1,
    "config_id": 1,
    "api_url": "https://api.narai.example.com/units",
    "total_rows": 120,
    "status": "completed",
    "fetched_by": 2,
    "fetched_by_name": "สมชาย ใจดี",
    "created_at": "2026-04-03 14:30:22"
  },
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 120,
    "total_pages": 6
  }
}
```

PUT /api/sync-from-api/{id} body:
```json
{
  "name": "ข้อมูลยูนิต Q2/2026"
}
```
Response:
```json
{
  "data": {
    "id": 1,
    "name": "ข้อมูลยูนิต Q2/2026",
    "code": "API20260403143022"
  }
}
```
หมายเหตุ: แก้ไขเฉพาะ `name` (ชื่อแสดงผล) — `code` ใช้เป็นชื่อ dynamic table จึงแก้ไขไม่ได้

หมายเหตุ:
- ต้อง login ผ่าน Narai Connect ก่อน (เพื่อให้มี narai_access_token ใน users table)
- `project_id_mode = 'from_field'` รองรับทั้ง numeric ID และ string code (lookup จาก `projects.code` อัตโนมัติ)
- ข้อมูลยูนิตเก็บใน dynamic table: sync_{code} (เช่น sync_API20260403143022)
- ทุก column จาก JSON response จะถูก sanitize เป็น a-z, 0-9, underscore และเก็บเป็น TEXT

## API Field Mappings (จับคู่ field — admin, manager)
GET    /api/api-field-mappings?project_id=          (รายการ presets พร้อม columns_count)
GET    /api/api-field-mappings/target-fields?target_table=  (รายการ target fields — ดึง columns จาก DB schema แบบ dynamic, default: project_units)
GET    /api/api-field-mappings/source-fields?snapshot_id=  (รายการ columns จาก snapshot dynamic table พร้อม sample value)
GET    /api/api-field-mappings/{id}                 (preset detail พร้อม columns ทั้งหมด)
POST   /api/api-field-mappings                      (สร้าง preset ใหม่พร้อม columns)
PUT    /api/api-field-mappings/{id}                 (แก้ไข preset + replace columns ทั้งหมด)
DELETE /api/api-field-mappings/{id}                 (ลบ preset พร้อม columns)
GET    /api/api-field-mappings/{id}/export           (download preset เป็น JSON file)
POST   /api/api-field-mappings/import                (upload JSON file + project_id → สร้าง preset ใหม่ ชื่อซ้ำ→ต่อท้าย "(copy)")

หมายเหตุ: POST/PUT รับเพิ่มเติม:
- `target_table` (default: 'project_units') — ตาราง DB ปลายทาง
- `upsert_key` (default: 'unit_code') — field สำหรับ match
- `project_id_mode` (default: 'from_snapshot') — วิธีจัดการ project_id: `from_snapshot` | `from_field` | `none`
- `project_id_field` (nullable) — source field เมื่อ mode = from_field

Transform types ที่รองรับ: `none`, `number`, `date`, `status_map`, `fk_lookup`

fk_lookup transform_value ตัวอย่าง:
```json
{"lookup_table":"house_models","lookup_field":"code","scope_by_project":true,"create_if_missing":true,"create_fields":{"name":"{value}","code":"{value}"}}
```

## Dev Tools (admin only)
POST /api/dev/clear-transactions — ล้างข้อมูลการขายของโครงการ
GET  /api/dev/clear-logs?project_id= — ประวัติการล้างข้อมูล (audit trail, ล่าสุด 50 รายการ)

### POST /api/dev/clear-transactions

| Method | Path | Description | Role |
|--------|------|-------------|------|
| POST | /api/dev/clear-transactions | ล้างข้อมูลการขายของโครงการ + เขียน audit log | admin |

Request body:
```json
{
  "project_id": 1,
  "mode": "sales_only",
  "project_name_confirm": "โครงการ A",
  "reason": "เคลียร์ข้อมูลทดสอบ"
}
```

Field:
- `mode`: `sales_only` (ลบเฉพาะรายการขาย + USE/auto-RETURN — คงงบที่ตั้งไว้) หรือ `full_reset` (ลบทุกอย่าง รวม ALLOCATE/allocations + reset BUDGET_MOVE number_series)
- `project_name_confirm`: ต้องตรงกับชื่อโครงการ — ป้องกันการล้างผิดโครงการ
- `reason`: optional

Response 200:
```json
{
  "message": "ล้างข้อมูลสำเร็จ",
  "mode": "sales_only",
  "summary": {
    "deleted_transaction_items": 12,
    "deleted_transactions": 5,
    "deleted_budget_movements": 18,
    "deleted_budget_allocations": 0,
    "reset_units": 5
  }
}
```

Error 400: `mode` ไม่ถูกต้อง / ชื่อโครงการไม่ตรง  
Error 403: ไม่ใช่ admin  
Error 404: ไม่พบโครงการ


