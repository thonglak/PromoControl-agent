# หน้าคืนงบยูนิตเข้า Pool (Unit Budget Return)

> **Route:** `/budget/unit-return-pool`
> **Menu:** Budget Management → คืนงบยูนิตเข้า Pool
> **สิทธิ์:** admin, manager เท่านั้น (พนักงานขายเห็นเมนูแต่ไม่สามารถกดโอนได้)

---

## วัตถุประสงค์

ใช้จัดการคืนงบยูนิต (UNIT_STANDARD) ที่ใช้ไม่หมดกลับเข้า Project Pool เพื่อ admin จะได้ ALLOCATE ไปยูนิตอื่นได้
รองรับทั้งโอนทีละยูนิต และเลือกหลายยูนิตโอนพร้อมกัน (Batch)

---

## Layout หน้าจอ

```
┌──────────────────────────────────────────────────────────────────────────┐
│  คืนงบยูนิตเข้า Pool                                                      │
│                                                                          │
│  [Dropdown เลือกโครงการ]                          Pool คงเหลือ: xxx,xxx   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ☐  ยูนิต  | สถานะ     | งบยูนิต   | ใช้ไป    | คืนแล้ว  | เหลือ(ยูนิต) | งบPoolเหลือ    | Action │
│  ──────────────────────────────────────────────────────────────────────────────────── │
│  ☐  A-001 | โอนแล้ว   | 200,000  | 80,000  | 0       | 120,000     | —             | [คืนงบ] │
│  ☐  A-005 | โอนแล้ว   | 200,000  | 150,000 | 30,000  | 20,000      | 50,000(คืนไม่ได้)| [คืนงบ] │
│     B-003 | ขายแล้ว   | 300,000  | 100,000 | 0       | 200,000     | —             | (ซ่อน)  │
│     B-010 | จอง       | 300,000  | 50,000  | 0       | 250,000     | 30,000(คืนไม่ได้)| (ซ่อน)  │
│                                                                          │
│  *** ดูได้ทุกยูนิตที่มีงบเหลือ แต่คืนงบได้เฉพาะสถานะ "โอนแล้ว" ***          │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [คืนงบเข้า Pool]  ← ปุ่มทีละยูนิต (กดที่แถวโอนแล้ว)                       │
│  [คืนงบทั้งหมดที่เลือก]  ← ปุ่ม Batch (เมื่อ checkbox ≥ 1)                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ส่วนประกอบหน้าจอ

### 1. Header

| องค์ประกอบ | รายละเอียด |
|-----------|-----------|
| หัวข้อ | "คืนงบยูนิตเข้า Pool" |
| Dropdown โครงการ | เลือกโครงการ → โหลดข้อมูลยูนิตของโครงการนั้น |
| Pool คงเหลือ | แสดง `getPoolBalance()` ของโครงการที่เลือก (real-time) |

### 2. ตารางยูนิต (Unit Table)

| คอลัมน์ | Field | คำอธิบาย |
|---------|-------|---------|
| Checkbox | — | สำหรับเลือก Batch |
| ยูนิต | `unit_code` | รหัสยูนิต |
| สถานะ | `sale_status` | สถานะการขาย (sold, reserved, etc.) |
| งบยูนิต | `standard_budget` | งบ standard ที่กำหนด |
| ใช้ไป | `totalPanelAUsed` | SUM(used_value) จาก sale_transaction_items WHERE UNIT_STANDARD |
| คืนแล้ว | `totalUnitBudgetReturned` | SUM(amount) จาก RETURN movements |
| เหลือ (ยูนิต) | `budgetUnitRemain` | = งบยูนิต - ใช้ไป - คืนแล้ว (**คืนได้**) |
| งบ Pool เหลือ | `pool_remain` | งบ Pool ที่จัดสรรให้ยูนิตแล้วใช้ไม่หมด (**คืนได้** — สำหรับยูนิตโอนแล้ว) |
| Action | ปุ่ม "คืนงบ" | กดเปิด dialog ระบุจำนวน |

**การแสดงผล:**
- แสดงทุกยูนิตที่มี sale transaction (ขายแล้ว/จอง/โอนแล้ว) และมีงบเหลือ (งบยูนิตหรืองบ Pool)
- เรียงตาม `budgetUnitRemain` มากไปน้อย (default)
- งบ Pool เหลือแสดงสีปกติ — สำหรับยูนิตที่โอนแล้วสามารถคืนได้ทั้งงบยูนิตและงบ Pool

**เงื่อนไขการคืนงบ (สำคัญ):**
- **Checkbox** → แสดงเฉพาะยูนิตที่สถานะ = `transferred` (โอนแล้ว) **และ** มีงบเหลือ (ยูนิตหรือ Pool)
- **ปุ่ม "คืนงบ"** → แสดงเฉพาะยูนิตที่สถานะ = `transferred` (โอนแล้ว) **และ** มีงบเหลือ
- ยูนิตที่สถานะ `sold`, `reserved` → **ดูงบเหลือได้** แต่ **คืนงบไม่ได้** (ไม่มี checkbox, ไม่มีปุ่ม)
- **งบ Pool ที่จัดสรรให้ยูนิตแล้วใช้ไม่หมด** → **คืนได้** สำหรับยูนิตที่โอนแล้ว (หักจากงบยูนิตก่อน ที่เหลือหักจากงบ Pool)
- แถวที่คืนไม่ได้แสดงสีจาง (opacity) เพื่อแยกความแตกต่าง

**Search/Filter เพิ่มเติม:**
- ค้นหาด้วย unit_code
- กรองตามแบบบ้าน (house_model)
- กรองตามสถานะ: ทั้งหมด / โอนแล้ว / ยังไม่โอน

### 3. Summary Bar (ด้านบนตาราง)

| ข้อมูล | คำอธิบาย |
|--------|---------|
| จำนวนยูนิตที่แสดง | เช่น "แสดง 15 ยูนิต" |
| งบเหลือรวม | SUM(budgetUnitRemain) ของทุกยูนิตที่แสดง |
| ที่เลือก | จำนวนยูนิตที่ checkbox (เช่น "เลือก 3 ยูนิต, งบรวม 340,000") |

---

## การโอนทีละยูนิต (Single Return)

1. กดปุ่ม **"คืนงบ"** ที่แถวของยูนิต
2. เปิด **Return Dialog**:
   - แสดง: ยูนิต, โครงการ, งบเหลือ
   - ช่อง **จำนวน** (number input): default = budgetUnitRemain (คืนทั้งหมด)
     - min = 1, max = budgetUnitRemain
   - ช่อง **หมายเหตุ** (textarea, optional)
   - ปุ่ม "ยืนยันคืนงบ" + "ยกเลิก"
3. กดยืนยัน → เรียก API → สร้าง RETURN movement → refresh ตาราง + Pool balance

---

## การโอนหลายยูนิต (Batch Return)

1. เลือก checkbox หลายยูนิต
2. กดปุ่ม **"คืนงบทั้งหมดที่เลือก"** (แสดงเมื่อ checkbox ≥ 1)
3. เปิด **Batch Return Dialog**:
   - แสดงรายการยูนิตที่เลือก:
     ```
     ยูนิต A-001: คืน 120,000
     ยูนิต A-005: คืน 20,000
     ยูนิต B-003: คืน 200,000
     ──────────────────
     รวม: 340,000 → เข้า Pool
     ```
   - **Batch คืน remaining ทั้งหมดของแต่ละยูนิต** (ไม่ต้องระบุจำนวนทีละยูนิต)
   - ช่อง **หมายเหตุ** (textarea, optional — ใช้ร่วมกันทุกยูนิต)
   - ปุ่ม "ยืนยันคืนงบ X ยูนิต" + "ยกเลิก"
4. กดยืนยัน → เรียก Batch API → สร้าง RETURN movement ทีละยูนิตใน 1 transaction → refresh ทั้งหมด

---

## API Endpoints

### POST `/api/budgets/return-to-pool`

คืนงบทีละยูนิต

**Request:**
```json
{
  "unit_id": 123,
  "amount": 120000,
  "remark": "คืนงบเหลือเข้า Pool"
}
```

**Response:** `201 Created`
```json
{
  "movement_id": 456,
  "unit_id": 123,
  "amount": 120000,
  "pool_balance_after": 620000
}
```

### POST `/api/budgets/batch-return-to-pool`

คืนงบหลายยูนิตพร้อมกัน

**Request:**
```json
{
  "items": [
    { "unit_id": 123 },
    { "unit_id": 456 },
    { "unit_id": 789 }
  ],
  "remark": "คืนงบยูนิตที่ขายแล้ว Q1"
}
```

> Batch return: คืน **remaining ทั้งหมด** ของแต่ละยูนิต (backend คำนวณ remaining เอง ไม่รับ amount จาก client เพื่อป้องกัน race condition)

**Response:** `201 Created`
```json
{
  "movements": [
    { "movement_id": 457, "unit_id": 123, "amount": 120000 },
    { "movement_id": 458, "unit_id": 456, "amount": 20000 },
    { "movement_id": 459, "unit_id": 789, "amount": 200000 }
  ],
  "total_returned": 340000,
  "pool_balance_after": 840000
}
```

### GET `/api/budgets/units-with-remaining?project_id=1`

ดึงรายการยูนิตที่มีงบเหลือ (สำหรับตารางหน้า Unit Budget Return)

**Response:**
```json
{
  "project": {
    "id": 1,
    "name": "SBP",
    "pool_balance": 500000
  },
  "units": [
    {
      "unit_id": 123,
      "unit_code": "A-001",
      "house_model": "TypeA",
      "sale_status": "transferred",
      "standard_budget": 200000,
      "total_used": 80000,
      "total_returned": 0,
      "budget_remain": 120000,
      "pool_allocated": 0,
      "pool_used": 0,
      "pool_remain": 0,
      "is_returnable": true
    },
    {
      "unit_id": 456,
      "unit_code": "B-003",
      "house_model": "TypeB",
      "sale_status": "sold",
      "standard_budget": 300000,
      "total_used": 100000,
      "total_returned": 0,
      "budget_remain": 200000,
      "pool_allocated": 50000,
      "pool_used": 20000,
      "pool_remain": 30000,
      "is_returnable": false
    }
  ]
}
```

---

## Business Rules

1. **ดูได้**: ยูนิตที่มี sale transaction (ทุกสถานะ: reserved, sold, transferred) และมีงบเหลือ (งบยูนิตหรืองบ Pool)
2. **คืนงบได้**: เฉพาะยูนิตที่สถานะ = `transferred` (โอนกรรมสิทธิ์แล้ว) **และ** มีงบเหลือ (UNIT_STANDARD หรือ PROJECT_POOL)
3. **งบ Pool (PROJECT_POOL) คืนได้**: งบส่วนกลางที่จัดสรรให้ยูนิตแล้วใช้ไม่หมด สามารถคืนเข้า Pool ได้ (สำหรับยูนิตที่โอนแล้ว) เพื่อเอาไปใช้ยูนิตอื่น
4. จำนวนที่คืนต้อง ≤ `budgetUnitRemain + poolRemain` (backend คำนวณ ณ เวลา submit, หักจากงบยูนิตก่อน ที่เหลือหักจากงบ Pool)
5. Batch return: backend คำนวณ remaining ของแต่ละยูนิตเอง — ไม่รับ amount จาก client
6. Batch return: ต้องตรวจทุกยูนิตว่าสถานะ = `transferred` ก่อนดำเนินการ
7. ทุก movement ใน batch ต้องอยู่ใน **1 DB transaction** — fail ทั้งหมดหรือสำเร็จทั้งหมด
8. Movement: type=`RETURN`, source=`UNIT_STANDARD` หรือ `PROJECT_POOL`, amount=ค่าบวก, status=`approved` (สร้างแยก movement ต่อ source)
9. Pool balance เพิ่มทันทีหลัง movement approved
10. สิทธิ์: admin, manager เท่านั้น
11. ยูนิตที่งบเหลือ = 0 ทั้งงบยูนิตและงบ Pool ไม่แสดงในตาราง
12. หลังคืนแล้ว → budgetUnitRemain ในหน้า Sales Entry ลดลงด้วย (ใช้ข้อมูลเดียวกัน)

---

## ประวัติการคืนงบ (Return History)

ด้านล่างตารางยูนิต แสดงประวัติการคืนงบ:

| คอลัมน์ | คำอธิบาย |
|---------|---------|
| วันที่ | created_at ของ movement |
| ยูนิต | unit_code |
| จำนวน | amount |
| หมายเหตุ | remark |
| ผู้ทำรายการ | created_by (user name) |

- เรียงล่าสุดก่อน
- Filter ตาม date range
- แสดง 20 รายการต่อหน้า (pagination)
