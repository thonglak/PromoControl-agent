# Master Data — Projects, House Models, Units

---

# 1. Project Management (โครงการ)

## Purpose

Manage real estate projects. A project is the top-level entity that groups units, budgets, and promotions together.

Every unit belongs to exactly one project. Budget pools and approval settings are configured at the project level.

## Data Model — Table: `projects`

| Column              | Type         | Description                              |
|---------------------|--------------|------------------------------------------|
| id                  | BIGINT PK    | Auto-increment                           |
| code                | VARCHAR(50)  | Unique project code (e.g., `PJ-001`)     |
| name                | VARCHAR(255) | Project name (Thai/English)              |
| description         | TEXT         | Optional project description             |
| company_name        | VARCHAR(255) | Developer / company name                 |
| location            | VARCHAR(500) | Project location / address               |
| project_type        | ENUM         | `condo`, `house`, `townhouse`, `mixed`   |
| approval_required   | BOOLEAN      | Budget approval toggle (see 02-business-rules) |
| pool_budget_amount  | DECIMAL(15,2)| Initial project pool budget              |
| status              | ENUM         | `active`, `inactive`, `completed`        |
| start_date          | DATE         | Project launch date                      |
| end_date            | DATE NULL    | Project end date (nullable)              |
| created_at          | DATETIME     | Record creation timestamp                |
| updated_at          | DATETIME     | Record update timestamp                  |

## Business Rules

1. `code` must be unique across the system.
2. `approval_required` controls whether budget movements for this project require approval.
3. Deleting a project is only allowed if it has **no units** and **no budget movements**.
4. Changing `approval_required` does **not** affect already-approved movements.
5. `pool_budget_amount` is the initial allocation — actual balance must always derive from `SUM(budget_movements)`.
6. `project_type` determines which house models are available for the project.

## API Endpoints

| Method | Path                | Description                |
|--------|---------------------|----------------------------|
| GET    | /api/projects       | List all projects (with pagination, search, filter by status) |
| GET    | /api/projects/{id}  | Get project detail         |
| POST   | /api/projects       | Create new project         |
| PUT    | /api/projects/{id}  | Update project             |
| DELETE | /api/projects/{id}  | Delete project (soft-delete, only if no units) |

### Query Parameters (GET /api/projects)

| Param    | Type   | Description                     |
|----------|--------|---------------------------------|
| search   | string | Search by code or name          |
| status   | string | Filter: `active`, `inactive`, `completed` |
| page     | int    | Page number (default: 1)        |
| per_page | int    | Items per page (default: 20)    |

### Request Body (POST / PUT)

```json
{
  "code": "PJ-001",
  "name": "The Garden Residence",
  "description": "Luxury condo project",
  "company_name": "ABC Development",
  "location": "Bangkok, Sukhumvit 39",
  "project_type": "condo",
  "approval_required": true,
  "pool_budget_amount": 5000000,
  "status": "active",
  "start_date": "2026-01-01",
  "end_date": null
}
```

## UI Screen

### List View
- `mat-table` with columns: Code, Name, Type, Status, Pool Budget, Units Count, Actions
- Sortable columns via `MatSortModule`
- Paginator via `MatPaginatorModule`
- Search input above table (`mat-form-field` + `matInput`)
- Status filter (`mat-select`)
- Status displayed as colored chips (`MatChipsModule`): active = green, inactive = grey, completed = blue

### Create / Edit Form (Dialog)
- Open via `MatDialogModule`
- Fields: Code (required, unique), Name (required), Description, Company Name, Location, Project Type (`mat-select`), Approval Required (`mat-slide-toggle`), Pool Budget Amount, Status (`mat-select`), Start Date (`mat-datepicker`), End Date (optional)
- Validation: code unique check via API on blur

### Detail View
- Project info card
- Summary cards: Total Units, Total Budget Allocated, Budget Used, Budget Remaining
- Quick links to: Unit list (filtered by project), Budget Movements (filtered by project)

---

# 2. House Model Management (แบบบ้าน)

## Purpose

Manage house model templates per project. A house model defines a standard design type (e.g., "Type A - 3 Bedroom") with base specifications.

Units reference a house model for physical specs (bedrooms, area, etc.) only. **ราคาขาย ต้นทุน และงบมาตรฐาน ต้องกรอกที่ยูนิตเท่านั้น** เพราะยูนิตแบบเดียวกันอาจมีราคาต่างกันได้

## Data Model — Table: `house_models`

| Column              | Type          | Description                              |
|---------------------|---------------|------------------------------------------|
| id                  | BIGINT PK     | Auto-increment                           |
| project_id          | BIGINT FK     | References `projects.id`                 |
| code                | VARCHAR(50)   | Model code (e.g., `TYPE-A`, `VILLA-DX`)  |
| name                | VARCHAR(255)  | Model name (e.g., `บ้านเดี่ยว Type A`)    |
| description         | TEXT          | Model description and features           |
| bedrooms            | INT           | Number of bedrooms                       |
| bathrooms           | INT           | Number of bathrooms                      |
| floors              | INT           | Number of floors (stories)               |
| area_sqm            | DECIMAL(10,2) | Usable area in square meters             |
| land_area_sqw       | DECIMAL(10,2) | Land area in square wah (for houses)     |
| image_url           | VARCHAR(500)  | Model image / floor plan URL             |
| status              | ENUM          | `active`, `inactive`                     |
| total_units         | INT           | Total planned units of this model        |
| created_at          | DATETIME      | Record creation timestamp                |
| updated_at          | DATETIME      | Record update timestamp                  |

UNIQUE(project_id, code)

## Business Rules

1. `code` must be unique within the same project.
2. A house model belongs to exactly one project.
3. **ราคาขาย ต้นทุน และงบมาตรฐาน ไม่อยู่ในแบบบ้าน** — ต้องกรอกที่ยูนิตเท่านั้น เพราะยูนิตแบบเดียวกันอาจมีราคาต่างกันได้
4. Deleting a house model is only allowed if **no units** reference it.
5. `land_area_sqw` is relevant for house/townhouse projects — nullable for condos.

## API Endpoints

| Method | Path                                  | Description                |
|--------|---------------------------------------|----------------------------|
| GET    | /api/house-models                     | List all house models      |
| GET    | /api/house-models/{id}                | Get house model detail     |
| POST   | /api/house-models                     | Create new house model     |
| PUT    | /api/house-models/{id}                | Update house model         |
| DELETE | /api/house-models/{id}                | Delete (only if no units)  |
| GET    | /api/projects/{id}/house-models       | List by project            |

### Query Parameters (GET /api/house-models)

| Param      | Type   | Description                     |
|------------|--------|---------------------------------|
| project_id | int    | Filter by project               |
| search     | string | Search by code or name          |
| status     | string | Filter: `active`, `inactive`    |
| page       | int    | Page number (default: 1)        |
| per_page   | int    | Items per page (default: 20)    |

### Request Body (POST / PUT)

```json
{
  "project_id": 1,
  "code": "TYPE-A",
  "name": "บ้านเดี่ยว Type A",
  "description": "3 bedrooms, 2 bathrooms, 2-story detached house with garden",
  "bedrooms": 3,
  "bathrooms": 2,
  "floors": 2,
  "area_sqm": 150.0,
  "land_area_sqw": 50.0,
  "image_url": "/uploads/models/type-a.jpg",
  "status": "active",
  "total_units": 20
}
```

### Response (GET /api/house-models/{id})

```json
{
  "id": 2,
  "code": "TYPE-A",
  "name": "บ้านเดี่ยว Type A",
  "bedrooms": 3,
  "bathrooms": 2,
  "floors": 2,
  "area_sqm": 150.0,
  "land_area_sqw": 50.0,
  "status": "active",
  "units_count": 15,
  "units_available": 8,
  "units_sold": 7,
  "project": { "id": 1, "code": "PJ-001", "name": "The Garden Residence" }
}
```

## UI Screen

### List View
- `mat-table` with columns: Code, Name, Bedrooms, Bathrooms, Floors, Area, Land, Units (available/total), Status, Actions
- Filter bar: Project selector, Status filter, Search input
- Status chips (`MatChipsModule`): active = green, inactive = grey

### Create / Edit Form (Dialog)
- Fields: Project (required, disabled on edit), Code (required), Name (required), Description, Bedrooms, Bathrooms, Floors, Area sqm, Land Area sqw (optional), Image URL, Total Units, Status
- **ไม่มี** ราคาขายเริ่มต้น, ต้นทุนเริ่มต้น, งบมาตรฐาน — ข้อมูลเหล่านี้กรอกที่ยูนิตเท่านั้น

### Detail View
- Model info card with image preview
- Summary cards: Total Units, Available, Reserved, Sold
- List of units using this model
- Quick action: "Create Unit from Model" — pre-fills unit form with physical specs จากแบบบ้าน (bedrooms, area, etc.) แต่ราคาต้องกรอกเองที่ยูนิต

---

# 3. Unit Types (ประเภทยูนิต)

## Purpose

กำหนดประเภทยูนิต — **เฉพาะโครงการที่ `project_type = 'mixed'` เท่านั้น** ที่ต้องกำหนดและเลือกประเภทยูนิต

**กฎสำคัญ:**
- `project_type = mixed` → Admin กำหนดประเภทยูนิตเองได้ (เช่น "บ้านเดี่ยว", "คอนโด", "ทาวน์โฮม") → ตอนสร้างยูนิตต้องเลือกจาก dropdown
- `project_type = condo / house / townhouse` → **ไม่ต้องเลือก** ประเภทยูนิตยึดตาม project_type อัตโนมัติ (unit_type_id = null, ใช้ project_type แทน)

## Data Model — Table: `unit_types`

| Column      | Type          | Description                              |
|-------------|---------------|------------------------------------------|
| id          | BIGINT PK     | Auto-increment                           |
| project_id  | BIGINT FK     | References `projects.id`                 |
| name        | VARCHAR(100)  | ชื่อประเภท (เช่น "บ้านเดี่ยว", "Penthouse") |
| sort_order  | INT           | ลำดับการแสดงผล (ยิ่งน้อยยิ่งแสดงก่อน, default: 0) |
| is_active   | BOOLEAN       | เปิด/ปิดใช้งาน (default: true)           |
| created_at  | DATETIME      | Record creation timestamp                |
| updated_at  | DATETIME      | Record update timestamp                  |

UNIQUE(project_id, name)

## Business Rules

1. **ใช้เฉพาะโครงการ `mixed` เท่านั้น** — โครงการ condo/house/townhouse ไม่ต้องตั้งค่า unit_types
2. ชื่อ (`name`) ห้ามซ้ำภายในโครงการเดียวกัน
3. ลบได้เฉพาะเมื่อ **ไม่มียูนิตอ้างอิง** (`unit_type_id`)
4. ปิดใช้งาน (`is_active = false`) → ไม่แสดงใน dropdown สร้างยูนิตใหม่ แต่ยูนิตเดิมที่ใช้อยู่ไม่กระทบ
5. ถ้าโครงการไม่ใช่ mixed → `unit_type_id` ของยูนิตเป็น null → UI แสดงประเภทจาก `project.project_type` แทน

## API Endpoints

| Method | Path                          | Description                    |
|--------|-------------------------------|--------------------------------|
| GET    | /api/unit-types?project_id=   | รายการประเภทยูนิตของโครงการ     |
| POST   | /api/unit-types               | สร้างประเภทใหม่                |
| PUT    | /api/unit-types/{id}          | แก้ไขชื่อ/ลำดับ                |
| DELETE | /api/unit-types/{id}          | ลบ (เฉพาะไม่มียูนิตอ้างอิง)    |

### Request Body (POST / PUT)

```json
{
  "project_id": 1,
  "name": "คอนโด 1 ห้องนอน",
  "sort_order": 1,
  "is_active": true
}
```

## UI

- **แสดงเฉพาะเมื่อโครงการเป็น `mixed`** — โครงการอื่นไม่แสดงปุ่มจัดการประเภทยูนิต
- จัดการผ่าน **inline table** ในหน้า Unit Management (ไม่ต้องแยกหน้า)
- ปุ่ม "จัดการประเภทยูนิต" เปิด dialog:
  - `mat-table` แสดงรายการ + inline edit
  - เพิ่ม/แก้ไข/ลบ/เรียงลำดับ
- สิทธิ์: admin, manager เท่านั้น

---

# 4. Unit Management (ยูนิต)

## Purpose

Manage individual property units within a project. Each unit has a base price, unit cost, allocated budget, and can be linked to a house model.

Units are the core entity for sales transactions and promotion usage.

## Data Model — Table: `project_units`

| Column              | Type          | Description                              |
|---------------------|---------------|------------------------------------------|
| id                  | BIGINT PK     | Auto-increment                           |
| project_id          | BIGINT FK     | References `projects.id`                 |
| house_model_id      | BIGINT FK NULL| References `house_models.id` (nullable)  |
| unit_code           | VARCHAR(50)   | Unique unit code within project          |
| unit_number         | VARCHAR(50)   | Display unit number / room number        |
| floor               | VARCHAR(20)   | Floor number or lot info                 |
| building            | VARCHAR(100)  | Building name (multi-building projects)  |
| base_price          | DECIMAL(15,2) | Selling price                            |
| unit_cost           | DECIMAL(15,2) | Company cost (อัปเดตจาก Bottom Line import) |
| appraisal_price     | DECIMAL(15,2) NULL | ราคาประเมินจากกรมที่ดิน (อัปเดตจาก Bottom Line import) |
| bottom_line_key     | VARCHAR(50) NULL   | FK → `bottom_lines.import_key` — ถูก import ด้วย key ไหน |
| area_sqm            | DECIMAL(10,2) | Unit area in square meters               |
| unit_type_id        | BIGINT FK NULL| References `unit_types.id` — ประเภทยูนิต (เลือกจาก master ของโครงการ) |
| standard_budget     | DECIMAL(15,2) | Standard promotion budget for this unit  |
| status              | ENUM          | `available`, `reserved`, `sold`, `transferred` |
| customer_name       | VARCHAR(255)  | Customer name (filled after reservation) |
| salesperson         | VARCHAR(255)  | Assigned salesperson                     |
| sale_date           | DATE NULL     | Date of sale                             |
| transfer_date       | DATE NULL     | Date of ownership transfer               |
| remark              | TEXT          | Notes                                    |
| created_at          | DATETIME      | Record creation timestamp                |
| updated_at          | DATETIME      | Record update timestamp                  |

UNIQUE(project_id, unit_code)

## Business Rules

1. `unit_code` must be unique within the same project.
2. `base_price` and `unit_cost` are required — they are used in profit calculation.
3. `standard_budget` is the initial budget — actual remaining must derive from `SUM(budget_movements)`.
4. When `standard_budget` is set or updated, a corresponding `ALLOCATE` movement must be created in `budget_movements`.
5. Deleting a unit is only allowed if it has **no sales transactions** and **no budget movements**.
6. `house_model_id` is optional — condos may not have a house model.
7. Status transitions: `available` → `reserved` → `sold` → `transferred`. Backward transitions require manager approval.

## API Endpoints

| Method | Path                           | Description                |
|--------|--------------------------------|----------------------------|
| GET    | /api/units                     | List all units             |
| GET    | /api/units/{id}                | Get unit detail + budget   |
| POST   | /api/units                     | Create new unit            |
| PUT    | /api/units/{id}                | Update unit                |
| DELETE | /api/units/{id}                | Delete (only if no txns)   |
| GET    | /api/projects/{id}/units       | List units by project      |

### Query Parameters (GET /api/units)

| Param      | Type   | Description                         |
|------------|--------|-------------------------------------|
| project_id | int    | Filter by project                   |
| search     | string | Search by unit_code or unit_number  |
| status     | string | Filter: `available`, `reserved`, `sold`, `transferred` |
| unit_type  | string | Filter by unit type                 |
| page       | int    | Page number (default: 1)            |
| per_page   | int    | Items per page (default: 20)        |

### Request Body (POST / PUT)

```json
{
  "project_id": 1,
  "house_model_id": 2,
  "unit_code": "A-1201",
  "unit_number": "1201",
  "floor": "12",
  "building": "Building A",
  "base_price": 3000000,
  "unit_cost": 2500000,
  "area_sqm": 35.5,
  "unit_type_id": 3,
  "standard_budget": 100000,
  "status": "available",
  "remark": ""
}
```

### Response (GET /api/units/{id}) — includes computed budget

```json
{
  "id": 1,
  "unit_code": "A-1201",
  "base_price": 3000000,
  "unit_cost": 2500000,
  "standard_budget": 100000,
  "budget_used": 20000,
  "budget_remaining": 80000,
  "status": "available",
  "house_model": { "id": 2, "name": "Type A - 1 Bed" },
  "unit_type": { "id": 3, "name": "คอนโด 1 ห้องนอน" },
  "project": { "id": 1, "code": "PJ-001", "name": "The Garden Residence" }
}
```

> **Note:** `budget_used` and `budget_remaining` are always derived from `SUM(budget_movements)` — never stored directly.

## UI Screen

### List View
- `mat-table` with columns: Unit Code, Unit Number, Floor, Building, Type, Base Price, Unit Cost, Budget, Status, Actions
- Filter bar: Project selector, Status filter, Search input
- Status chips (`MatChipsModule`): available = blue, reserved = amber, sold = green, transferred = grey
- Price columns formatted with Thai Baht (฿) and comma separator
- Profit indicator color: green for positive, red for negative

### Create / Edit Form (Dialog)
- Fields: Project (required, disabled on edit), House Model (optional, pre-fills physical specs: area, bedrooms, etc.), Unit Code (required), Unit Number, Floor, Building, Unit Type (ดูกฎด้านล่าง), Area sqm, Base Price (required), Unit Cost (required), Standard Budget, Status, Remark
- **Unit Type:**
  - `project_type = mixed` → แสดง `mat-select` เลือกจาก unit_types ของโครงการ (required)
  - `project_type = condo / house / townhouse` → **ไม่แสดง dropdown** แสดงเป็น read-only text ตาม project_type
- **หมายเหตุ:** ราคาขาย, ต้นทุน, งบมาตรฐาน ต้องกรอกที่ยูนิตเสมอ — ไม่มี default จากแบบบ้าน
- Auto-compute: Gross Margin = base_price - unit_cost (read-only)

### Bulk Import
- Support CSV upload for batch unit creation
- Template download button
- Validation errors shown in-line before commit
