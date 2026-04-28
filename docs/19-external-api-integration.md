# External API Integration (ดึงข้อมูลจาก API ภายนอก)

## Purpose

เชื่อมต่อกับระบบภายนอก (Narai Connect) เพื่อ:
- **SSO Login** — เข้าสู่ระบบด้วยบัญชี Narai Connect (OAuth2 Authorization Code Flow)
- **ดึงข้อมูลยูนิต** — ดึงข้อมูลยูนิตจาก API ภายนอก เก็บเป็น snapshot (dynamic table)
- **จับคู่ Field** — ตั้ง preset สำหรับ map field จาก API snapshot → `project_units`

---

## 1. SSO Narai Connect (OAuth2)

### Flow

```
1. ผู้ใช้กดปุ่ม "เข้าสู่ระบบด้วย Narai Connect" ในหน้า Login
2. Backend สร้าง state (CSRF) → redirect browser ไปยัง Narai Connect
3. ผู้ใช้ login ที่ Narai → Narai redirect กลับมาพร้อม authorization_code
4. Backend แลก code → access_token → ดึง user info จาก Narai
5. Provision user:
   - ค้นหา narai_id → ถ้าพบ = SSO user เดิม → อัปเดตข้อมูล
   - ค้นหา email → ถ้าพบ = local user → link Narai ID เข้ากับ account เดิม
   - ไม่พบเลย → สร้าง user ใหม่ role=viewer
6. เก็บ narai_access_token ใน users table (ใช้เรียก API ภายนอกภายหลัง)
7. ออก JWT access token + refresh token → redirect กลับ frontend
```

### Narai Connect Endpoints (hardcoded)

| Endpoint | URL |
|----------|-----|
| Authorization | `https://apps.naraiproperty.com/connect/oauth/authorize` |
| Token | `https://apps.naraiproperty.com/connect/oauth/authorize/token` |
| Resource (User Info) | `https://apps.naraiproperty.com/connect/oauth/resource` (POST) |

### Environment Variables

```env
OAUTH2_CLIENT_ID=<ขอจากผู้ดูแลระบบ Narai>
OAUTH2_CLIENT_SECRET=<ขอจากผู้ดูแลระบบ Narai>
OAUTH2_REDIRECT_URI=http://localhost:8080/api/auth/sso/callback
APP_FRONTEND_URL=http://localhost:8080
```

### DB: เพิ่ม columns ใน users

| Column | Type | Description |
|--------|------|-------------|
| `narai_id` | VARCHAR(50), unique, nullable | ID จาก Narai Connect |
| `sso_provider` | VARCHAR(50), nullable | ค่า = `narai` |
| `narai_access_token` | TEXT, nullable | access token จาก Narai (ใช้เรียก API ภายนอก) |

### API Endpoints (SSO)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/sso/authorize` | public | redirect ไป Narai Connect |
| GET | `/api/auth/sso/callback` | public | รับ callback → ออก JWT → redirect frontend |

### Backend Files

- `app/Services/NaraiSsoService.php` — OAuth2 flow ทั้งหมด
- `app/Controllers/SsoController.php` — HTTP layer (authorize + callback)

### Frontend Files

- `features/auth/login-page/` — ปุ่ม "เข้าสู่ระบบด้วย Narai Connect"
- `features/auth/sso-callback/sso-callback.component.ts` — รับ token จาก callback
- `core/services/auth.service.ts` — เพิ่ม `handleSsoToken()`

---

## 2. External API Configs (ตั้งค่า API)

ตั้งค่า URL สำหรับดึงข้อมูลยูนิตจาก API ภายนอก — ผูกกับโครงการ

### DB: `external_api_configs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | |
| `project_id` | FK → projects | โครงการที่ผูก |
| `name` | VARCHAR(255) | ชื่อ config |
| `api_url` | TEXT | URL สำหรับ GET units |
| `is_active` | BOOLEAN | เปิด/ปิด |
| `created_by` | FK → users, nullable | ผู้สร้าง |
| `created_at`, `updated_at` | DATETIME | |

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/external-api-configs?project_id=` | admin, manager | รายการ config ของโครงการ |
| POST | `/api/external-api-configs` | admin, manager | สร้าง config ใหม่ |
| PUT | `/api/external-api-configs/{id}` | admin, manager | แก้ไข config |
| DELETE | `/api/external-api-configs/{id}` | admin, manager | ลบ config (เฉพาะยังไม่มี snapshot อ้างอิง) |

### Frontend: `/sync-from-api/configs`

- mat-table แสดง config: ชื่อ, URL, สถานะ, actions
- dialog สำหรับ create/edit

---

## 3. Units from API (ดึงยูนิตจาก API ภายนอก)

ดึงข้อมูลยูนิตจาก API ภายนอกโดยใช้ `narai_access_token` แล้วเก็บเป็น snapshot (dynamic table)

### Flow

```
1. เลือก API Config (dropdown)
2. กดปุ่ม "ดึงข้อมูล"
3. Backend ดึง narai_access_token จาก users table
4. เรียก API: GET {api_url} + Authorization: Bearer {narai_access_token}
5. Parse JSON response → อ่าน keys จาก row แรก
6. สร้าง dynamic table: sync_{code}
   - id (PK), row_number (INT)
   - ทุก key จาก JSON → TEXT (สร้างอัตโนมัติ)
7. INSERT ข้อมูลทุก row (batch ทีละ 100)
8. บันทึกประวัติใน sync_from_api
```

### DB: `sync_from_api` (ตารางหลัก — ประวัติ snapshot)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | |
| `code` | VARCHAR(100), UNIQUE | รหัส snapshot เช่น `API20260403143022` |
| `project_id` | FK → projects | |
| `config_id` | FK → external_api_configs, nullable | config ที่ใช้ดึง |
| `api_url` | TEXT | URL ที่ใช้จริงตอนดึง (snapshot) |
| `total_rows` | INT | จำนวน record |
| `status` | ENUM: completed, failed | |
| `error_message` | TEXT, nullable | กรณี failed |
| `fetched_by` | FK → users | |
| `created_at` | DATETIME | |

### DB: Dynamic table `sync_{code}`

- สร้างใหม่ทุกครั้งที่ดึงสำเร็จ
- ชื่อ table = `sync_` + `code` จาก `sync_from_api`
- Columns สร้างจาก JSON response keys อัตโนมัติ (ทุก column เป็น TEXT)
- ตัวอย่าง: `sync_API20260403143022`

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sync-from-api?project_id=` | admin, manager | รายการ snapshot ทั้งหมด |
| POST | `/api/sync-from-api/fetch` | admin, manager | ดึงข้อมูลจาก API → สร้าง snapshot |
| POST | `/api/sync-from-api/test` | admin, manager | ทดสอบเรียก API (ไม่สร้าง snapshot) |
| GET | `/api/sync-from-api/{id}` | admin, manager | ดูข้อมูล snapshot + data (paginated) |
| DELETE | `/api/sync-from-api/{id}` | admin, manager | ลบ snapshot + DROP dynamic table |

### Backend Files

- `app/Services/SyncFromApiService.php` — logic: fetchFromApi, testApi, getSnapshotData, deleteSnapshot
- `app/Controllers/SyncFromApiController.php` — HTTP layer
- `app/Models/SyncFromApiModel.php`
- `app/Models/ExternalApiConfigModel.php`

### Frontend Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/sync-from-api` | SyncFromApiListComponent | ประวัติ snapshot + ปุ่มดึงข้อมูล |
| `/sync-from-api/configs` | ExternalApiConfigListComponent | ตั้งค่า API URL |
| `/sync-from-api/debug` | ApiDebugComponent | ทดสอบเรียก API (preview response) |
| `/sync-from-api/:id` | SnapshotDetailComponent | ดูข้อมูลใน snapshot (dynamic columns) |

---

## 4. API Field Mappings (จับคู่ field)

สร้าง preset สำหรับจับคู่ field จาก API snapshot กับ target table ที่กำหนดได้ (เช่น `project_units`, `promotion_item_master`)

### ตัวอย่างการ Map

| Source (API) | Target (project_units) | Transform |
|-------------|----------------------|-----------|
| `pd_code` | `unit_code` | none |
| `pd_selling_price` | `base_price` | number |
| `pd_net_price` | `unit_cost` | number |
| `pd_usable_area` | `area_sqm` | number |
| `pd_status` | `status` | status_map: `{"5":"sold","1":"available"}` |

### DB: `api_field_mapping_presets`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | |
| `project_id` | FK → projects | |
| `name` | VARCHAR(255) | ชื่อ preset |
| `target_table` | VARCHAR(100), default 'project_units' | ตาราง DB ปลายทาง (ต้องอยู่ใน sync_target_tables) |
| `upsert_key` | VARCHAR(100), default 'unit_code' | field สำหรับ match ข้อมูลเพื่อ upsert |
| `project_id_mode` | ENUM: from_snapshot, from_field, none | วิธีจัดการ project_id ตอน sync |
| `project_id_field` | VARCHAR(100), nullable | source field เมื่อ mode = from_field |
| `is_default` | BOOLEAN | preset default ของโครงการ |
| `created_by` | FK → users, nullable | |
| `created_at`, `updated_at` | DATETIME | |
| UNIQUE | `(project_id, name)` | |

### DB: `api_field_mapping_columns`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | |
| `preset_id` | FK → presets (CASCADE) | |
| `source_field` | VARCHAR(255) | field จาก API เช่น `pd_code` |
| `target_field` | VARCHAR(255) | field ใน project_units เช่น `unit_code` |
| `transform_type` | ENUM: none, number, date, status_map, fk_lookup | วิธีแปลงค่า |
| `transform_value` | TEXT, nullable | JSON config (ดูด้านล่าง) |
| `sort_order` | INT | ลำดับ |

### Target Fields

Target fields ดึงจาก DB schema อัตโนมัติตาม `target_table` ที่เลือก — ไม่ hardcode อีกต่อไป

`GET /api/api-field-mappings/target-fields?target_table=project_units`

Response: `{ data: [{ field, type, label }] }` — filter ออก system columns (id, created_at, updated_at, etc.)

### Transform Types

| Type | คำอธิบาย | transform_value |
|------|----------|-----------------|
| `none` | ไม่แปลง — ใช้ค่าตรงๆ | - |
| `number` | ลบ comma/ช่องว่าง → แปลงเป็นตัวเลข | - |
| `date` | parse วันที่ → Y-m-d | - |
| `status_map` | แปลงค่าตาม JSON map | `{"5":"sold","3":"available"}` |
| `fk_lookup` | ค้นหา FK จากตารางอ้างอิง สร้างใหม่ถ้าไม่เจอ | JSON config (ดูด้านล่าง) |

**fk_lookup config:**
```json
{
  "lookup_table": "house_models",
  "lookup_field": "code",
  "scope_by_project": true,
  "create_if_missing": true,
  "create_fields": { "name": "{value}", "code": "{value}" }
}
```

| Key | คำอธิบาย |
|-----|----------|
| `lookup_table` | ตาราง FK ที่ต้อง lookup |
| `lookup_field` | field ที่ใช้ match ค่าจาก source |
| `scope_by_project` | เพิ่ม `WHERE project_id = ?` ตอน lookup |
| `create_if_missing` | สร้าง record ใหม่ถ้าไม่เจอ |
| `create_fields` | field สำหรับ insert — `{value}` แทนค่าจาก source |

### Project ID Mode

กำหนดวิธีจัดการ `project_id` ตอน sync ใน preset:

| Mode | พฤติกรรม |
|------|----------|
| `from_snapshot` | ใช้ project_id จาก snapshot (default) |
| `from_field` | อ่านจาก source field ที่ระบุใน `project_id_field` — รองรับ data หลาย project |
| `none` | ไม่ใส่ project_id — สำหรับ target table ที่ไม่มี project_id |

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/api-field-mappings?project_id=` | admin, manager | รายการ presets |
| GET | `/api/api-field-mappings/target-fields?target_table=` | admin, manager | target fields ดึง dynamic จาก DB schema |
| GET | `/api/api-field-mappings/source-fields?snapshot_id=` | admin, manager | source fields จาก snapshot พร้อม sample |
| GET | `/api/api-field-mappings/{id}` | admin, manager | preset detail + columns |
| POST | `/api/api-field-mappings` | admin, manager | สร้าง preset + columns |
| PUT | `/api/api-field-mappings/{id}` | admin, manager | แก้ไข preset + replace columns |
| DELETE | `/api/api-field-mappings/{id}` | admin, manager | ลบ preset + columns |

### Sync Endpoints (snapshot → target table / house_models)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/sync-from-api/{id}/sync` | admin, manager | Sync snapshot เข้า target table ตาม mapping preset |
| POST | `/api/sync-from-api/{id}/sync-house-models` | admin, manager | สร้างแบบบ้านจาก snapshot + ผูก unit |

**Sync units** — body: `{ preset_id }` → อ่าน `target_table` + `upsert_key` จาก preset → upsert เข้า target table ด้วย upsert_key เป็น match key → return `{ created, updated, skipped, errors }`

**Sync house models** — body: `{ preset_id }` → อ่าน house_model_code mapping จาก preset → group unique → สร้าง house_models + ผูก FK → return `{ models_created, models_existing, units_linked }`

### Frontend: `/sync-from-api/mappings`

- mat-table แสดง presets: ชื่อ, จำนวน fields, default, วันที่, actions
- dialog สำหรับ create/edit:
  - เลือก **Target Table** (จาก sync_target_tables) → โหลด target fields จาก DB schema
  - เลือก **Upsert Key** (จาก target fields)
  - เลือก **Project ID Mode** (from_snapshot / from_field / none)
  - เลือก snapshot → โหลด source fields พร้อม sample value
  - ตาราง map: source field → target field + transform type (none/number/date/status_map/fk_lookup) + transform value
  - บันทึกเป็น preset

---

## 5. Sync Target Tables (ตั้งค่า target table)

Admin กำหนดว่า table ไหนใน DB ที่สามารถ sync ข้อมูลจาก API ภายนอกเข้าได้

### DB: `sync_target_tables`

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT PK | |
| `table_name` | VARCHAR(100), UNIQUE | ชื่อ table จริงใน DB |
| `label` | VARCHAR(255) | ชื่อแสดง UI |
| `default_upsert_key` | VARCHAR(100) | upsert key แนะนำ |
| `is_active` | BOOLEAN | เปิด/ปิด |
| `created_at`, `updated_at` | DATETIME | |

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sync-target-tables` | admin | รายการ target table |
| POST | `/api/sync-target-tables` | admin | เพิ่ม target table (ต้องมีอยู่จริงใน DB) |
| PUT | `/api/sync-target-tables/{id}` | admin | แก้ไข (ห้ามเปลี่ยน table_name) |
| DELETE | `/api/sync-target-tables/{id}` | admin | ลบ (เฉพาะไม่มี preset อ้างอิง) |
| GET | `/api/sync-target-tables/{id}/columns` | admin | ดึง columns จาก DB schema |

### Frontend: `/sync-from-api/targets`

- mat-table แสดง: table_name, label, default_upsert_key, is_active, actions
- dialog สำหรับ create/edit
- เฉพาะ admin เท่านั้น

---

## 6. Mapping Preset Export/Import

### Purpose

Export mapping preset เป็น JSON file เพื่อ backup หรือ copy ไปใช้ในโครงการอื่น แล้ว import กลับได้

### Export

- `GET /api/api-field-mappings/{id}/export` — download JSON file
- ไฟล์ประกอบด้วย: name, target_table, upsert_key, project_id_mode, project_id_field, is_default, columns[]
- ตัด internal fields ออก: id, preset_id, project_id, created_by, timestamps
- Filename: `mapping-{name}-{YYYYMMDD}.json`

### Import

- `POST /api/api-field-mappings/import` — upload JSON file + project_id (FormData)
- ถ้าชื่อ preset ซ้ำ → ต่อท้าย " (copy)", " (copy 2)"... อัตโนมัติ
- `is_default` ถูกตั้งเป็น false เสมอเมื่อ import (ป้องกันชน default เดิม)
- Validate: ต้องมี name + columns array

### Frontend

- ปุ่ม "Export" (icon: arrow-down-tray) ที่ actions column ของแต่ละ preset → download JSON
- ปุ่ม "Import" (icon: arrow-up-tray) ที่ header → เปิด file picker (.json) → upload + reload list

---

## Sidebar Menu

เมนู "ข้อมูลจาก API" (icon: cloud_download) แสดงเฉพาะ admin + manager:

| Label | Route | Role |
|-------|-------|------|
| ประวัติการดึง | `/sync-from-api` | admin, manager |
| ตั้งค่า API | `/sync-from-api/configs` | admin, manager |
| ทดสอบ API | `/sync-from-api/debug` | admin, manager |
| จับคู่ Field | `/sync-from-api/mappings` | admin, manager |
| Target Tables | `/sync-from-api/targets` | admin |

---

## สิ่งที่ยังไม่ได้ทำ (อนาคต)

- **Scheduled auto-fetch** — ตั้งเวลาดึงข้อมูลจาก API อัตโนมัติ
- **Token refresh** — ถ้า `narai_access_token` หมดอายุ ต้อง re-login SSO
