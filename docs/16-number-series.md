# Number Series — ระบบเลขที่เอกสารอัตโนมัติ

## ภาพรวม

ระบบ Number Series จัดการเลขที่เอกสารอัตโนมัติทุกประเภทในระบบ PromoControl
ผู้ดูแลสามารถกำหนดรูปแบบ (pattern), prefix, ลำดับเลข, reset cycle ได้เอง พร้อมหน้าจัดการแบบมาตรฐาน

---

## Document Types ที่ใช้ Number Series

| Document Type | ตัวอย่างเลขที่ | ใช้ใน | Column |
|---------------|---------------|-------|--------|
| `SALE` | `SO2568-0001` | การบันทึกขาย | `sales_transactions.sale_no` |
| `BUDGET_MOVE` | `BM2568-0001` | Budget Movement | `budget_movements.movement_no` |
| `BOTTOM_LINE` | `BL2568-0001` | Bottom Line Import | `bottom_lines.import_key` |
| `UNIT_ALLOC` | `UA2568-0001` | ตั้งงบผูกยูนิต | `unit_budget_allocations` (เพิ่ม `allocation_no`) |

> **หมายเหตุ:** เพิ่ม Document Type ใหม่ได้ในอนาคตโดยสร้าง record ใน `number_series` ไม่ต้องแก้ code

---

## Database Schema

### number_series (ตั้งค่า series per project per document type)

```
number_series
├── id
├── project_id (FK → projects.id)
├── document_type (enum: SALE, BUDGET_MOVE, BOTTOM_LINE, UNIT_ALLOC)
├── prefix (VARCHAR(20) — เช่น "SO", "BM", "BL", "UA")
├── separator (VARCHAR(5), default: "" — ตัวคั่นระหว่าง prefix กับปี เช่น "-", "/", "")
├── year_format (enum: YYYY_BE, YYYY_AD, YY_BE, YY_AD, NONE)
│     YYYY_BE = ปี พ.ศ. 4 หลัก (2568)
│     YYYY_AD = ปี ค.ศ. 4 หลัก (2025)
│     YY_BE = ปี พ.ศ. 2 หลัก (68)
│     YY_AD = ปี ค.ศ. 2 หลัก (25)
│     NONE = ไม่แสดงปี
├── year_separator (VARCHAR(5), default: "-" — ตัวคั่นระหว่างปีกับเลขลำดับ)
├── running_digits (INT, default: 4 — จำนวนหลักเลขลำดับ เช่น 4 = 0001~9999)
├── reset_cycle (enum: YEARLY, MONTHLY, NEVER)
│     YEARLY = reset เลขลำดับเป็น 1 ทุกต้นปี
│     MONTHLY = reset ทุกต้นเดือน
│     NEVER = ไม่ reset ตลอดอายุโครงการ
├── next_number (INT, default: 1 — เลขลำดับถัดไป)
├── last_reset_date (DATE, nullable — วันที่ reset ล่าสุด)
├── sample_output (VARCHAR(50) — ตัวอย่างเลขที่, คำนวณอัตโนมัติเมื่อบันทึก)
├── is_active (boolean, default: true)
├── created_at
├── updated_at
└── UNIQUE(project_id, document_type) — 1 โครงการ : 1 series ต่อ document type
```

### number_series_logs (ประวัติการออกเลขที่)

```
number_series_logs
├── id
├── number_series_id (FK → number_series.id)
├── generated_number (VARCHAR(50) — เลขที่ที่ออก)
├── reference_id (INT — ID ของ record ที่ใช้เลขนี้)
├── reference_table (VARCHAR(50) — ชื่อตารางที่อ้างอิง เช่น "sales_transactions")
├── generated_by (FK → users.id)
├── generated_at (DATETIME)
└── INDEX(number_series_id, generated_number)
```

---

## รูปแบบเลขที่เอกสาร (Pattern)

### สูตรประกอบ

```
{prefix}{separator}{year}{year_separator}{running_number}
```

### ตัวอย่างรูปแบบต่างๆ

| prefix | separator | year_format | year_separator | digits | reset | ตัวอย่าง |
|--------|-----------|-------------|----------------|--------|-------|----------|
| SO | - | YYYY_BE | - | 4 | YEARLY | `SO-2568-0001` |
| SO |  | YY_AD |  | 4 | YEARLY | `SO250001` |
| BM | / | YYYY_AD | / | 5 | MONTHLY | `BM/2025/00001` |
| INV | - | YYYY_BE | | 6 | NEVER | `INV-2568000001` |
| BL |  | NONE | - | 6 | NEVER | `BL-000001` |
| SO | - | YY_BE | | 4 | YEARLY | `SO-680001` |

### Reset Cycle

| Cycle | พฤติกรรม |
|-------|----------|
| `YEARLY` | เมื่อปีเปลี่ยน (ตาม year_format — ถ้า BE ใช้ปี พ.ศ., ถ้า AD ใช้ปี ค.ศ.) → reset `next_number = 1` |
| `MONTHLY` | เมื่อเดือนเปลี่ยน → reset `next_number = 1` (ต้องเพิ่มเดือนใน pattern ด้วย) |
| `NEVER` | ไม่ reset — เลขลำดับเพิ่มขึ้นเรื่อยๆ |

> **MONTHLY pattern:** เมื่อ `reset_cycle = MONTHLY` ระบบจะเพิ่มเดือน (2 หลัก) ต่อท้ายปีอัตโนมัติ
> เช่น `SO-256803-0001` (มีนาคม 2568) → `SO-256804-0001` (เมษายน 2568 reset ใหม่)

---

## ลำดับการออกเลข (Generation Logic)

```
function generateNumber(projectId, documentType, currentDate):
  1. ดึง number_series WHERE project_id AND document_type AND is_active
  2. ถ้าไม่พบ → ใช้ default pattern (document_type + running number)

  3. ตรวจ reset:
     if reset_cycle == YEARLY:
       currentYear = getYear(currentDate, year_format)  // BE or AD
       lastYear = getYear(last_reset_date, year_format)
       if currentYear != lastYear:
         next_number = 1
         last_reset_date = currentDate

     if reset_cycle == MONTHLY:
       currentMonth = getYearMonth(currentDate)
       lastMonth = getYearMonth(last_reset_date)
       if currentMonth != lastMonth:
         next_number = 1
         last_reset_date = currentDate

  4. ประกอบเลขที่:
     yearPart = formatYear(currentDate, year_format)   // เช่น "2568"
     monthPart = reset_cycle == MONTHLY ? formatMonth(currentDate) : ""  // เช่น "03"
     runningPart = padStart(next_number, running_digits, '0')  // เช่น "0001"

     result = prefix + separator + yearPart + monthPart + year_separator + runningPart

  5. อัปเดต:
     next_number += 1
     บันทึก number_series_logs

  6. return result

⚠️ CRITICAL: ขั้นตอน 1-5 ต้องทำใน database transaction + row lock
   เพื่อป้องกัน race condition (2 คนบันทึกขายพร้อมกัน → เลขซ้ำ)
```

### Concurrency Protection

```sql
-- ใช้ SELECT ... FOR UPDATE เพื่อ lock row
BEGIN TRANSACTION;

SELECT next_number, last_reset_date
FROM number_series
WHERE project_id = ? AND document_type = ?
FOR UPDATE;

-- ... logic ตรวจ reset, ประกอบเลข ...

UPDATE number_series
SET next_number = next_number + 1,
    last_reset_date = ?
WHERE id = ?;

INSERT INTO number_series_logs (...) VALUES (...);

COMMIT;
```

---

## Default Series (ค่าเริ่มต้นเมื่อสร้างโครงการ)

เมื่อสร้างโครงการใหม่ ระบบจะสร้าง Number Series ให้อัตโนมัติ 4 รายการ:

| Document Type | prefix | year_format | running_digits | reset_cycle |
|---------------|--------|-------------|----------------|-------------|
| `SALE` | SO | YYYY_BE | 4 | YEARLY |
| `BUDGET_MOVE` | BM | YYYY_BE | 4 | YEARLY |
| `BOTTOM_LINE` | BL | YYYY_BE | 4 | YEARLY |
| `UNIT_ALLOC` | UA | YYYY_BE | 4 | YEARLY |

ผู้ดูแลแก้ไข pattern ได้ทีหลังจากหน้าจัดการ

---

## หน้าจัดการ Number Series

### URL: `/settings/number-series`

### อยู่ภายใต้เมนู Settings

```
Settings
├── ...
└── เลขที่เอกสาร (Number Series)  → /settings/number-series
```

**สิทธิ์:** `admin`, `manager` เท่านั้น

### List View

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  เลขที่เอกสาร — โครงการ SBP                                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  mat-table:                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ ประเภทเอกสาร     │ รูปแบบ          │ ตัวอย่าง         │ ลำดับถัดไป │ Reset   │ สถานะ  │  │
│  │──────────────────│────────────────│─────────────────│───────────│────────│───────│  │
│  │ บันทึกขาย (SALE)  │ SO-{ปีพ.ศ.}-{#}│ SO-2568-0042    │ 42        │ รายปี  │ Active │  │
│  │ เคลื่อนไหวงบ      │ BM-{ปีพ.ศ.}-{#}│ BM-2568-0128    │ 128       │ รายปี  │ Active │  │
│  │ นำเข้าราคาต้นทุน   │ BL-{ปีพ.ศ.}-{#}│ BL-2568-0003    │ 3         │ รายปี  │ Active │  │
│  │ ตั้งงบผูกยูนิต     │ UA-{ปีพ.ศ.}-{#}│ UA-2568-0015    │ 15        │ รายปี  │ Active │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
│  💡 เลขที่เอกสารแต่ละโครงการตั้งค่าแยกอิสระ                                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**คอลัมน์:**

| คอลัมน์ | ข้อมูล |
|---------|--------|
| ประเภทเอกสาร | ชื่อภาษาไทย + document_type code |
| รูปแบบ | แสดง pattern เช่น `SO-{ปีพ.ศ.}-{####}` |
| ตัวอย่าง | `sample_output` — เลขที่ถัดไปที่จะออก |
| ลำดับถัดไป | `next_number` |
| Reset | reset_cycle (รายปี / รายเดือน / ไม่ reset) |
| สถานะ | Active / Inactive |
| Actions | แก้ไข |

> **หมายเหตุ:** ไม่มีปุ่มสร้าง/ลบ — series ถูกสร้างอัตโนมัติเมื่อสร้างโครงการ แก้ไขได้อย่างเดียว

### Edit Dialog

```
┌──────────────────────────────────────────────────────────────────┐
│  ตั้งค่าเลขที่เอกสาร — บันทึกขาย (SALE)                    [✕]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ── รูปแบบเลขที่ ──                                               │
│                                                                  │
│  Prefix *                                                        │
│  [matInput: SO      ]                                            │
│                                                                  │
│  ตัวคั่น (หลัง prefix)                                            │
│  [mat-button-toggle: "" | "-" | "/" ]                             │
│                                                                  │
│  รูปแบบปี *                                                       │
│  [mat-select ▾]                                                  │
│    ○ พ.ศ. 4 หลัก (2568)                                         │
│    ○ ค.ศ. 4 หลัก (2025)                                         │
│    ○ พ.ศ. 2 หลัก (68)                                           │
│    ○ ค.ศ. 2 หลัก (25)                                           │
│    ○ ไม่แสดงปี                                                    │
│                                                                  │
│  ตัวคั่น (หลังปี)                                                  │
│  [mat-button-toggle: "" | "-" | "/" ]                             │
│                                                                  │
│  จำนวนหลักเลขลำดับ *                                              │
│  [mat-select: 4 ▾]  → 3 / 4 / 5 / 6                             │
│                                                                  │
│  Reset เลขลำดับ *                                                 │
│  [mat-select ▾]                                                  │
│    ○ รายปี — reset เป็น 1 ทุกต้นปี                                │
│    ○ รายเดือน — reset เป็น 1 ทุกต้นเดือน                          │
│    ○ ไม่ reset — เลขเพิ่มตลอด                                    │
│                                                                  │
│  ── Preview (แสดงตัวอย่าง real-time) ──                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐      │
│  │                                                        │      │
│  │  รูปแบบ:  SO-{ปีพ.ศ.4หลัก}-{เลข4หลัก}                 │      │
│  │                                                        │      │
│  │  ตัวอย่าง:                                              │      │
│  │    เลขถัดไป  :  SO-2568-0042                            │      │
│  │    เลขถัดไป+1:  SO-2568-0043                            │      │
│  │    เลขถัดไป+2:  SO-2568-0044                            │      │
│  │    ─────────────────────                                │      │
│  │    ปีหน้า (reset): SO-2569-0001                         │      │
│  │                                                        │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                  │
│  ── ตั้งค่าเพิ่มเติม ──                                           │
│                                                                  │
│  ปรับเลขลำดับถัดไป                                                │
│  [matInput: 42    ]                                              │
│  ⚠️ ระวัง: การปรับเลขอาจทำให้เลขซ้ำได้                           │
│  → แสดง warning ถ้าตั้งค่าน้อยกว่าเลขที่ออกไปแล้ว                   │
│                                                                  │
│  เปิดใช้งาน: [mat-slide-toggle: ON]                               │
│                                                                  │
│                              [ยกเลิก]  [บันทึก]                  │
└──────────────────────────────────────────────────────────────────┘
```

### Preview Logic

Preview คำนวณจากค่าที่กรอกใน form แบบ real-time ไม่ต้องกด "คำนวณ":

```typescript
// คำนวณ preview จากค่าใน form
previewNumbers = computed(() => {
  const f = this.form.value;
  const currentDate = new Date();
  const results: string[] = [];

  for (let i = 0; i < 3; i++) {
    results.push(formatNumber(f, f.next_number + i, currentDate));
  }

  // แสดงตัวอย่างหลัง reset (ถ้ามี)
  if (f.reset_cycle !== 'NEVER') {
    const resetDate = getNextResetDate(currentDate, f.reset_cycle);
    results.push(formatNumber(f, 1, resetDate));
  }

  return results;
});

function formatNumber(config, number, date): string {
  const yearPart = formatYear(date, config.year_format);
  const monthPart = config.reset_cycle === 'MONTHLY'
    ? String(date.getMonth() + 1).padStart(2, '0')
    : '';
  const runningPart = String(number).padStart(config.running_digits, '0');

  return config.prefix
    + config.separator
    + yearPart
    + monthPart
    + config.year_separator
    + runningPart;
}

function formatYear(date, format): string {
  const ad = date.getFullYear();
  const be = ad + 543;
  switch (format) {
    case 'YYYY_BE': return String(be);
    case 'YYYY_AD': return String(ad);
    case 'YY_BE': return String(be).slice(-2);
    case 'YY_AD': return String(ad).slice(-2);
    case 'NONE': return '';
  }
}
```

---

## Validation Rules

### Edit Series

| ฟิลด์ | กฎ |
|-------|-----|
| prefix | required; 1-10 chars; alphanumeric only |
| separator | optional; max 2 chars; allowed: `-`, `/`, `.`, `` |
| year_format | required; enum |
| year_separator | optional; max 2 chars |
| running_digits | required; 3-6 |
| reset_cycle | required; enum |
| next_number | required; ≥ 1 |

### ปรับ next_number

- ถ้ากำหนดน้อยกว่าเลขที่ออกไปแล้ว → แสดง warning (ไม่ block แต่เตือน)
- ถ้ากำหนดมากกว่า max ที่ running_digits รองรับ (เช่น > 9999 สำหรับ 4 หลัก) → error
- บันทึก log เมื่อปรับ next_number (เพื่อ audit trail)

### เปลี่ยน Pattern ขณะมีเลขที่ใช้แล้ว

- **อนุญาต** — แต่แสดง confirmation dialog
- "การเปลี่ยนรูปแบบจะมีผลกับเลขที่ออกใหม่เท่านั้น เลขที่ออกไปแล้ว X รายการจะไม่เปลี่ยน"
- บันทึก log การเปลี่ยน pattern

---

## Integration กับระบบอื่น

### Sales Entry

```typescript
// เมื่อบันทึกขาย
async function saveSalesTransaction(data) {
  const saleNo = await this.numberSeriesService.generate(
    data.project_id,
    'SALE'
  );

  const transaction = {
    sale_no: saleNo,   // เช่น "SO-2568-0042"
    ...data
  };

  return this.http.post('/api/sales-transactions', transaction);
}
```

### Budget Movements

```typescript
// เมื่อสร้าง movement
async function createBudgetMovement(data) {
  const movementNo = await this.numberSeriesService.generate(
    data.project_id,
    'BUDGET_MOVE'
  );

  return { movement_no: movementNo, ...data };
}
```

### Bottom Line Import

```typescript
// เมื่อ import
async function importBottomLine(projectId, file) {
  const importKey = await this.numberSeriesService.generate(
    projectId,
    'BOTTOM_LINE'
  );

  return { import_key: importKey, ...data };
}
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/number-series` | รายการ series ทั้งหมดของโครงการที่เลือก |
| `GET` | `/api/number-series/:id` | รายละเอียด series |
| `PUT` | `/api/number-series/:id` | แก้ไข series (pattern, next_number) |
| `POST` | `/api/number-series/preview` | Preview เลขที่จาก pattern ที่กำหนด |
| `GET` | `/api/number-series/:id/logs` | ประวัติการออกเลขที่ |
| `POST` | `/api/number-series/generate` | ออกเลขที่ใหม่ (internal — เรียกจาก service อื่น) |

### Preview Request/Response

```json
// POST /api/number-series/preview
// Request
{
  "prefix": "SO",
  "separator": "-",
  "year_format": "YYYY_BE",
  "year_separator": "-",
  "running_digits": 4,
  "reset_cycle": "YEARLY",
  "next_number": 42,
  "reference_date": "2025-06-15"
}

// Response
{
  "pattern_display": "SO-{ปีพ.ศ.4หลัก}-{เลข4หลัก}",
  "samples": [
    { "label": "เลขถัดไป", "number": "SO-2568-0042" },
    { "label": "เลขถัดไป+1", "number": "SO-2568-0043" },
    { "label": "เลขถัดไป+2", "number": "SO-2568-0044" }
  ],
  "reset_sample": {
    "label": "หลัง reset (ปีถัดไป)",
    "number": "SO-2569-0001"
  }
}
```

---

## Angular Component Structure

```
NumberSeriesModule (under SettingsModule)
├── NumberSeriesListComponent       (/settings/number-series)
│   └── mat-table
├── NumberSeriesEditDialogComponent (MatDialog — edit)
│   ├── PatternFormComponent        (form fields)
│   └── PatternPreviewComponent     (real-time preview)
└── NumberSeriesService             (API calls + generate helper)
```

---

## Document Type Labels (ภาษาไทย)

| document_type | ภาษาไทย | ภาษาอังกฤษ |
|---------------|---------|-----------|
| `SALE` | บันทึกขาย | Sales Transaction |
| `BUDGET_MOVE` | เคลื่อนไหวงบประมาณ | Budget Movement |
| `BOTTOM_LINE` | นำเข้าราคาต้นทุน | Bottom Line Import |
| `UNIT_ALLOC` | ตั้งงบผูกยูนิต | Unit Budget Allocation |

---

## Business Rules

1. **1 โครงการ : 1 series ต่อ document type** — ทุกโครงการมี series แยกอิสระ
2. **สร้างอัตโนมัติ** — เมื่อสร้างโครงการใหม่ ระบบสร้าง default series 4 รายการให้ทันที
3. **เลขไม่ซ้ำ** — ใช้ database transaction + row lock ป้องกัน race condition
4. **ห้ามลบ series** — แก้ไขได้ ปิดใช้งานได้ แต่ลบไม่ได้ (เพื่อ integrity)
5. **ห้ามแก้ไขเลขที่ที่ออกไปแล้ว** — เลขที่ถูก generate แล้วเป็น immutable
6. **Reset อัตโนมัติ** — ระบบตรวจ reset cycle ทุกครั้งที่ generate เลขใหม่ ไม่มี scheduled job
7. **Log ทุกครั้ง** — ทุกเลขที่ออก + ทุกการเปลี่ยน config จะถูก log เพื่อ audit
8. **Year format สม่ำเสมอ** — ถ้าเลือก YYYY_BE ทั้ง reset check และแสดงปีจะใช้ พ.ศ. เหมือนกัน
9. **Fallback** — ถ้า series ถูกปิด (inactive) หรือไม่พบ → ใช้ pattern default `{TYPE}{YYYYMMDD}{####}`
