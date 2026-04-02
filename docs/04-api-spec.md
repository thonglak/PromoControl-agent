# API Specification

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
POST /api/bottom-lines/import           (ยืนยัน import → backup + create table + update units)
GET  /api/bottom-lines                  (ประวัติ import ทั้งหมด)
GET  /api/bottom-lines/{import_key}     (รายละเอียด import ครั้งนั้น)
POST /api/bottom-lines/{import_key}/rollback  (rollback ไป backup)

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

