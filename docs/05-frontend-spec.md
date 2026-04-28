# Frontend Specification

## Technology Stack

Framework: Angular 21 (standalone components)
UI Library: Angular Material 21 (`@angular/material`)
CSS Framework: Tailwind CSS 3
Icons: SvgIconComponent — `<app-icon name="...">` (Heroicons inline SVG)

Do NOT use PrimeNG. Do NOT use `pi pi-*` classes.

---

## Application Flow (ขั้นตอนการเข้าใช้งาน)

```
Login → [สร้าง Admin (ถ้ายังไม่มี user)] → Select Project → Dashboard
         ├── Master Data → Projects → House Models → Units → Phase
         ├── Bottom Line → Import / ประวัติ Import / ตั้งค่า Mapping
         ├── Promotion Items → Unit Promotion Setup
         ├── Fee Formulas → สูตรคำนวณ / มาตรการ-นโยบาย / ทดสอบสูตร
         ├── Sales Entry
         ├── Budget Management → Budget Transfer / Budget Movements / Special Budget
         ├── Reports
         ├── User Management (admin only)
         └── Settings → เลขที่เอกสาร (Number Series)
```

> **สำคัญ:** ต้องเลือกโครงการก่อนถึงจะใช้งานเมนูอื่นได้ ทุกฟีเจอร์จะทำงานแยกเป็นโครงการ

Master Data Setup → Projects → House Models → Units → Promotion Setup → Sales Entry

---

## Screens

### Login Page
Full-page login (no sidebar/topbar).
- Centered card with company logo
- เมื่อเปิดหน้า Login เรียก `GET /api/auth/check-setup`:
  - ถ้ายังไม่มี user → แสดงปุ่ม **"สร้าง Admin"** (`mat-flat-button color="accent"`) ใต้ login form
  - ถ้ามี user แล้ว → แสดง login form ปกติ
- ปุ่ม "สร้าง Admin" → เปิด dialog:
  - ชื่อ, Email, Password, ยืนยัน Password
  - เรียก `POST /api/auth/setup` → สร้างสำเร็จ → snackbar + กลับมาหน้า login
- Email + password fields (`mat-form-field` + `matInput`)
- Password show/hide toggle
- Login button: `mat-flat-button color="primary"` full-width
- Error via `MatSnackBarModule`
- Loading state: `MatProgressSpinnerModule`
- Login สำเร็จ → navigate to `/select-project`

### Project Selection Page (หน้าเลือกโครงการ)
แสดงหลัง login สำเร็จ — ต้องเลือกโครงการก่อนใช้งานระบบ
- Full-page layout (no sidebar)
- Header: ชื่อผู้ใช้ + ปุ่ม Logout
- แสดงเฉพาะโครงการที่ user มีสิทธิ์ (`admin` เห็นทุกโครงการ)
- Grid cards (responsive: 3 cols desktop, 2 tablet, 1 mobile)
- แต่ละ card:
  - ชื่อ + รหัสโครงการ
  - ประเภท + สถานะ (status chips)
  - ระดับสิทธิ์: badge `ดูอย่างเดียว` (สีเทา) / `แก้ไขได้` (สีเขียว)
  - จำนวนยูนิต
- คลิกเลือก → เก็บ `selectedProjectId` + `access_level` ใน `ProjectService` → navigate to Dashboard
- ถ้ามีสิทธิ์เข้าโครงการเดียว → auto-select ข้ามไป Dashboard
- สามารถเปลี่ยนโครงการได้ตลอดจาก sidebar header

### Dashboard (Sales-Focused)
สรุปยอดขายและ stock ของโครงการ แบ่งเป็น 4 sections:

1. **Header** — ชื่อ "Dashboard" + Phase dropdown (filter เฉพาะ phase, default = "All")
2. **Row 1 (50/50):**
   - ซ้าย "ยอดขายตั้งแต่เริ่มต้นถึงปัจจุบัน" — จำนวนยูนิตที่ขาย, มูลค่าขายสุทธิ, ราคาเฉลี่ยต่อยูนิต
   - ขวา "Stock ที่เหลือ" — จำนวนยูนิตเหลือ, มูลค่าสุทธิเหลือ, ราคาเฉลี่ยต่อยูนิต
3. **Row 2 (50/50):**
   - ซ้าย "ส่วนลดต่อยูนิตที่เหลือ" — input field + ปุ่มคำนวณ/Reset
   - ขวา "มูลค่าประมาณการ" — มูลค่าหลังหักส่วนลด, ราคาเฉลี่ย, % ส่วนลด
4. **Row 3 (full-width):**
   - "สรุปการขาย ทั้งโครงการ" — 2 คอลัมน์: ข้อมูลยอดขายทั้งโครงการ (ซ้าย) + เปรียบเทียบกับมูลค่าอนุมัติ (ขวา, ค่าลบแสดงสีแดง)

API: `GET /api/dashboard`, `POST /api/dashboard/calculate-discount`
Styling: ตัวเลขชิดขวา tabular-nums, label ชิดซ้าย, ทศนิยม 2 ตำแหน่ง (ยกเว้นจำนวนยูนิต), tooltip icon สำหรับ field ที่ต้องอธิบาย

### Phase Management (จัดการเฟสโครงการ)
จัดการ Phase ของโครงการ (เช่น Phase 1, Phase 2) สำหรับแบ่งกลุ่มยูนิต
- URL: `/phases` — อยู่ภายใต้เมนู "ข้อมูลหลัก"
- สิทธิ์: admin, manager
- List view: `mat-table` คอลัมน์ ลำดับ, ชื่อ Phase, จำนวนยูนิต, Actions (แก้ไข/ลบ)
- ปุ่มลบ disabled ถ้ามียูนิตอ้างอิง (unit_count > 0)
- Create/Edit: `MatDialogModule` — ชื่อ Phase (required, unique ในโครงการ), ลำดับ
- API: CRUD `/api/phases`

### User Management (admin only)
Manage system users and project assignments. Admin เท่านั้นที่สามารถสร้าง/แก้ไข user ได้
- List view: `mat-table` with columns: Name, Email, Role, Projects, Status, Last Login
- Create/Edit: `MatDialogModule` with form
- Role selector: `mat-select`
- Project assignment: multi-select chips (`MatChipsModule`) + `access_level` selector per project (`mat-select`: ดูอย่างเดียว / แก้ไขได้)
- Active toggle: `mat-slide-toggle`
- Reset password action

### Project Management
Manage real estate projects.
- List view: `mat-table` with sort, filter, and pagination
- Create/Edit: `MatDialogModule` with form fields for code, name, type, location, approval toggle, pool budget
- Detail view: project info card + summary cards (Total Units, Budget Allocated, Budget Used, Budget Remaining)
- Status chips (`MatChipsModule`): active = green, inactive = grey, completed = blue

### House Model Management
Manage house model templates per project. แบบบ้านเก็บเฉพาะ specs (ห้อง, พื้นที่) ไม่เก็บราคา/ต้นทุน/งบ
- List view: `mat-table` with columns for code, name, bedrooms, bathrooms, area, units count
- Filter by project (`mat-select`)
- Create/Edit: `MatDialogModule` with form fields for physical specs, image URL (ไม่มีราคาเริ่มต้น, ต้นทุน, งบ)
- Detail view: model card with image, unit summary, quick action to create unit from model

### Unit Management
Manage property units within projects.
- List view: `mat-table` with columns for unit code, floor, building, type, price, cost, budget, status
- Filter bar: project selector, status filter, search input
- Create/Edit: `MatDialogModule` with form fields, optional house model selector to pre-fill physical specs (ห้อง, พื้นที่) แต่ราคา/ต้นทุน/งบต้องกรอกเอง
- Unit Type: เฉพาะ `project_type = mixed` → `mat-select` เลือกจาก unit_types | อื่นๆ → แสดง read-only ตาม project_type
- Budget summary (derived from movements) shown in unit detail
- Bulk CSV import support
- Status chips (`MatChipsModule`): available = blue, reserved = amber, sold = green, transferred = grey

### Bottom Line Import (ราคาต้นทุน)
Import ราคาต้นทุนจาก Excel — ใช้ `MatStepperModule` 4 steps:
- Step 1: Upload Excel + เลือก project
- Step 2: Column Mapping (load preset หรือตั้งค่าใหม่, preview 5 แถวแรก, save as preset)
- Step 3: Review (`mat-table` แสดงทุกแถว, status chips: matched/unmatched/unchanged, summary cards)
- Step 4: ผลลัพธ์ (import key, สรุปจำนวน records)

### Bottom Line History (ประวัติ Import)
ดูประวัติ import ทั้งหมด
- `mat-table` with columns: Import Key, โครงการ, ชื่อไฟล์, Records, Match/Unmatched, ผู้ Import, วันที่, สถานะ
- Filter: project selector, date range (`MatDatepickerModule`)
- Status chips: completed = green, failed = red, rolled_back = amber
- Actions: ดูรายละเอียด, Rollback (admin only, with confirmation dialog)

### Mapping Presets (ตั้งค่า Column Mapping)
จัดการ preset สำหรับ column mapping
- `mat-table` + Create/Edit via `MatDialogModule`
- ตั้ง/ยกเลิก default ได้ per project

### Promotion Item Master
Manage promotion items.
- List view: `mat-table` with sort and filter
  - คอลัมน์: Code, Name, Category, Value Mode, Max Value, Sort Order, Eligibility (สรุปเงื่อนไข), Status
  - คอลัมน์ Eligibility แสดง chips สรุป: "ทุกแบบบ้าน" / "3 แบบบ้าน", "ไม่จำกัดเวลา" / "01/01/68 - 31/12/68", "ทุกยูนิต" / "5 ยูนิต"
- Create/Edit: `MatDialogModule` with form fields
  - Form: `mat-form-field` + `matInput` + `mat-select`
  - **รหัส (code) สร้างอัตโนมัติ** — ไม่มีช่องกรอก, แสดง read-only หลังสร้าง
  - `value_mode` selector: fixed / actual / manual / calculated
  - ถ้าเลือก `calculated` → แสดงลิงก์ไปหน้า Fee Formulas เพื่อสร้างสูตร
  - **Eligibility Conditions Section** (ส่วนเงื่อนไขการใช้งาน):
    - **แบบบ้านที่ใช้ได้**: `mat-radio-group` → "ทุกแบบบ้าน" (default) / "ระบุแบบบ้าน"
      - ถ้าเลือก "ระบุแบบบ้าน" → แสดง `mat-select multiple` + `MatChipsModule` เลือกจาก house_models ในโครงการ
    - **ระยะเวลา**: `mat-radio-group` → "ไม่จำกัดระยะเวลา" (default) / "จำกัดระยะเวลา"
      - ถ้าเลือก "จำกัดระยะเวลา" → แสดง 2 ช่อง `MatDatepickerModule`:
        - วันเริ่มต้น (optional) — ไม่บังคับกรอก
        - วันสิ้นสุด (optional) — ไม่บังคับกรอก
        - อย่างน้อยต้องกรอก 1 วัน (validate)
    - **ยูนิตที่ใช้ได้**: `mat-radio-group` → "ทุกยูนิต" (default) / "ระบุยูนิต"
      - ถ้าเลือก "ระบุยูนิต" → แสดง `mat-select multiple` + `MatChipsModule` เลือกจาก project_units ในโครงการ (แสดง unit_code)
    - **อันดับการเรียง**: `mat-input` (number, default: 0) — ยิ่งน้อยยิ่งแสดงก่อน

### Unit Promotion Setup
Configure promotions per unit.
- List view: `mat-table`
- Inline editing or dialog: `MatDialogModule`

### Fee Formula Management (สูตรคำนวณค่าธรรมเนียม)
จัดการสูตรคำนวณสำหรับของแถมที่ `value_mode = 'calculated'`

> **รายละเอียดเพิ่มเติม:** ดู `docs/13-fee-formula-management.md`

**3 หน้าย่อย:**

1. **สูตรคำนวณ** (`/fee-formulas`):
   - CRUD `fee_formulas` ผูกกับ `promotion_item_master`
   - Dialog สร้าง/แก้ไขพร้อม formula preview
   - auto-update `value_mode` เมื่อสร้าง/ลบสูตร

2. **มาตรการ/นโยบาย** (`/fee-formulas/policies`):
   - CRUD `fee_rate_policies` — override อัตราคำนวณ
   - Conditions builder (UI-based, ไม่ต้องเขียน JSON)
   - สถานะ: Active / Upcoming / Expired / Inactive
   - Preview เปรียบเทียบค่าเก่า vs ค่าใหม่

3. **ทดสอบสูตร** (`/fee-formulas/tester`):
   - เลือกยูนิตจริงหรือกรอกค่าสมมติ
   - แสดงผลคำนวณพร้อมรายละเอียดทุกขั้นตอน (policy ไหนตรง/ไม่ตรง เพราะอะไร)
   - ตารางเปรียบเทียบ: ค่าปกติ vs ค่าหลังนโยบาย
   - Batch test ทุกยูนิตในโครงการ + export Excel

### Sales Entry
Record promotion usage — the most important screen in the system.
- Two-column desktop layout
- Left: unit info form (`mat-form-field`), promotion panels (`mat-card` or `mat-expansion-panel`)
- Right: budget summary panel, live calculation panel (SummaryCardComponent)
- Real-time calculation via Angular signals

> **รายละเอียดเพิ่มเติม:** ดู `docs/12-sales-entry-panels.md`

**Screen Panels:**

Section 1 — Unit Information:
Project, Unit Code (`mat-autocomplete` — พิมพ์ค้นหาได้ทั้ง unit_code และ house_model_name), Base Price, Unit Cost, Customer, Salesperson, Sale Date

Section 2 — Available Budget:
Unit Standard Budget, Project Pool Budget, Management Special Budget, Total Budget Available

Section 3A — รายการโปรโมชั่น Premium (งบยูนิต):
ดึงรายการของแถมที่ `funding_source_type = 'UNIT_STANDARD'`
คอลัมน์: Promotion Item, Category, Max Value, Used Value, Convert To Discount, Funding Source (locked = งบยูนิต), Remark

Section 3B — รายการของแถมเพิ่มเติม (งบอื่น):
ดึงรายการของแถมที่ `funding_source_type IN ('PROJECT_POOL', 'MANAGEMENT_SPECIAL', 'CAMPAIGN_SUPPORT')`
คอลัมน์: Promotion Item, Category, Max Value, Used Value, Convert To Discount, Funding Source (เลือกได้), Remark

Section 4 — Summary (real-time update, รวมยอดจาก 3A + 3B):
Total Discount, Total Promotion Cost, Total Expense Support, Net Price, Total Cost, Profit, Budget Used, Budget Remaining

### Budget Transfer
Transfer budget between units.
- Form with source/destination selectors (`mat-select`)
- Confirmation dialog (`MatDialogModule`)

### Budget Movement History
View ledger entries.
- `mat-table` with `MatSortModule` + `MatPaginatorModule`
- Date range filter (`MatDatepickerModule`)

### Special Budget Management
Manage management-level budgets.
- List + approval workflow
- Status chips (`MatChipsModule`) for approval states

### Number Series (เลขที่เอกสาร)
ตั้งค่ารูปแบบเลขที่เอกสารอัตโนมัติ ภายใต้เมนู Settings

> **รายละเอียดเพิ่มเติม:** ดู `docs/16-number-series.md`

- URL: `/settings/number-series`
- สิทธิ์: `admin`, `manager` เท่านั้น
- List view: `mat-table` แสดง series ทั้งหมดของโครงการ (ไม่มีปุ่มสร้าง/ลบ — สร้างอัตโนมัติเมื่อสร้างโครงการ)
- Edit dialog: `MatDialog` กำหนด prefix, year format (พ.ศ./ค.ศ.), running digits, reset cycle
- Real-time preview: แสดงตัวอย่างเลขที่ 3 ลำดับ + ตัวอย่างหลัง reset
- Document types: SALE, BUDGET_MOVE, BOTTOM_LINE, UNIT_ALLOC

---

## Component Standards

- Use Angular 21 standalone components
- Use Angular 21 control flow: `@if`, `@for`, `@switch`
- Use `track item` in `@for` (not `track $index`)
- Inputs/forms: `ReactiveFormsModule` with `FormBuilder`
- HTTP: `HttpClient` via `provideHttpClient(withInterceptors([authInterceptor]))`
- State: Angular signals (`signal`, `computed`, `effect`)

## Authentication Standards

- JWT access token stored in `localStorage`
- Refresh token via `httpOnly` cookie
- `AuthInterceptor`: auto-attach Bearer token, handle 401 → refresh → retry
- `AuthGuard`: protect all routes except `/login` and `/select-project`
- `ProjectGuard`: ตรวจว่าเลือกโครงการแล้ว — redirect to `/select-project` ถ้ายัง
- `RoleGuard`: restrict routes by `data.roles` config
- `AccessLevelGuard`: ตรวจ `access_level` ของโครงการที่เลือก — `view` จะถูก block จากหน้าที่ต้องการ `edit`
- `AuthService`: signals-based state (`currentUser`, `isAuthenticated`)
- `ProjectService`: signals-based state (`selectedProject`, `accessLevel`, `canEdit`)
- Sidebar menu items filtered by user role, permissions, and access level
- ปุ่ม create/edit/delete ซ่อนเมื่อ `access_level = view`

## Language Convention

- UI labels, placeholders, tooltips → ภาษาไทย (e.g., `"ราคาขาย"`, `"งบประมาณคงเหลือ"`)
- Error & validation messages → ภาษาไทย (e.g., `"กรุณากรอกรหัสโครงการ"`)
- Component names, variables, functions → English (e.g., `SalesEntryComponent`, `calculateProfit()`)
- API paths & JSON keys → English (e.g., `/api/units`, `"base_price"`)
