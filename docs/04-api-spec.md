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
    "approved_project_value": 584430000.00
  }
}
```

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
    "total_units": 82
  }
}
```

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
GET /api/projects
GET /api/projects/{id}
POST /api/projects
PUT /api/projects/{id}
DELETE /api/projects/{id}
GET /api/projects/{id}/units
GET /api/projects/{id}/house-models

POST/PUT body fields:
- `code`, `name`, `project_type`, `status`, `location`, `description`
- `pool_budget_amount` (DECIMAL 15,2) — งบ Pool ของโครงการ
- `common_fee_rate` (DECIMAL 10,2) — อัตราค่าส่วนกลาง (ทศนิยมได้)
- `electric_meter_fee` (DECIMAL 10,2) — ค่าติดตั้งมิเตอร์ไฟฟ้า
- `water_meter_fee` (DECIMAL 10,2) — ค่าติดตั้งมิเตอร์ประปา
- `approval_required` (boolean), `allow_over_budget` (boolean)

## House Models
GET /api/house-models
GET /api/house-models/{id}
POST /api/house-models
PUT /api/house-models/{id}
DELETE /api/house-models/{id}

## Units
GET /api/units
GET /api/units/export          ← ส่งออก Excel (.xlsx) รองรับ filter เดียวกับ list
GET /api/units/{id}
POST /api/units
PUT /api/units/{id}
DELETE /api/units/{id}
POST /api/units/preview-recalculate     # dry-run: นับยูนิตที่จะถูกอัปเดต
POST /api/units/bulk-recalculate        # คำนวณ unit_cost / appraisal_price จากสูตร แบบ batch

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

## Promotion Items (แยกตามโครงการ — ต้อง filter project_id เสมอ)
GET    /api/promotion-items?project_id=  (รายการทั้งหมดของโครงการที่เลือก พร้อม eligibility: eligible_house_models[], eligible_units[], sort_order, eligible_start_date, eligible_end_date)
GET    /api/promotion-items/{id}         (รายละเอียดรายการ พร้อม eligibility — ต้องตรวจว่า item อยู่ในโครงการที่เลือก)
POST   /api/promotion-items              (สร้างรายการใหม่ พร้อม project_id + eligibility conditions)
PUT    /api/promotion-items/{id}         (แก้ไขรายการ พร้อม eligibility conditions — ห้ามเปลี่ยน project_id)
DELETE /api/promotion-items/{id}         (ลบรายการ — ถ้ายังไม่เคยถูกใช้ใน sales_transaction_items)
GET    /api/promotion-items/browse-source         (ค้นจาก caldiscount.freebies — q, pj_code, page, per_page, project_id; คืน suggested_value_mode + already_added)
GET    /api/promotion-items/source-projects       (list distinct fre_pj_code + count — สำหรับ filter dropdown)
POST   /api/promotion-items/bulk-import           (นำเข้าทีละหลายรายการจาก freebies — project_id, default_category, fre_codes[])
POST   /api/promotion-items/import-json           (นำเข้าจากไฟล์ JSON ที่ export มา — project_id, items[]; resolve eligible_house_model_names/eligible_unit_codes ตามโครงการปลายทาง; รหัสซ้ำในโครงการจะถูกข้าม; สูงสุด 500 รายการ/ครั้ง)

## Fee Formulas (สูตรคำนวณค่าธรรมเนียม)
GET    /api/fee-formulas                      (รายการสูตรทั้งหมด พร้อม promotion_item + policy count)
GET    /api/fee-formulas/{id}                 (รายละเอียดสูตร พร้อม policies)
GET    /api/fee-formulas/variables            (รายการตัวแปรที่ใช้ได้ใน expression mode)
POST   /api/fee-formulas/validate-expression  (ตรวจ syntax + ตัวแปรของสูตร)
POST   /api/fee-formulas                      (สร้างสูตรใหม่ → auto-update value_mode='calculated')
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

## Number Series (เลขที่เอกสาร)
GET    /api/number-series                     (รายการ series ของโครงการที่เลือก)
GET    /api/number-series/{id}                (รายละเอียด series)
PUT    /api/number-series/{id}                (แก้ไข pattern, next_number)
POST   /api/number-series/preview             (Preview เลขที่จาก pattern)
GET    /api/number-series/{id}/logs           (ประวัติการออกเลขที่)
POST   /api/number-series/generate            (ออกเลขใหม่ — internal, ใช้ row lock)

## Sales Transactions
GET    /api/sales-transactions
GET    /api/sales-transactions/{id}
POST   /api/sales-transactions
PUT    /api/sales-transactions/{id}
POST   /api/sales-transactions/{id}/cancel     (ยกเลิกรายการขาย)
POST   /api/sales-transactions/{id}/transfer   (เปลี่ยนสถานะเป็นโอนแล้ว)

POST/PUT body (รายการขาย):
```json
{
  "project_id": 1,
  "unit_id": 10,
  "sale_date": "2026-05-04",
  "contract_price": 3500000,
  "items": [
    { "promotion_item_id": 5, "used_value": 50000, "funding_source_type": "UNIT_STANDARD" }
  ]
}
```

Field `contract_price` (DECIMAL 15,2): ราคาหน้าสัญญา — บังคับกรอก ต้อง > 0
- เก็บแยกจาก `base_price` / `net_price` ใช้อ้างอิงทางสัญญา/audit
- ไม่นำไปใช้ในสูตรคำนวณ profit / discount

### POST /api/sales-transactions/{id}/cancel — ยกเลิกขาย

```json
{
  "cancel_date": "2026-05-04",   // required, YYYY-MM-DD, ห้ามอนาคต
  "reason": "ลูกค้ายกเลิกสัญญา"   // optional, ≤ 500 ตัวอักษร (ละไว้/ส่ง '' ก็ได้ → NULL)
}
```

- ผลกระทบ: void budget movements ที่ผูกกับ transaction → คืนงบกลับแหล่งเดิม + เปลี่ยนสถานะยูนิตเป็น `available`
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

