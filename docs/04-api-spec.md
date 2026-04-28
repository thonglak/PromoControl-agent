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

## Projects
GET /api/projects
GET /api/projects/{id}
POST /api/projects
PUT /api/projects/{id}
DELETE /api/projects/{id}
GET /api/projects/{id}/units
GET /api/projects/{id}/house-models

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

## Fee Formulas (สูตรคำนวณค่าธรรมเนียม)
GET    /api/fee-formulas                      (รายการสูตรทั้งหมด พร้อม promotion_item + policy count)
GET    /api/fee-formulas/{id}                 (รายละเอียดสูตร พร้อม policies)
POST   /api/fee-formulas                      (สร้างสูตรใหม่ → auto-update value_mode='calculated')
PUT    /api/fee-formulas/{id}                 (แก้ไขสูตร)
DELETE /api/fee-formulas/{id}                 (ลบสูตร → auto-update value_mode='fixed')

## Fee Rate Policies (มาตรการ/นโยบาย)
GET    /api/fee-rate-policies                 (รายการนโยบายทั้งหมด)
GET    /api/fee-rate-policies/{id}            (รายละเอียดนโยบาย)
POST   /api/fee-rate-policies                 (สร้างนโยบายใหม่)
PUT    /api/fee-rate-policies/{id}            (แก้ไขนโยบาย)
DELETE /api/fee-rate-policies/{id}            (ลบนโยบาย)
PATCH  /api/fee-rate-policies/{id}/toggle     (เปิด/ปิดนโยบาย)

## Formula Tester (ทดสอบสูตร)
POST   /api/fee-formulas/test                 (ทดสอบสูตร — ยูนิตจริงหรือค่าสมมติ)
POST   /api/fee-formulas/test-batch           (ทดสอบกับทุกยูนิตในโครงการ)

## Number Series (เลขที่เอกสาร)
GET    /api/number-series                     (รายการ series ของโครงการที่เลือก)
GET    /api/number-series/{id}                (รายละเอียด series)
PUT    /api/number-series/{id}                (แก้ไข pattern, next_number)
POST   /api/number-series/preview             (Preview เลขที่จาก pattern)
GET    /api/number-series/{id}/logs           (ประวัติการออกเลขที่)
POST   /api/number-series/generate            (ออกเลขใหม่ — internal, ใช้ row lock)

## Sales Transactions
GET /api/sales-transactions
POST /api/sales-transactions
PUT /api/sales-transactions/{id}

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

