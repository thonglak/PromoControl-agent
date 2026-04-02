# Test Scenarios & Expected Results

## ข้อมูลพื้นฐาน (Shared Setup)

```
base_price  = 3,000,000
unit_cost   = 2,500,000
```

---

## Case 1: Discount ปกติ

**Scenario:** ลูกค้าได้รับส่วนลดเงินสด 50,000 บาท

**Input:**
```
promotion_category  = discount
effective_category  = discount
used_value          = 50,000
budget_source       = unit_budget
```

**Expected Result:**
```
total_discount        = 50,000
total_promo_cost      = 0
total_expense_support = 0

net_price   = 3,000,000 - 50,000     = 2,950,000
total_cost  = 2,500,000 + 0 + 0      = 2,500,000
profit      = 2,950,000 - 2,500,000  = 450,000
```

**Budget Movement:**
```
type: USE
amount: 50,000
source: unit_budget
balance_after = allocated - 50,000
```

---

## Case 2: Premium ปกติ

**Scenario:** ลูกค้าเลือกรับแอร์มูลค่า 40,000 บาท

**Input:**
```
promotion_category  = premium
effective_category  = premium
used_value          = 40,000
budget_source       = unit_budget
```

**Expected Result:**
```
total_discount        = 0
total_promo_cost      = 40,000
total_expense_support = 0

net_price   = 3,000,000 - 0          = 3,000,000
total_cost  = 2,500,000 + 40,000 + 0 = 2,540,000
profit      = 3,000,000 - 2,540,000  = 460,000
```

**Budget Movement:**
```
type: USE
amount: 40,000
source: unit_budget
```

---

## Case 3: Expense Support ใช้จริงบางส่วน

**Scenario:** อนุมัติค่าโอน 30,000 บาท แต่ใช้จริง 22,000 บาท คืนส่วนที่เหลือ

**Input:**
```
promotion_category  = expense_support
effective_category  = expense_support
approved_value      = 30,000
used_value          = 22,000
budget_source       = unit_budget
```

**Expected Result:**
```
total_discount        = 0
total_promo_cost      = 0
total_expense_support = 22,000   ← ใช้เฉพาะที่ใช้จริง

net_price   = 3,000,000 - 0           = 3,000,000
total_cost  = 2,500,000 + 0 + 22,000  = 2,522,000
profit      = 3,000,000 - 2,522,000   = 478,000
```

**Budget Movements:**
```
Movement 1 — type: RESERVE,  amount: 30,000
Movement 2 — type: USE,      amount: 22,000
Movement 3 — type: RETURN,   amount:  8,000  (30,000 - 22,000)
```

---

## Case 4: Premium Convert เป็น Discount

**Scenario:** ลูกค้าเปลี่ยนใจไม่รับแอร์ ขอส่วนลดแทน 40,000 บาท

**Input:**
```
promotion_category  = premium          ← category ต้นทาง
effective_category  = discount         ← category ที่ใช้คำนวณ
used_value          = 40,000
budget_source       = unit_budget
```

**Expected Result:**
```
total_discount        = 40,000   ← นับเป็น discount เพราะ effective_category = discount
total_promo_cost      = 0
total_expense_support = 0

net_price   = 3,000,000 - 40,000     = 2,960,000
total_cost  = 2,500,000 + 0 + 0      = 2,500,000
profit      = 2,960,000 - 2,500,000  = 460,000
```

> **Rule:** คำนวณจาก `effective_category` ไม่ใช่ `promotion_category`

---

## Case 5: คืนงบจาก Unit A ไป Pool

**Scenario:** Unit A มีงบ 100,000 ใช้ไป 20,000 คืนส่วนที่เหลือ 80,000 กลับ pool

**Pre-condition:**
```
unit_A.allocated  = 100,000
unit_A.used       =  20,000
unit_A.remaining  =  80,000
pool.balance      = 200,000
```

**Budget Movement:**
```
Movement 1 — type: RETURN
             from: unit_A
             to:   pool
             amount: 80,000
```

**Expected Result:**
```
unit_A.remaining  = 80,000 - 80,000  =       0
pool.balance      = 200,000 + 80,000 = 280,000
```

**Validation:**
- ห้ามคืนเกิน remaining ของ unit_A
- balance ต้องได้มาจาก sum(movements) ไม่ใช่ update โดยตรง

---

## Case 6: จัดสรรจาก Pool ไป Unit B

**Scenario:** จัดสรรงบ 50,000 จาก pool ให้ Unit B

**Pre-condition:**
```
pool.balance      = 280,000   (ต่อจาก Case 5)
unit_B.allocated  = 0
```

**Budget Movement:**
```
type: ALLOCATE
from: pool
to:   unit_B
amount: 50,000
```

**Expected Result:**
```
pool.balance      = 280,000 - 50,000 = 230,000
unit_B.allocated  = 0 + 50,000       =  50,000
unit_B.remaining  = 50,000
```

**Validation:**
- ห้าม ALLOCATE เกิน pool.balance
- ต้องมี approval ถ้าเกิน threshold ที่กำหนด

---

## Case 7: ใช้งบผู้บริหารเป็น Discount

**Scenario:** ผู้บริหารอนุมัติส่วนลดพิเศษ 100,000 บาท จาก special_budget

**Input:**
```
promotion_category  = discount
effective_category  = discount
used_value          = 100,000
budget_source       = special_budget   ← ต่างจาก unit_budget
```

**Expected Result:**
```
total_discount        = 100,000
total_promo_cost      = 0
total_expense_support = 0

net_price   = 3,000,000 - 100,000    = 2,900,000
total_cost  = 2,500,000 + 0 + 0      = 2,500,000
profit      = 2,900,000 - 2,500,000  = 400,000
```

**Budget Movement:**
```
type:   USE
source: special_budget        ← deduct จาก special_budget_approvals
amount: 100,000
```

> **Rule:** budget_source ต้องแยกเป็น `special_budget` — ไม่ตัดจาก unit_budget

---

## Case 8: ใช้งบผู้บริหารเป็น Premium

**Scenario:** ผู้บริหารอนุมัติของสมนาคุณ (premium) มูลค่า 60,000 บาท จาก special_budget

**Input:**
```
promotion_category  = premium
effective_category  = premium
used_value          = 60,000
budget_source       = special_budget
```

**Expected Result:**
```
total_discount        = 0
total_promo_cost      = 60,000
total_expense_support = 0

net_price   = 3,000,000 - 0          = 3,000,000
total_cost  = 2,500,000 + 60,000 + 0 = 2,560,000
profit      = 3,000,000 - 2,560,000  = 440,000
```

**Budget Movement:**
```
type:   USE
source: special_budget
amount: 60,000
```

---

## Case 9: คืนงบผู้บริหารที่ใช้ไม่หมด

**Scenario:** อนุมัติ special_budget 100,000 บาท แต่ใช้จริง 60,000 คืนส่วนที่เหลือ

**Pre-condition:**
```
special_approval.approved_amount = 100,000
special_approval.used_amount     =  60,000
```

**Budget Movements:**
```
Movement 1 — type: APPROVE,  amount: 100,000  source: special_budget
Movement 2 — type: USE,      amount:  60,000  source: special_budget
Movement 3 — type: RETURN,   amount:  40,000  source: special_budget
                                               (100,000 - 60,000)
```

**Expected Result:**
```
special_approval.remaining = 100,000 - 60,000 = 40,000
special_approval.status    = PARTIALLY_USED
pool ที่รับคืน             += 40,000  (ถ้า policy คืนกลับ pool)
```

**Validation:**
- ห้ามคืนเกิน approved_amount
- ห้ามคืนส่วนที่ USE ไปแล้ว
- balance ต้อง derive จาก movements เสมอ — ห้าม update โดยตรง

---

## Summary Matrix

| Case | Category (promotion) | Effective Category | Budget Source | approval_required | กระทบ net_price | กระทบ total_cost |
|------|----------------------|--------------------|---------------|-------------------|-----------------|-----------------|
| 1 | discount | discount | unit | true | ลด 50,000 | ไม่เปลี่ยน |
| 2 | premium | premium | unit | true | ไม่เปลี่ยน | บวก 40,000 |
| 3 | expense_support | expense_support | unit | true | ไม่เปลี่ยน | บวก 22,000 |
| 4 | premium | **discount** | unit | true | ลด 40,000 | ไม่เปลี่ยน |
| 5 | — (RETURN) | — | unit→pool | — | — | — |
| 6 | — (ALLOCATE) | — | pool→unit | — | — | — |
| 7 | discount | discount | **special** | true | ลด 100,000 | ไม่เปลี่ยน |
| 8 | premium | premium | **special** | true | ไม่เปลี่ยน | บวก 60,000 |
| 9 | — (RETURN special) | — | special→pool | — | — | — |
| 10 | discount | discount | unit | **false** | ลด 50,000 | ไม่เปลี่ยน |
| 11 | premium | premium | unit | **true** (เปิดกลับ) | ไม่เปลี่ยน (pending) | — |

---

---

## Case 10: ใช้งบเมื่อปิดระบบ Approve (approval_required = false)

**Scenario:** Project ปิดระบบ approve — บันทึก budget movement แล้ว approved ทันที ไม่ต้องรอ

**Pre-condition:**
```
project.approval_required = false
unit.allocated             = 200,000
unit.used                  =       0
```

**Input:**
```
promotion_category  = discount
effective_category  = discount
used_value          = 50,000
budget_source       = unit_budget
```

**Budget Movement:**
```
type:   USE
amount: 50,000
status: approved   ← set อัตโนมัติ ไม่ต้องผ่าน approval flow
```

**Expected Result:**
```
movement.status  = approved
unit.remaining   = 200,000 - 50,000 = 150,000

total_discount   = 50,000
net_price        = base_price - 50,000
profit           = net_price - total_cost
```

**Validation:**
- ไม่มี approval record ถูกสร้าง
- movement.status = 'approved' ทันทีที่บันทึก
- balance อัปเดตได้เลย ไม่ต้อง pending

---

## Case 11: เปิดระบบ Approve กลับมา (approval_required = true)

**Scenario:** Project เปิดระบบ approve — budget movement ใหม่ต้องรอ approval ก่อน

**Pre-condition:**
```
project.approval_required = true   ← เปลี่ยนจาก false → true
unit.allocated             = 150,000
unit.used                  =  50,000  (จาก Case 10)
```

**Input:**
```
promotion_category  = premium
effective_category  = premium
used_value          = 40,000
budget_source       = unit_budget
```

**Budget Movement:**
```
type:   USE
amount: 40,000
status: pending   ← ต้องรอ approval
```

**Expected Result:**
```
movement.status  = pending
unit.remaining   = 100,000   ← ยังไม่เปลี่ยน รอ approve ก่อน

หลัง approve:
movement.status  = approved
unit.remaining   = 100,000 - 40,000 = 60,000
```

**Validation:**
- movements ที่ approved ไปแล้วในช่วง approval_required=false ไม่ได้รับผลกระทบ
- เฉพาะ movements ใหม่ที่สร้างหลังเปิด approval_required=true เท่านั้นที่ต้อง pending
- balance ต้อง derive จาก movements ที่ status='approved' เท่านั้น

---

## จุดสำคัญที่ต้อง Test ให้ครอบคลุม

1. **Calculation** ใช้ `effective_category` ไม่ใช่ `promotion_category` (Case 4)
2. **Budget Source** แยก unit_budget vs special_budget ไม่ปนกัน (Case 7, 8, 9)
3. **Balance** derive จาก `sum(movements)` ที่ status='approved' เสมอ — ห้าม update โดยตรง (Case 5, 6, 9)
4. **Partial use** คืนเฉพาะส่วนที่ไม่ได้ใช้ (Case 3, 9)
5. **Overflow guard** ห้าม USE/RETURN เกิน balance ที่มี (Case 5, 6, 9)
6. **Approval toggle** approval_required ระดับ project — false = auto-approve ทันที (Case 10)
7. **Toggle ไม่ย้อนหลัง** movements ที่ approved แล้วไม่ได้รับผลกระทบเมื่อเปลี่ยน flag (Case 11)
