# Transaction Actions — ยกเลิกขาย + เปลี่ยนสถานะโอนแล้ว

> **ปุ่มทั้งหมดอยู่หน้า Transaction Detail** (ยกเลิกอยู่หน้า List ด้วย)
> **สิทธิ์:** ทุกคนที่เข้าถึงรายการขายได้ (admin, manager, salesperson)
> **Approval:** ไม่ต้อง — ทำได้ทันที

---

# ส่วนที่ 1: การยกเลิกขาย (Cancel Sale)

---

## วัตถุประสงค์

ยกเลิกรายการขายที่บันทึกแล้ว — คืนงบทั้งหมดกลับไปยังแหล่งเดิม + เปลี่ยนสถานะยูนิตกลับเป็น `available`

---

## เงื่อนไข

| เงื่อนไข | ยกเลิกได้ | หมายเหตุ |
|----------|----------|---------|
| สถานะ transaction = `active` | ✅ | ยกเลิกได้ปกติ |
| สถานะ transaction = `cancelled` | ❌ | ยกเลิกแล้ว ไม่ต้องทำซ้ำ |
| สถานะยูนิต = `transferred` | ❌ | โอนกรรมสิทธิ์แล้ว ไม่สามารถยกเลิกขายได้ |
| มี RETURN movement (คืนงบเข้า Pool แล้ว) | ❌ | ต้อง void RETURN ก่อน (หรือแจ้งให้จัดการที่หน้าคืนงบ) |

---

## ขั้นตอนการยกเลิก

### 1. กดปุ่ม "ยกเลิกขาย"

**หน้า Transaction List:**
- ปุ่ม icon (mat-icon: "cancel") ในคอลัมน์ Action ของแต่ละแถว
- แสดงเฉพาะ transaction ที่ status = `active`

**หน้า Transaction Detail:**
- ปุ่ม mat-stroked-button color="warn" ด้านบน: "ยกเลิกขาย"
- แสดงเฉพาะ transaction ที่ status = `active`

### 2. เปิด Cancel Dialog

```
┌─────────────────────────────────────────┐
│  ยกเลิกรายการขาย                         │
│                                         │
│  ยูนิต: A-001                            │
│  ลูกค้า: นายสมชาย ใจดี                     │
│  ราคาสุทธิ: 3,400,000                    │
│  วันที่ขาย: 15/03/2026                    │
│                                         │
│  ⚠️ การยกเลิกจะ:                         │
│  • คืนงบทั้งหมดกลับไปยังแหล่งเดิม            │
│  • เปลี่ยนสถานะยูนิตเป็น "ว่าง"              │
│  • ไม่สามารถย้อนกลับได้                     │
│                                         │
│  เหตุผลการยกเลิก *                        │
│  [____________________________]          │
│                                         │
│  [ยกเลิก]     [ยืนยันยกเลิกขาย] (warn)    │
└─────────────────────────────────────────┘
```

- **เหตุผล** (textarea): required, max 500 ตัวอักษร
- ปุ่ม **"ยืนยันยกเลิกขาย"**: สีแดง (warn)
- ปุ่ม **"ยกเลิก"** (cancel dialog): ปิด dialog กลับ

### 3. ระบบดำเนินการ (Backend — 1 DB Transaction)

**Step 1:** ตรวจเงื่อนไข
- transaction.status ต้องเป็น `active`
- unit.status ต้องไม่ใช่ `transferred`
- ไม่มี RETURN movement ที่อ้างอิงยูนิตนี้ (ถ้ามีต้อง void ก่อน)

**Step 2:** Void budget movements
- หา budget_movements ทั้งหมดที่ `sale_transaction_id = transaction.id` AND `status = 'approved'`
- เปลี่ยน status เป็น `voided` ทุก movement
- ผลลัพธ์: งบคืนกลับไปยังแหล่งเดิมอัตโนมัติ (เพราะ voided ไม่นับใน balance)

**Step 3:** อัปเดต transaction
- `sale_transactions.status = 'cancelled'`
- `sale_transactions.cancelled_at = NOW()`
- `sale_transactions.cancelled_by = current_user.id`
- `sale_transactions.cancel_reason = เหตุผลที่กรอก`

**Step 4:** อัปเดตสถานะยูนิต
- `project_units.status = 'available'`

### 4. แจ้งผลลัพธ์

- สำเร็จ → Snackbar "ยกเลิกรายการขายยูนิต {unit_code} สำเร็จ"
- List: refresh ตาราง (status เปลี่ยนเป็น "ยกเลิก")
- Detail: แสดง banner "รายการนี้ถูกยกเลิกแล้ว" + ข้อมูลยกเลิก
- Error → แสดง error message

---

## API Endpoint

### POST `/api/sales/{id}/cancel`

**Request:**
```json
{
  "reason": "ลูกค้ายกเลิกสัญญา"
}
```

**Response:** `200 OK`
```json
{
  "transaction_id": 123,
  "status": "cancelled",
  "cancelled_at": "2026-03-17T14:30:00",
  "cancelled_by": "admin1",
  "voided_movements": [
    { "movement_id": 456, "type": "USE", "amount": -80000 },
    { "movement_id": 457, "type": "SPECIAL_BUDGET_USE", "amount": -50000 }
  ],
  "unit_status": "available"
}
```

**Errors:**
- `400` — transaction ไม่ใช่ status active
- `400` — ยูนิตสถานะ transferred
- `400` — มี RETURN movement ที่ยังไม่ void
- `422` — reason ว่าง

---

## Schema Changes

### sale_transactions (เพิ่มคอลัมน์)

| คอลัมน์ | Type | คำอธิบาย |
|---------|------|---------|
| `status` | enum: active, cancelled | สถานะรายการ (เพิ่ม cancelled) |
| `cancelled_at` | datetime, nullable | วันที่ยกเลิก |
| `cancelled_by` | FK → users.id, nullable | ผู้ยกเลิก |
| `cancel_reason` | varchar(500), nullable | เหตุผลการยกเลิก |

### budget_movements (เพิ่มคอลัมน์)

| คอลัมน์ | Type | คำอธิบาย |
|---------|------|---------|
| `sale_transaction_id` | FK → sale_transactions.id, nullable | ผูก movement กับ transaction (สำหรับ USE/SPECIAL_BUDGET_USE ที่เกิดจากการขาย) |

> **หมายเหตุ:** movement ที่เกิดจาก ALLOCATE, SPECIAL_BUDGET_ALLOCATE, RETURN, POOL_INIT ฯลฯ ไม่มี sale_transaction_id (= NULL)

---

## UI: Transaction List

### คอลัมน์ที่เพิ่ม

| คอลัมน์ | คำอธิบาย |
|---------|---------|
| สถานะ | badge: "ปกติ" (สีเขียว) / "ยกเลิก" (สีแดง) |
| Action | ปุ่มยกเลิก (แสดงเมื่อ status=active) |

### Filter

- กรองสถานะ: ทั้งหมด / ปกติ / ยกเลิก

### แถวที่ยกเลิก

- สีจาง (opacity) + ขีดฆ่า (text-decoration: line-through) ที่ราคา
- ไม่มีปุ่ม action

---

## UI: Transaction Detail

### เมื่อ status = cancelled

- แสดง **Alert banner** ด้านบน (สีแดง):
  ```
  ⚠️ รายการนี้ถูกยกเลิกแล้ว
  เหตุผล: ลูกค้ายกเลิกสัญญา
  ยกเลิกโดย: admin1 | วันที่: 17/03/2026 14:30
  ```
- ซ่อนปุ่ม "ยกเลิกขาย" (ยกเลิกแล้ว)
- ซ่อนปุ่ม "แก้ไข" (ถ้ามี)
- ข้อมูลทั้งหมดยังแสดงอยู่ (read-only) เพื่อ audit

---

## Business Rules

1. **ยกเลิกได้**: transaction status = `active` AND unit status ≠ `transferred`
2. **ต้องกรอกเหตุผล** (cancel_reason): required, ไม่เว้นว่าง
3. **Void movements**: เฉพาะ movements ที่ `sale_transaction_id = transaction.id`
4. **ไม่ void allocations**: ALLOCATE, SPECIAL_BUDGET_ALLOCATE ที่ตั้งไว้ใน Section 2 **ไม่ถูก void** — จัดการแยก
5. **Atomic**: ทุกขั้นตอนอยู่ใน 1 DB transaction — fail ทั้งหมดหรือสำเร็จทั้งหมด
6. **Audit**: เก็บ cancelled_at, cancelled_by, cancel_reason ไว้เสมอ
7. **ห้ามยกเลิกซ้ำ**: transaction ที่ cancelled แล้วไม่แสดงปุ่มยกเลิก
8. **งบคืนอัตโนมัติ**: เมื่อ movement ถูก void → balance recalculate อัตโนมัติ (voided ไม่นับ)
9. **ยูนิตกลับ available**: หลังยกเลิก ยูนิตสามารถขายใหม่ได้
10. **RETURN conflict**: ถ้ามี RETURN movement สำหรับยูนิตนี้แล้ว → ต้อง void RETURN ก่อนจึงยกเลิกขายได้ (ป้องกันงบเกิน)

---

# ส่วนที่ 2: เปลี่ยนสถานะเป็นโอนแล้ว (Mark as Transferred)

---

## วัตถุประสงค์

เมื่อโอนกรรมสิทธิ์ยูนิตให้ลูกค้าเสร็จแล้ว → เปลี่ยนสถานะยูนิตเป็น `transferred`
ผลกระทบ: หลังโอนแล้วจะ **ห้ามยกเลิกขาย** + **คืนงบเข้า Pool ได้**

---

## เงื่อนไข

| เงื่อนไข | กดได้ | หมายเหตุ |
|----------|------|---------|
| สถานะยูนิต = `sold` | ✅ | กดเปลี่ยนเป็น transferred ได้ |
| สถานะยูนิต = `reserved` | ❌ | ต้องเป็น sold ก่อน |
| สถานะยูนิต = `transferred` | ❌ | โอนแล้ว ไม่ต้องทำซ้ำ |
| สถานะยูนิต = `available` | ❌ | ยังไม่ได้ขาย |
| สถานะ transaction = `cancelled` | ❌ | ถูกยกเลิกแล้ว |

---

## ขั้นตอน

### 1. กดปุ่ม "โอนกรรมสิทธิ์"

**หน้า Transaction Detail:**
- ปุ่ม mat-flat-button color="primary": "โอนกรรมสิทธิ์"
- แสดงเมื่อ `transaction.status = 'active'` AND `unit.status = 'sold'`

### 2. เปิด Transfer Dialog

```
┌─────────────────────────────────────────┐
│  โอนกรรมสิทธิ์                            │
│                                         │
│  ยูนิต: A-001                            │
│  ลูกค้า: นายสมชาย ใจดี                     │
│  ราคาสุทธิ: 3,400,000                    │
│                                         │
│  วันที่โอน *                              │
│  [__ / __ / ____]  (mat-datepicker)      │
│                                         │
│  [ยกเลิก]          [ยืนยันโอนกรรมสิทธิ์]   │
└─────────────────────────────────────────┘
```

- **วันที่โอน** (mat-datepicker): required, ไม่เกินวันปัจจุบัน
- ปุ่ม **"ยืนยันโอนกรรมสิทธิ์"**: สี primary
- ปุ่ม **"ยกเลิก"**: ปิด dialog กลับ

### 3. ระบบดำเนินการ (Backend)

**Step 1:** ตรวจเงื่อนไข
- transaction.status = `active`
- unit.status = `sold`

**Step 2:** อัปเดตยูนิต
- `project_units.status = 'transferred'`

**Step 3:** อัปเดต transaction
- `sale_transactions.transfer_date = วันที่โอนที่กรอก`
- `sale_transactions.transferred_by = current_user.id`
- `sale_transactions.transferred_at = NOW()`

### 4. แจ้งผลลัพธ์

- สำเร็จ → Snackbar "โอนกรรมสิทธิ์ยูนิต {unit_code} สำเร็จ"
- Detail: refresh ข้อมูล → แสดง badge "โอนแล้ว" + วันที่โอน
- Error → แสดง error message

---

## API Endpoint

### POST `/api/sales/{id}/transfer`

**Request:**
```json
{
  "transfer_date": "2026-03-15"
}
```

**Response:** `200 OK`
```json
{
  "transaction_id": 123,
  "unit_status": "transferred",
  "transfer_date": "2026-03-15",
  "transferred_by": "admin1",
  "transferred_at": "2026-03-17T14:30:00"
}
```

**Errors:**
- `400` — transaction status ≠ active
- `400` — unit status ≠ sold
- `400` — transfer_date อนาคต
- `422` — transfer_date ว่าง

---

## Schema Changes (เพิ่มเติมจากส่วนยกเลิกขาย)

### sale_transactions (เพิ่มคอลัมน์)

| คอลัมน์ | Type | คำอธิบาย |
|---------|------|---------|
| `transfer_date` | date, nullable | วันที่โอนกรรมสิทธิ์ |
| `transferred_by` | FK → users.id, nullable | ผู้บันทึกการโอน |
| `transferred_at` | datetime, nullable | วันเวลาที่บันทึกการโอน |

---

## UI: Transaction Detail — ปุ่มทั้งหมด

สรุปปุ่มที่แสดงตามสถานะ:

| สถานะ unit | สถานะ transaction | ปุ่มที่แสดง |
|------------|-------------------|-----------|
| sold | active | **"โอนกรรมสิทธิ์"** (primary) + **"ยกเลิกขาย"** (warn) |
| reserved | active | **"ยกเลิกขาย"** (warn) เท่านั้น |
| transferred | active | ไม่มีปุ่ม (แสดง badge "โอนแล้ว" + วันที่โอน) |
| — | cancelled | ไม่มีปุ่ม (แสดง banner ยกเลิก) |

### เมื่อ unit.status = transferred

- แสดง **Info banner** (สีฟ้า):
  ```
  ✅ โอนกรรมสิทธิ์แล้ว
  วันที่โอน: 15/03/2026
  บันทึกโดย: admin1 | วันที่บันทึก: 17/03/2026 14:30
  ```
- ซ่อนปุ่ม "โอนกรรมสิทธิ์" + "ยกเลิกขาย"

---

## Business Rules (เปลี่ยนสถานะโอนแล้ว)

1. **เงื่อนไข**: unit.status = `sold` AND transaction.status = `active`
2. **วันที่โอน**: required, ต้องไม่เกินวันปัจจุบัน
3. **ไม่ย้อนกลับ**: เมื่อเปลี่ยนเป็น transferred แล้ว ไม่สามารถเปลี่ยนกลับเป็น sold ได้
4. **สิทธิ์**: ทุกคนที่เข้าถึงรายการขาย
5. **ผลกระทบ**: ห้ามยกเลิกขาย + เปิดให้คืนงบเข้า Pool ได้
