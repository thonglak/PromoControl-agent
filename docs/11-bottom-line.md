# Bottom Line Management (ราคาต้นทุน)

## Purpose

จัดการราคาต้นทุน (Bottom Line) และราคาประเมินจากกรมที่ดิน โดย import จากไฟล์ Excel เข้าสู่ระบบ

- **ราคา Bottom Line** — ราคาต้นทุนจริงของยูนิต ใช้คำนวณหาราคาขายและกำไร → อัปเดต `unit_cost` ใน `project_units`
- **ราคาประเมินจากกรมที่ดิน** — ใช้คำนวณค่าใช้จ่ายโอนกรรมสิทธิ์ (ค่าธรรมเนียมโอน, ภาษี) → อัปเดต `appraisal_price` ใน `project_units`
- **งบมาตรฐาน (Standard Budget)** — งบที่จัดสรรให้ยูนิต (ไม่บังคับ) → อัปเดต `standard_budget` ใน `project_units`
- **ราคาฐาน (Base Price)** — ราคาขายยูนิต (ไม่บังคับ) → อัปเดต `base_price` ใน `project_units`

---

## Import Flow

```
1. Upload Excel
2. เลือก Column Mapping (ใช้ preset ที่บันทึกไว้ หรือตั้งค่าใหม่)
3. Review ข้อมูล (แสดงค่าเดิม vs ค่าใหม่, highlight unit ที่ match/ไม่ match)
4. ยืนยัน Import
   4.1 Backup table project_units อัตโนมัติ
   4.2 สร้าง key ใหม่ (e.g., BL-20260312-001)
   4.3 สร้าง table ใหม่ชื่อ bottom_line_{key} เก็บข้อมูลดิบจาก Excel
   4.4 Insert record ใน table bottom_lines (ประวัติ import)
   4.5 อัปเดต project_units — unit_cost, appraisal_price, standard_budget (ถ้ามี), base_price (ถ้ามี), bottom_line_key
5. แสดงผลลัพธ์ (สำเร็จ/ล้มเหลว จำนวน records)
```

---

## Data Model

### Table: `bottom_lines` (ประวัติการ import)

| Column            | Type          | Description                                |
|-------------------|---------------|--------------------------------------------|
| id                | BIGINT PK     | Auto-increment                             |
| import_key        | VARCHAR(50)   | Unique key (e.g., `BL-20260312-001`)       |
| project_id        | BIGINT FK     | References `projects.id`                   |
| file_name         | VARCHAR(255)  | ชื่อไฟล์ Excel ที่ upload                   |
| total_rows        | INT           | จำนวนแถวทั้งหมดในไฟล์                       |
| matched_rows      | INT           | จำนวนแถวที่ match กับยูนิตได้               |
| unmatched_rows    | INT           | จำนวนแถวที่ match ไม่ได้                    |
| updated_rows      | INT           | จำนวนยูนิตที่ถูกอัปเดตจริง                  |
| backup_table_name | VARCHAR(100)  | ชื่อ backup table (e.g., `project_units_backup_BL20260312001`) |
| mapping_preset_id | BIGINT FK NULL| References `bottom_line_mappings.id` (preset ที่ใช้) |
| status            | ENUM          | `completed`, `failed`, `rolled_back`       |
| imported_by       | BIGINT FK     | References `users.id`                      |
| imported_at       | DATETIME      | Timestamp ที่ import                        |
| note              | TEXT          | หมายเหตุ (optional)                         |
| created_at        | DATETIME      | Record creation timestamp                  |

### Table: `bottom_line_{key}` (สร้างใหม่ทุกครั้งที่ import)

> Dynamic table — สร้างอัตโนมัติเมื่อ import โดยใช้ชื่อ `bottom_line_{import_key}`
> ตัวอย่าง: `bottom_line_BL20260312001`

| Column              | Type          | Description                                |
|---------------------|---------------|--------------------------------------------|
| id                  | BIGINT PK     | Auto-increment                             |
| row_number          | INT           | ลำดับแถวจาก Excel                           |
| unit_code           | VARCHAR(50)   | เลขที่ยูนิตจาก Excel (e.g., `SRP-1`)       |
| bottom_line_price   | DECIMAL(15,2) | ราคา Bottom Line จาก Excel                 |
| appraisal_price     | DECIMAL(15,2) | ราคาประเมินจากกรมที่ดินจาก Excel            |
| standard_budget     | DECIMAL(15,2) NULL | งบมาตรฐานจาก Excel (เฉพาะเมื่อ mapping ระบุ) |
| base_price          | DECIMAL(15,2) NULL | ราคาฐานจาก Excel (เฉพาะเมื่อ mapping ระบุ) |
| matched_unit_id     | BIGINT NULL   | FK → `project_units.id` (NULL ถ้า match ไม่ได้) |
| old_unit_cost       | DECIMAL(15,2) NULL | ค่า unit_cost เดิมก่อน import            |
| old_appraisal       | DECIMAL(15,2) NULL | ค่า appraisal_price เดิมก่อน import     |
| old_standard_budget | DECIMAL(15,2) NULL | ค่า standard_budget เดิมก่อน import     |
| old_base_price      | DECIMAL(15,2) NULL | ค่า base_price เดิมก่อน import          |
| status              | ENUM          | `matched`, `unmatched`, `updated`, `skipped` |

### Table: `bottom_line_mappings` (บันทึกการตั้งค่า Column Mapping)

| Column            | Type          | Description                                |
|-------------------|---------------|--------------------------------------------|
| id                | BIGINT PK     | Auto-increment                             |
| project_id        | BIGINT FK     | References `projects.id`                   |
| preset_name       | VARCHAR(100)  | ชื่อ preset (e.g., `"Default SRP"`)        |
| mapping_config    | JSON          | JSON mapping configuration                 |
| is_default        | BOOLEAN       | เป็น default mapping ของ project นี้หรือไม่ |
| created_by        | BIGINT FK     | References `users.id`                      |
| created_at        | DATETIME      | Record creation timestamp                  |
| updated_at        | DATETIME      | Record update timestamp                    |

**ตัวอย่าง `mapping_config`:**

```json
{
  "unit_code_column": "A",
  "bottom_line_price_column": "B",
  "appraisal_price_column": "C",
  "standard_budget_column": "D",
  "base_price_column": "E",
  "header_row": 1,
  "data_start_row": 2,
  "sheet_name": "Sheet1"
}
```

> `standard_budget_column` และ `base_price_column` เป็น optional — ถ้าไม่ระบุจะไม่ import column เหล่านี้

### เพิ่ม Fields ใน Table: `project_units`

| Column            | Type          | Description                                |
|-------------------|---------------|--------------------------------------------|
| appraisal_price   | DECIMAL(15,2) NULL | ราคาประเมินจากกรมที่ดิน                |
| bottom_line_key   | VARCHAR(50) NULL   | FK → `bottom_lines.import_key` ถูก import ด้วย key ไหน |

---

## Business Rules

1. **ต้อง backup ก่อน import เสมอ** — สร้าง table backup ชื่อ `project_units_backup_{key}` ก่อนทำการอัปเดต
2. **สร้าง dynamic table ทุกครั้ง** — `bottom_line_{key}` เก็บข้อมูลดิบจาก Excel เป็น snapshot ไม่มีวันถูกแก้ไข
3. **Match ด้วย unit_code** — จับคู่เลขที่ยูนิตจาก Excel กับ `project_units.unit_code` ภายใน project เดียวกัน
4. **Unit ที่ match ไม่ได้** — แสดงในหน้า review เป็นสีแดง ไม่ทำการ import แถวนั้น
5. **อัปเดต fields ที่เกี่ยวข้อง:**
   - `unit_cost` ← ราคา Bottom Line
   - `appraisal_price` ← ราคาประเมินจากกรมที่ดิน
   - `standard_budget` ← งบมาตรฐาน (เฉพาะเมื่อ mapping ระบุ standard_budget_column)
   - `base_price` ← ราคาฐาน (เฉพาะเมื่อ mapping ระบุ base_price_column)
   - `bottom_line_key` ← key ของการ import ครั้งนี้
6. **Column mapping บันทึกเป็น preset** — สามารถ save/load/set default ได้ ไม่ต้องตั้งค่าใหม่ทุกรอบ
7. **Rollback** — สามารถ restore จาก backup table ได้ผ่านหน้าประวัติ import
8. **Import ซ้ำได้** — import ครั้งใหม่จะ overwrite ค่าเดิม พร้อมบันทึก key ใหม่ (ค่าเก่าอยู่ใน snapshot table เดิม)
9. **สิทธิ์** — เฉพาะ `admin` และ `manager` เท่านั้นที่สามารถ import bottom line ได้

---

## API Endpoints

| Method | Path                                          | Description                                |
|--------|-----------------------------------------------|--------------------------------------------|
| GET    | /api/bottom-lines                             | รายการประวัติ import ทั้งหมด (pagination, filter by project) |
| GET    | /api/bottom-lines/{import_key}                | รายละเอียด import ครั้งนั้น + ข้อมูลจาก dynamic table |
| POST   | /api/bottom-lines/upload                      | Upload Excel file → return parsed preview  |
| POST   | /api/bottom-lines/import                      | ยืนยัน import (backup → create table → update units) |
| POST   | /api/bottom-lines/{import_key}/rollback       | Rollback ไป backup table                   |
| GET    | /api/bottom-line-mappings                     | รายการ mapping presets (filter by project)  |
| GET    | /api/bottom-line-mappings/{id}                | รายละเอียด mapping preset                  |
| POST   | /api/bottom-line-mappings                     | สร้าง mapping preset ใหม่                   |
| PUT    | /api/bottom-line-mappings/{id}                | แก้ไข mapping preset                        |
| DELETE | /api/bottom-line-mappings/{id}                | ลบ mapping preset                           |

### POST /api/bottom-lines/upload

**Request:** `multipart/form-data`

| Field      | Type   | Description           |
|------------|--------|-----------------------|
| file       | File   | ไฟล์ Excel (.xlsx)    |
| project_id | int    | ID โครงการ             |
| mapping_id | int?   | ID ของ mapping preset (optional — ถ้าไม่ส่งจะใช้ default) |

**Response (200):**

```json
{
  "file_name": "bottom_line_2026Q1.xlsx",
  "sheets": ["Sheet1", "ราคาต้นทุน"],
  "preview_rows": [
    { "row": 2, "unit_code": "SRP-1", "bottom_line_price": 2500000, "appraisal_price": 2800000, "standard_budget": 150000, "base_price": 3200000 },
    { "row": 3, "unit_code": "SRP-2", "bottom_line_price": 2600000, "appraisal_price": 2900000, "standard_budget": 160000, "base_price": 3400000 }
  ],
  "detected_columns": {
    "A": "SRP-1, SRP-2, SRP-3...",
    "B": "2500000, 2600000...",
    "C": "2800000, 2900000..."
  },
  "mapping_used": {
    "id": 1,
    "preset_name": "Default SRP"
  }
}
```

### POST /api/bottom-lines/import

**Request:**

```json
{
  "project_id": 1,
  "file_name": "bottom_line_2026Q1.xlsx",
  "mapping": {
    "unit_code_column": "A",
    "bottom_line_price_column": "B",
    "appraisal_price_column": "C",
    "standard_budget_column": "D",
    "base_price_column": "E",
    "header_row": 1,
    "data_start_row": 2,
    "sheet_name": "Sheet1"
  },
  "save_mapping_as": "Default SRP",
  "note": "อัปเดตราคาต้นทุน Q1/2026"
}
```

**Response (200):**

```json
{
  "import_key": "BL20260312001",
  "status": "completed",
  "total_rows": 50,
  "matched_rows": 48,
  "unmatched_rows": 2,
  "updated_rows": 48,
  "backup_table": "project_units_backup_BL20260312001",
  "dynamic_table": "bottom_line_BL20260312001"
}
```

---

## UI Screens

### หน้า Import Bottom Line (Stepper)

ใช้ `MatStepperModule` แบ่งเป็น 4 steps:

**Step 1 — Upload ไฟล์**
- เลือก Project (`mat-select`)
- Upload Excel (`<input type="file">` + drag-and-drop zone)
- แสดงชื่อไฟล์และขนาด
- ปุ่ม "อัปโหลดและอ่านไฟล์" (`mat-flat-button color="primary"`)

**Step 2 — ตั้งค่า Column Mapping**
- Preset selector (`mat-select`) — โหลด mapping ที่บันทึกไว้ หรือ "ตั้งค่าใหม่"
- Sheet selector (`mat-select`) — เลือก sheet จาก Excel
- Header row selector (`mat-form-field` + `matInput` type=number)
- Data start row selector (`mat-form-field` + `matInput` type=number)
- Column mapping dropdowns:
  - เลขที่ยูนิต → เลือก column (A, B, C...) — บังคับ
  - ราคา Bottom Line → เลือก column — บังคับ
  - ราคาประเมินกรมที่ดิน → เลือก column — บังคับ
  - งบมาตรฐาน (Standard Budget) → เลือก column — ไม่บังคับ
  - ราคาฐาน (Base Price) → เลือก column — ไม่บังคับ
- Preview table: แสดง 5 แถวแรกตาม mapping ที่เลือก (`mat-table`)
- Checkbox: "บันทึก mapping นี้เป็น preset" + ช่องชื่อ preset
- Checkbox: "ตั้งเป็น default สำหรับโครงการนี้"

**Step 3 — Review ข้อมูล**
- `mat-table` แสดงข้อมูลทั้งหมดพร้อมสถานะ:
  - Columns: เลขที่ยูนิต, ราคา Bottom Line (ใหม่), ราคาประเมิน (ใหม่), งบมาตรฐาน (ใหม่, ถ้ามี), ราคาฐาน (ใหม่, ถ้ามี), Unit Cost (เดิม), Appraisal (เดิม), สถานะ
  - Status chips (`MatChipsModule`):
    - `matched` = green — พร้อม import
    - `unmatched` = red — ไม่พบยูนิตนี้ในระบบ
    - `unchanged` = grey — ค่าเดิมกับใหม่เท่ากัน
- Summary cards ด้านบน:
  - จำนวนแถวทั้งหมด
  - Match ได้ (สีเขียว)
  - Match ไม่ได้ (สีแดง)
  - จะถูกอัปเดต (สีน้ำเงิน)
- ช่องหมายเหตุ (`mat-form-field` + `matInput` textarea)
- ปุ่ม "ยืนยัน Import" (`mat-flat-button color="primary"`)
- ข้อความเตือน: "ระบบจะ backup ข้อมูลยูนิตอัตโนมัติก่อนทำการ import"

**Step 4 — ผลลัพธ์**
- แสดงสรุป: สำเร็จ/ล้มเหลว, จำนวน records, import key
- ปุ่ม "ดูประวัติ Import" / "Import ใหม่"

### หน้าประวัติ Import (Bottom Line History)

- `mat-table` with columns: Import Key, โครงการ, ชื่อไฟล์, จำนวน records, Match/Unmatched, ผู้ Import, วันที่, สถานะ, Actions
- Sortable + Paginator
- Filter: project selector, date range (`MatDatepickerModule`)
- Status chips: completed = green, failed = red, rolled_back = amber
- Actions: ดูรายละเอียด, Rollback (with confirmation dialog)

### หน้าตั้งค่า Column Mapping (Mapping Presets)

- `mat-table` with columns: ชื่อ Preset, โครงการ, Column Config, Default, Actions
- Create/Edit via `MatDialogModule`
- ตั้ง/ยกเลิก default ได้

---

## สิทธิ์การเข้าถึง (Permission)

| Feature                    | admin | manager | sales | finance | viewer |
|----------------------------|-------|---------|-------|---------|--------|
| Import Bottom Line         | ✅    | ✅      | ❌    | ❌      | ❌     |
| View Import History        | ✅    | ✅      | ❌    | ✅      | ✅     |
| Rollback Import            | ✅    | ❌      | ❌    | ❌      | ❌     |
| Manage Mapping Presets     | ✅    | ✅      | ❌    | ❌      | ❌     |
