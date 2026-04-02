# Business Rules

## Profit Calculation

```
net_price = base_price - total_discount
total_promo_burden = total_promo_cost + total_expense_support
total_cost = unit_cost + total_promo_burden
profit = net_price - total_cost

total_discount = sum(used_value where effective_category='discount')
total_promo_cost = sum(used_value where effective_category='premium')
total_expense_support = sum(used_value where effective_category='expense_support')
total_promo_burden = total_promo_cost + total_expense_support   ← ต้นทุนจากของแถม (แสดงผลใน UI)
```

> **หมายเหตุ:** `total_promo_burden` (ต้นทุนจากของแถม) เป็นค่าแสดงผลเพิ่มเติมใน Section 4 สรุป
> สูตร `total_cost` ไม่เปลี่ยน — แค่แยกแสดง promo_cost + expense_support ก่อนรวมเป็น total_cost

---

## Promotion Categories

| Category          | Description                    | Effect on net_price | Effect on total_cost |
|-------------------|--------------------------------|---------------------|----------------------|
| `discount`        | Reduces selling price          | ลด                  | ไม่เปลี่ยน           |
| `premium`         | Free gifts provided by company | ไม่เปลี่ยน          | บวก                  |
| `expense_support` | Company pays buyer expenses    | ไม่เปลี่ยน          | บวก                  |

**Important rule:** Promotion category must not be confused with budget source.

---

## Promotion Item Master

Promotion items are defined in a master table. **แยกตามโครงการ — ของแถมโครงการใดใช้ได้เฉพาะโครงการนั้น ไม่ใช้ร่วมกัน**

กฎ:
- ทุกรายการของแถมต้องผูกกับ `project_id` เสมอ
- **รหัสของแถม (`code`) สร้างอัตโนมัติ** — รูปแบบ `PI-XXXX` (running number per project) ผู้ใช้ไม่ต้องกรอก
- `UNIQUE(project_id, code)` — ป้องกันซ้ำภายในโครงการ
- API ต้อง filter ตาม `project_id` ของโครงการที่เลือกเสมอ
- การ query ของแถม, สูตร, นโยบาย ต้อง scope ตามโครงการที่ user เลือกอยู่

Examples: Cash Discount, Air Conditioner, Gift Voucher, Furniture Package, Transfer Fee

### Standard Items (ของแถมงบยูนิต)

รายการของแถมที่ `is_unit_standard = true` คือ **ของแถม Standard** ที่บริษัทเสนอให้ลูกค้าตั้งแต่แรก

กฎ:
- แสดงอัตโนมัติใน Panel 3A เมื่อเลือกยูนิต (ไม่ต้องเพิ่มเอง)
- ใช้งบยูนิต (`UNIT_STANDARD`) เท่านั้น
- ไม่สามารถลบออกจาก Panel 3A ได้ (ถ้าไม่ใช้ให้ใส่ `used_value = 0`)
- เฉพาะรายการที่ `used_value > 0` จะถูกบันทึกเป็น `sales_transaction_items`

รายการที่ `is_unit_standard = false` จะแสดงเฉพาะใน Panel 3B (ของแถมเพิ่มเติม) โดยพนักงานขายเลือกเพิ่มเอง

### Default Used Value (ค่าเริ่มต้นมูลค่าที่ใช้)

แต่ละรายการของแถมสามารถกำหนด `default_used_value` ได้:
- ถ้ากำหนดค่าไว้ → ใช้เป็นค่าเริ่มต้นของ `used_value` เมื่อแสดงในหน้า Sales Entry
- ถ้าไม่ได้กำหนด (null) → fallback ใช้ `max_value` เป็นค่าเริ่มต้น
- ค่า `default_used_value` ต้องไม่เกิน `max_value`
- พนักงานขายแก้ไขค่า `used_value` ได้เสมอ (ทั้งเพิ่มและลด แต่ต้องไม่เกิน max_value)

### Value Modes

| Mode         | Description                          |
|--------------|--------------------------------------|
| `fixed`      | Fixed value defined in master        |
| `actual`     | Actual value used at time of sale    |
| `manual`     | Manually entered per transaction     |
| `calculated` | คำนวณจากสูตร (ดู fee_formulas)       |

### Calculated Value Mode (ของแถมแบบคำนวณตามสูตร)

สำหรับรายการที่ `value_mode = 'calculated'` เช่น ค่าธรรมเนียมโอน, ค่าจดจำนอง

**สูตรพื้นฐาน:**
```
calculated_value = base_amount × effective_rate × buyer_share
```

**ลำดับการคำนวณ:**
1. ดึง `fee_formulas` ที่ผูกกับ `promotion_item_id`
2. ดึง `base_amount` ตาม `base_field`:
   - `appraisal_price` → จาก `project_units.appraisal_price`
   - `base_price` → จาก `project_units.base_price`
   - `net_price` → คำนวณ real-time จาก `base_price - total_discount`
   - `manual_input` → พนักงานกรอกเอง (เช่น วงเงินจำนอง)
3. ตรวจ `fee_rate_policies` ที่ตรงเงื่อนไข:
   - `is_active = true`
   - `effective_from ≤ sale_date ≤ effective_to`
   - `conditions` ตรงกับข้อมูลยูนิต (เช่น `max_base_price`, `project_types`)
   - ถ้ามีหลาย policy ตรง → ใช้ `priority` สูงสุด
4. กำหนด rate:
   - ถ้ามี policy ตรง → `effective_rate = override_rate`, `buyer_share = override_buyer_share ?? formula.buyer_share`
   - ถ้าไม่มี → `effective_rate = formula.default_rate`, `buyer_share = formula.buyer_share`
5. คำนวณ `calculated_value` แล้วกรอกเป็น `used_value` (default)
6. พนักงานแก้ไข `used_value` ได้ แต่ถ้ามี `max_value` ต้องไม่เกิน

**กฎ:**
- ถ้า `base_field` ต้องการข้อมูลที่ยังไม่มี (เช่น `appraisal_price = null`) → แสดงค่า 0 พร้อมเตือน "ยังไม่มีราคาประเมิน"
- ถ้า `base_field = manual_input` → แสดงช่องกรอกค่าฐาน (label จาก `fee_formulas.manual_input_label`) แล้วคำนวณอัตโนมัติ
- ค่า `calculated_value` จะ **recalculate** ทุกครั้งที่ข้อมูลฐานเปลี่ยน (เช่น เปลี่ยนยูนิต, แก้ราคา)
- `max_value` ใน `promotion_item_master` ทำหน้าที่เป็น **เพดาน (cap)** — ถ้า calculated_value > max_value → ใช้ max_value
- ถ้า `max_value = null` → ไม่มีเพดาน ใช้ค่าที่คำนวณได้ตรงๆ
- `default_used_value` ไม่มีผลกับ `value_mode = 'calculated'` (ใช้ค่าจากสูตรแทน)

**ตัวอย่าง: ฟรีค่าธรรมเนียมโอน**
```
promotion_item_master:
  code: TRANSFER_FEE
  name: ฟรีค่าธรรมเนียมโอน
  category: expense_support
  value_mode: calculated
  max_value: null (ไม่มีเพดาน)
  is_unit_standard: true

fee_formulas:
  base_field: appraisal_price
  default_rate: 0.02          (2% อัตราปกติ)
  buyer_share: 0.5            (ผู้ซื้อรับครึ่งหนึ่ง → 1%)

fee_rate_policies:
  policy_name: "มาตรการลดค่าโอน 2567-2568"
  override_rate: 0.01         (ลดเหลือรวม 1%)
  override_buyer_share: 0.5   (ผู้ซื้อยังจ่ายครึ่ง → 0.5%)
  conditions: {"max_base_price": 3000000}
  effective_from: 2024-04-01
  effective_to: 2025-12-31

ยูนิต A-001: base_price = 2,800,000 / appraisal_price = 3,000,000
sale_date: 2025-06-15
→ policy ตรง (2,800,000 ≤ 3,000,000 ✓, อยู่ในช่วงเวลา ✓)
→ calculated_value = 3,000,000 × 0.01 × 0.5 = 15,000 บาท

ยูนิต B-002: base_price = 5,000,000 / appraisal_price = 5,200,000
→ policy ไม่ตรง (5,000,000 > 3,000,000 ✗)
→ ใช้อัตราปกติ: 5,200,000 × 0.02 × 0.5 = 52,000 บาท
```

**ตัวอย่าง: ฟรีค่าจดจำนอง**
```
promotion_item_master:
  code: MORTGAGE_REG_FEE
  name: ฟรีค่าจดจำนอง
  category: expense_support
  value_mode: calculated
  is_unit_standard: false     (อยู่ Panel 3B — ไม่ใช่ทุกยูนิตจะให้ฟรี)

fee_formulas:
  base_field: manual_input
  manual_input_label: "วงเงินจำนอง"
  default_rate: 0.01          (1%)
  buyer_share: 1.0            (ผู้ซื้อรับทั้งหมด)

fee_rate_policies:
  policy_name: "มาตรการลดค่าจดจำนอง 2567-2568"
  override_rate: 0.0001       (ลดเหลือ 0.01%)
  conditions: {"max_base_price": 3000000}
  effective_from: 2024-04-01
  effective_to: 2025-12-31

พนักงานกรอกวงเงินจำนอง: 2,000,000
→ policy ตรง
→ calculated_value = 2,000,000 × 0.0001 × 1.0 = 200 บาท
```

### Eligibility Conditions (เงื่อนไขในการนำไปใช้)

แต่ละรายการของแถมสามารถกำหนดเงื่อนไขในการนำไปใช้ได้ 3 ด้าน พร้อมอันดับการเรียงลำดับ:

**1. แบบบ้านที่ใช้ได้ (House Model Eligibility)**
- **ทุกแบบบ้าน** → ตาราง `promotion_item_house_models` ว่าง (ไม่มี record)
- **ระบุแบบบ้าน** → เพิ่ม record ใน `promotion_item_house_models` (เลือกได้หลายแบบบ้าน)
- ตรวจสอบจาก `house_model_id` ของยูนิตที่เลือก
- ถ้ายูนิตไม่มี `house_model_id` (null) → ถือว่าผ่านเงื่อนไขแบบบ้าน (ไม่ถูกกรองออก)

**2. ระยะเวลาที่ใช้ได้ (Date Eligibility)**
- **ไม่จำกัดระยะเวลา** → `eligible_start_date = null` AND `eligible_end_date = null`
- **กำหนดเฉพาะวันเริ่มต้น** → `eligible_start_date` มีค่า, `eligible_end_date = null`
- **กำหนดเฉพาะวันสิ้นสุด** → `eligible_start_date = null`, `eligible_end_date` มีค่า
- **กำหนดทั้งสองวัน** → ทั้ง `eligible_start_date` และ `eligible_end_date` มีค่า
- ตรวจสอบจาก `sale_date` ของ sales transaction:
  - ถ้า `eligible_start_date` มีค่า → `sale_date >= eligible_start_date`
  - ถ้า `eligible_end_date` มีค่า → `sale_date <= eligible_end_date`

**3. ยูนิตที่ใช้ได้ (Unit Eligibility)**
- **ทุกยูนิต** → ตาราง `promotion_item_units` ว่าง (ไม่มี record)
- **ระบุยูนิต** → เพิ่ม record ใน `promotion_item_units` (เลือกได้หลายยูนิต)
- ตรวจสอบจาก `unit_id` ของยูนิตที่เลือก

**4. อันดับในการเรียงลำดับ (Sort Order)**
- `sort_order` (INT, default: 0) — ยิ่งน้อยยิ่งแสดงก่อน
- ใช้สำหรับเรียงลำดับแสดงผลใน Panel 3A และ Dropdown ของ Panel 3B
- ถ้า `sort_order` เท่ากัน → เรียงตาม `name` (ก-ฮ)

**กฎการตรวจ Eligibility:**
- ตรวจเงื่อนไขทั้ง 3 ด้านพร้อมกัน (AND) — ต้องผ่านทุกเงื่อนไข
- Panel 3A: filter รายการ `is_unit_standard = true` ที่ผ่าน eligibility → แสดงเฉพาะรายการที่ eligible
- Panel 3B Dropdown: filter รายการ `is_unit_standard = false` ที่ผ่าน eligibility → แสดงเฉพาะรายการที่ eligible
- Eligibility ไม่มีผลย้อนหลังกับ sales transactions ที่บันทึกไปแล้ว

**ตัวอย่าง:**
```
promotion_item_master: แอร์ Daikin Inverter
  sort_order: 1
  eligible_start_date: 2025-01-01
  eligible_end_date: 2025-12-31
  promotion_item_house_models: [HM-001, HM-003]  ← ใช้ได้เฉพาะแบบบ้าน A และ C
  promotion_item_units: []                        ← ใช้ได้ทุกยูนิต (ในแบบบ้านที่กำหนด)

เมื่อเลือกยูนิต X-001 (house_model = HM-001, sale_date = 2025-06-15):
  ✓ แบบบ้าน: HM-001 อยู่ใน [HM-001, HM-003]
  ✓ ระยะเวลา: 2025-06-15 อยู่ในช่วง 2025-01-01 ~ 2025-12-31
  ✓ ยูนิต: ไม่จำกัด (ว่าง)
  → แสดงรายการ "แอร์ Daikin Inverter" ใน Panel 3A

เมื่อเลือกยูนิต Y-002 (house_model = HM-005, sale_date = 2025-06-15):
  ✗ แบบบ้าน: HM-005 ไม่อยู่ใน [HM-001, HM-003]
  → ไม่แสดงรายการ "แอร์ Daikin Inverter"
```

### Premium Conversion

Premium items can convert to discount — **เฉพาะของแถมงบยูนิต (Panel 3A) เท่านั้น**

กฎ:
- เฉพาะรายการที่ `is_unit_standard = true` AND `category = 'premium'` เท่านั้นที่แสดง checkbox "แปลงเป็นส่วนลด"
- รายการของแถมเพิ่มเติม (Panel 3B, `is_unit_standard = false`) **ไม่สามารถแปลงเป็นส่วนลดได้**

Example: Air conditioner value = 40,000 (is_unit_standard = true)

- Case A: Customer receives air conditioner → `effective_category = premium`
- Case B: Customer converts to discount → `effective_category = discount`

> **Rule:** All calculations use `effective_category`, NOT `promotion_category`

---

## Budget Sources

| Source                | Description                          |
|-----------------------|--------------------------------------|
| `UNIT_STANDARD`       | Standard budget allocated per unit   |
| `PROJECT_POOL`        | Central project-level budget pool    |
| `MANAGEMENT_SPECIAL`  | Special budget from management       |
| `CAMPAIGN_SUPPORT`    | Campaign-specific support budget     |

### Budget Pool

Each project has a central promotion budget pool.

Purpose:
- collect unused budgets
- redistribute budgets to other units

### Budget Movement Ledger

All budget changes must be recorded in movement ledger.

Movement types:
- `POOL_INIT` — สร้างอัตโนมัติเมื่อสร้างโครงการ (unit_id = NULL)
- `ALLOCATE`, `USE`, `RETURN`, `ADJUST`
- `SPECIAL_BUDGET_ADD`, `SPECIAL_BUDGET_ALLOCATE`, `SPECIAL_BUDGET_USE`, `SPECIAL_BUDGET_RETURN`
- `SPECIAL_BUDGET_TRANSFER_OUT`, `SPECIAL_BUDGET_TRANSFER_IN` — โอนงบพิเศษระหว่าง unit (เป็นคู่เสมอ)

Movement statuses:
- `pending` — รออนุมัติ (เมื่อ approval_required = true)
- `approved` — อนุมัติแล้ว (นับใน balance)
- `rejected` — ปฏิเสธ (ไม่นับใน balance)
- `voided` — ยกเลิก (ตั้งผิด/คีย์ผิด, ใช้ได้เฉพาะเมื่อ used=0, ไม่นับใน balance)

*** balance ต้อง derive จาก SUM(movements WHERE status='approved') เท่านั้น ***

### Inline Budget Allocation (ตั้งงบผูกยูนิต)

พนักงานขายสามารถตั้งงบเพิ่มเติมผูกกับยูนิตที่กำลังบันทึกขายได้จากหน้า Sales Entry

กฎ:
- `UNIT_STANDARD` → ตั้งเองไม่ได้ ค่ามาจาก `project_units.standard_budget`
- `PROJECT_POOL`, `MANAGEMENT_SPECIAL`, `CAMPAIGN_SUPPORT` → ตั้งเองได้ผ่าน Inline Allocation
- ทุกครั้งที่ตั้งงบ → สร้าง `budget_movements` (ALLOCATE หรือ SPECIAL_BUDGET_ALLOCATE) + บันทึกใน `unit_budget_allocations`
- ต้องตั้งงบก่อนจึงจะใช้งบแหล่งนั้นในรายการของแถมได้

> **รายละเอียดเพิ่มเติม:** ดู `docs/12-sales-entry-panels.md`

### Duplicate Prevention (ห้ามรายการซ้ำ)

รายการโปรโมชั่น/ของแถม 1 รายการ (`promotion_item_master.id`) สามารถเลือกได้เพียงครั้งเดียวต่อ 1 Sales Transaction ไม่ว่าจะอยู่ใน Panel ใด

### Budget Flow Example

```
Unit A budget = 50,000
Used = 20,000
Remaining = 30,000

Step 1: USE movement → deduct 20,000
Step 2: RETURN to pool → return 30,000
Step 3: ALLOCATE to another unit → from pool
```

**Critical rules:**
1. Balance must always derive from `SUM(budget_movements WHERE status='approved')` — never update directly.
2. Budget source must be tracked separately from promotion category.
3. `SPECIAL_BUDGET_RETURN` ไม่เพิ่ม `PROJECT_POOL` — งบผู้บริหาร/แคมเปญเป็นงบจากภายนอก คืนแล้ว "หายไป" จากระบบ ลดเฉพาะ allocation ของยูนิต ต่างจาก `RETURN` ของ `UNIT_STANDARD`/`PROJECT_POOL` ที่คืนเข้า pool
4. `SPECIAL_BUDGET_TRANSFER_OUT` + `SPECIAL_BUDGET_TRANSFER_IN` ใช้โอนงบพิเศษระหว่าง unit ภายในโครงการเดียวกัน — สร้างเป็นคู่ใน 1 transaction, งบรวมไม่เปลี่ยน, ไม่ผ่าน pool
5. `getPoolBalance()` ต้อง derive จาก movements เท่านั้น: SUM(POOL_INIT + ADJUST + RETURN) - SUM(ALLOCATE) WHERE status='approved' — ห้ามอ่าน `pool_budget_amount` จาก projects table โดยตรง
6. `budgetUnitRemain = standard_budget - totalPanelAUsed - totalUnitBudgetReturned` — ต้องหักจำนวนที่คืนเข้า Pool ด้วย

### การโอนงบพิเศษ (Transfer Special Budget)

กรณีงบพิเศษที่ตั้งให้ unit หนึ่งใช้ไม่หมด ต้องการนำส่วนเหลือไปให้ unit อื่น:
- กดปุ่ม "โอนงบ" → เลือก unit ปลายทาง → ระบุจำนวน → ระบุหมายเหตุ
- สร้าง 2 movements ใน 1 transaction: TRANSFER_OUT (ลด) + TRANSFER_IN (เพิ่ม)
- โอนได้เฉพาะงบ MANAGEMENT_SPECIAL และ CAMPAIGN_SUPPORT
- โอนได้เฉพาะภายในโครงการเดียวกัน
- จำนวนต้องไม่เกิน remaining ของ unit ต้นทาง
- ไม่ผ่าน approval flow → status = 'approved' ทันที
- งบรวมของระบบไม่เปลี่ยน (OUT + IN = 0)
- สิทธิ์: admin, manager เท่านั้น

### การคืนงบยูนิตเข้า Pool (Unit Budget Return)

กรณีงบยูนิต (UNIT_STANDARD) ใช้ไม่หมด ต้องการนำส่วนเหลือคืนเข้า Pool เพื่อจัดสรรให้ยูนิตอื่น:

กฎ:
- **คืนงบได้เฉพาะยูนิตที่สถานะ = `transferred` (โอนกรรมสิทธิ์แล้ว) เท่านั้น**
- ยูนิตที่ยังไม่โอน (sold, reserved) → ดูงบเหลือได้ แต่คืนงบไม่ได้
- สร้าง movement type `RETURN`, budget_source = `UNIT_STANDARD`, unit_id = ยูนิตต้นทาง
- amount = จำนวนที่คืน (ค่าบวก = เพิ่มเข้า Pool)
- จำนวนต้องไม่เกิน **budgetUnitRemain** ของยูนิตต้นทาง ณ ขณะนั้น
- status = `approved` ทันที (ไม่ผ่าน approval flow)
- `getPoolBalance()` ต้องรวม RETURN ใน SUM ด้วย (เพิ่มยอด pool)
- `budgetUnitRemain` ต้องหักจำนวนที่คืนด้วย:
  `budgetUnitRemain = standard_budget - totalPanelAUsed - totalUnitBudgetReturned`
- หลังคืนแล้ว admin สามารถ ALLOCATE จาก Pool ไปยูนิตอื่นได้ตามปกติ
- สิทธิ์: admin, manager เท่านั้น
- รองรับทั้งโอนทีละยูนิต และเลือกหลายยูนิตโอนพร้อมกัน (Batch)
- UI: **หน้า Budget Management แยก** (/budget/unit-return-pool) — ไม่ได้อยู่ในหน้า Sales Entry
- รายละเอียดหน้าจอ: ดู `docs/14-unit-budget-return.md`

### งบพิเศษที่ใช้ไปแล้วบางส่วน (อัปเดต)

- ส่วนที่เหลือ (remaining) สามารถ:
  1. ปล่อยไว้ — ไม่ต้องทำอะไร
  2. โอนให้ unit อื่น — กดปุ่ม "โอนงบ"
- ไม่มีปุ่ม "คืนงบ" — เพราะงบพิเศษเป็นงบจากภายนอก คืนแล้วก็ไม่ไปไหน

### การยกเลิกขาย (Cancel Sale)

กรณีต้องการยกเลิกรายการขายที่บันทึกแล้ว:

กฎ:
- เปลี่ยน `sale_transactions.status` = `cancelled`
- Void ทุก budget movements ที่เกี่ยวข้องกับ transaction นี้ (USE, SPECIAL_BUDGET_USE)
  → ตั้ง `status = 'voided'` → งบคืนกลับไปยังแหล่งเดิมอัตโนมัติ (ไม่นับใน balance)
- เปลี่ยนสถานะยูนิตกลับเป็น `available`
- สิทธิ์: **ทุกคนที่เข้าถึงรายการขายได้** (admin, manager, salesperson)
- **ไม่ต้อง approval** — ยกเลิกได้ทันที
- ต้องกรอก **เหตุผล** (required) ก่อนยกเลิก
- ปุ่มอยู่ทั้งหน้า Transaction List และ Transaction Detail
- **ห้ามยกเลิก** ถ้ายูนิตสถานะ = `transferred` (โอนกรรมสิทธิ์แล้ว)
- รายละเอียดหน้าจอ: ดู `docs/15-cancel-sale.md`

### การเปลี่ยนสถานะเป็นโอนแล้ว (Mark as Transferred)

กรณีโอนกรรมสิทธิ์เสร็จแล้ว ต้องเปลี่ยนสถานะยูนิตเป็น `transferred`:

กฎ:
- เงื่อนไข: สถานะยูนิตต้องเป็น `sold` เท่านั้น (reserved กดไม่ได้)
- ต้องกรอก **วันที่โอน** (`transfer_date`) — required
- เปลี่ยน `project_units.status` = `transferred`
- บันทึก `transfer_date`, `transferred_by`, `transferred_at` ใน sale_transactions
- สิทธิ์: **ทุกคนที่เข้าถึงรายการขายได้** (admin, manager, salesperson)
- **ไม่ต้อง approval** — เปลี่ยนได้ทันที
- ปุ่มอยู่หน้า Transaction Detail
- หลังโอนแล้ว: **ห้ามยกเลิกขาย** + **คืนงบเข้า Pool ได้**
- รายละเอียดหน้าจอ: ดู `docs/15-cancel-sale.md`

---

## Bottom Line (ราคาต้นทุน)

- **ราคา Bottom Line** → ราคาต้นทุนจริงของยูนิต → ใช้เป็น `unit_cost` ในสูตรคำนวณกำไร
- **ราคาประเมินจากกรมที่ดิน** (`appraisal_price`) → ใช้คำนวณค่าใช้จ่ายโอนกรรมสิทธิ์ (ค่าธรรมเนียมโอน, ภาษี)
- Import จากไฟล์ Excel เท่านั้น → ต้อง backup table ยูนิตก่อน import เสมอ
- ทุกครั้งที่ import จะสร้าง snapshot table ใหม่ เก็บข้อมูลดิบจาก Excel ไว้ตลอด

---

## Approval System

- Configured per project via `approval_required` flag (boolean)
- `approval_required = true`: budget movements require approval before use
- `approval_required = false`: budget movements are auto-approved immediately (status = 'approved')
- The `approval_required` flag can be changed at any time but does **not** affect existing approved movements

---

## Use Cases

| Case | Scenario                                    | Category          |
|------|---------------------------------------------|-------------------|
| 1    | Customer takes aircon                       | premium           |
| 2    | Customer converts aircon to discount        | discount (convert) |
| 3    | Transfer fee (calculated, value_mode)       | expense_support   |
| 4    | Unused discount returned to pool            | RETURN movement   |
| 5    | Mortgage reg fee (calculated, manual_input) | expense_support   |
| 6    | Transfer fee with govt incentive (policy)   | expense_support   |
