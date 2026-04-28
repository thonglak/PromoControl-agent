# Database Schema

## projects
id
code
name
description
company_name
location
project_type (enum: condo, house, townhouse, mixed)
approval_required (boolean)
pool_budget_amount
status (enum: active, inactive, completed)
start_date
end_date
created_at
updated_at

## house_models
id
project_id (FK → projects.id)
code
name
area_sqm
created_at
updated_at
UNIQUE(project_id, code)

## project_phases (เฟสโครงการ — แบ่งกลุ่มยูนิตตามเฟสการขาย)
id
project_id (FK → projects.id)
name (VARCHAR(100) — เช่น "Phase 1", "Phase 2")
sort_order (INT, default: 0 — ยิ่งน้อยยิ่งแสดงก่อน)
created_at
updated_at
UNIQUE(project_id, name)
INDEX(project_id, sort_order)

## project_units
id
project_id (FK → projects.id)
phase_id (FK → project_phases.id, nullable — ON DELETE SET NULL)
house_model_id (FK → house_models.id, nullable)
unit_code
unit_number
floor
building
land_area_sqw (nullable — ขนาดที่ดิน ตร.ว. เก็บที่ unit เพราะ type เดียวกันที่ดินต่างกันได้)
base_price
unit_cost
appraisal_price (nullable — ราคาประเมินจากกรมที่ดิน)
bottom_line_key (nullable — FK → bottom_lines.import_key)
unit_type_id (FK → unit_types.id, nullable — ประเภทยูนิต เลือกจาก master ของโครงการ)
standard_budget
status (enum: available, reserved, sold, transferred)
sale_date
transfer_date
remark
created_at
updated_at
UNIQUE(project_id, unit_code)

## unit_types (ประเภทยูนิต — กำหนดเองต่อโครงการ)
id
project_id (FK → projects.id)
name (VARCHAR(100) — เช่น "บ้านเดี่ยว", "ทาวน์โฮม", "คอนโด 1 ห้องนอน", "Penthouse")
sort_order (INT, default: 0 — ยิ่งน้อยยิ่งแสดงก่อน)
is_active (boolean, default: true)
created_at
updated_at
UNIQUE(project_id, name) — ชื่อห้ามซ้ำภายในโครงการเดียวกัน

## promotion_item_master (แยกตามโครงการ — ของแถมโครงการใดใช้ได้เฉพาะโครงการนั้น)
id
project_id (FK → projects.id — *** ของแถมแยกตามโครงการ ไม่ใช้ร่วมกัน ***)
code (auto-generate — รูปแบบ: PI-XXXX running number per project, ผู้ใช้ไม่ต้องกรอก)
name
category
default_value
max_value (nullable — ถ้า value_mode='calculated' อาจเป็น null หมายถึงไม่มีเพดาน หรือกำหนดเป็นเพดานสูงสุดก็ได้)
default_used_value (nullable — ค่าเริ่มต้นมูลค่าที่ใช้ ถ้า null ใช้ max_value แทน; ถ้า value_mode='calculated' ไม่ใช้ฟิลด์นี้)
value_mode (enum: fixed, actual, manual, calculated — ถ้า calculated ดูสูตรจาก fee_formulas)
is_unit_standard (boolean, default: false — ถ้า true = ของแถม Standard งบยูนิต แสดงอัตโนมัติใน Panel 3A)
is_active (boolean, default: true — soft-disable รายการของแถมโดยไม่ต้องลบออกจากระบบ)
sort_order (INT, default: 0 — อันดับในการเรียงลำดับ ยิ่งน้อยยิ่งแสดงก่อน)
eligible_start_date (DATE, nullable — วันเริ่มต้นที่ใช้ได้ ถ้า null = ไม่จำกัดวันเริ่ม)
eligible_end_date (DATE, nullable — วันสิ้นสุดที่ใช้ได้ ถ้า null = ไม่จำกัดวันสิ้นสุด)
INDEX(project_id)
UNIQUE(project_id, code) — รหัสของแถมซ้ำได้ข้ามโครงการ แต่ห้ามซ้ำภายในโครงการเดียวกัน

## promotion_item_house_models (แบบบ้านที่ใช้ได้ — ถ้าว่าง = ใช้ได้ทุกแบบบ้าน)
id
promotion_item_id (FK → promotion_item_master.id)
house_model_id (FK → house_models.id)
UNIQUE(promotion_item_id, house_model_id)

## promotion_item_units (ยูนิตที่ใช้ได้ — ถ้าว่าง = ใช้ได้ทุกยูนิต)
id
promotion_item_id (FK → promotion_item_master.id)
unit_id (FK → project_units.id)
UNIQUE(promotion_item_id, unit_id)

## fee_formulas (สูตรคำนวณค่าธรรมเนียม — ผูกกับ promotion_item_master ที่ value_mode='calculated')
id
promotion_item_id (FK → promotion_item_master.id)
base_field (enum: appraisal_price, base_price, net_price, manual_input)
  — appraisal_price = ราคาประเมินจากกรมที่ดิน (project_units.appraisal_price)
  — base_price = ราคาขายยูนิต (project_units.base_price)
  — net_price = ราคาสุทธิหลังหักส่วนลด (คำนวณ real-time)
  — manual_input = ค่าที่พนักงานต้องกรอกเอง เช่น วงเงินจำนอง
manual_input_label (nullable — ชื่อ label สำหรับช่องกรอก เช่น "วงเงินจำนอง" ใช้เมื่อ base_field='manual_input')
default_rate (decimal, e.g., 0.02 = 2%)
buyer_share (decimal, e.g., 0.5 = ผู้ซื้อรับภาระครึ่งหนึ่ง; 1.0 = ผู้ซื้อรับภาระทั้งหมด)
description (เช่น "ค่าธรรมเนียมโอนกรรมสิทธิ์ ปกติ 2% แบ่งครึ่ง")
created_at
updated_at
UNIQUE(promotion_item_id) — 1 รายการของแถม : 1 สูตร

## fee_rate_policies (มาตรการรัฐ/นโยบายพิเศษ — override อัตราของ fee_formulas)
id
fee_formula_id (FK → fee_formulas.id)
policy_name (เช่น "มาตรการลดค่าโอน-จดจำนอง 2567-2568")
override_rate (decimal — อัตราใหม่ เช่น 0.01 = 1%)
override_buyer_share (decimal, nullable — สัดส่วนฝั่งผู้ซื้อใหม่ ถ้า null ใช้ buyer_share เดิมจาก fee_formulas)
conditions (JSON — เงื่อนไขที่ต้องตรงจึงจะใช้ policy นี้)
  — ตัวอย่าง: {"max_base_price": 3000000}
  — ตัวอย่าง: {"max_base_price": 3000000, "project_types": ["condo", "house"]}
  — ตัวอย่าง: {} (ไม่มีเงื่อนไข = ใช้กับทุกยูนิต)
effective_from (date — วันเริ่มมีผล)
effective_to (date — วันสิ้นสุด)
is_active (boolean, default: true)
priority (int, default: 0 — ถ้ามีหลาย policy ตรงเงื่อนไข ใช้ priority สูงสุด)
created_by (FK → users.id)
created_at
updated_at

## budget_movements
id
movement_no (VARCHAR(50), unique — เลข movement อัตโนมัติ)
project_id (FK → projects.id)
unit_id (FK → project_units.id, nullable)
movement_type (enum: ALLOCATE, USE, RETURN, ADJUST, SPECIAL_BUDGET_ADD, SPECIAL_BUDGET_ALLOCATE, SPECIAL_BUDGET_USE, SPECIAL_BUDGET_RETURN, SPECIAL_BUDGET_TRANSFER_OUT, SPECIAL_BUDGET_TRANSFER_IN, SPECIAL_BUDGET_VOID)
budget_source_type (enum: UNIT_STANDARD, PROJECT_POOL, MANAGEMENT_SPECIAL)
amount (decimal 15,2)
status (enum: pending, approved, rejected, voided — default: pending)
reference_id (nullable — อ้างอิง record อื่น เช่น special_budget)
reference_type (VARCHAR(50), nullable — ประเภท reference เช่น "special_budget")
sale_transaction_id (FK → sales_transactions.id, nullable)
note (text, nullable)
created_by (FK → users.id, nullable)
approved_by (FK → users.id, nullable — ผู้อนุมัติ)
approved_at (datetime, nullable — วันที่อนุมัติ)
created_at
updated_at
INDEX(unit_id, budget_source_type, status)
INDEX(project_id)

## sales_transactions
id
sale_no
unit_id
base_price
unit_cost
net_price
total_cost
profit

## sales_transaction_items
id
sales_transaction_id
promotion_item_id
used_value
funding_source_type

## unit_budget_allocations (ตั้งงบผูกยูนิต — สร้างจากหน้า Sales Entry)
id
unit_id (FK → project_units.id)
project_id (FK → projects.id)
budget_source_type (enum: PROJECT_POOL, MANAGEMENT_SPECIAL, CAMPAIGN_SUPPORT)
allocated_amount
movement_id (FK → budget_movements.id)
note
created_by (FK → users.id)
created_at
updated_at
UNIQUE(unit_id, budget_source_type)

## bottom_lines (ประวัติ import ราคาต้นทุน)
id
import_key (unique, e.g., BL20260312001)
project_id (FK → projects.id)
file_name
total_rows
matched_rows
unmatched_rows
updated_rows
backup_table_name
mapping_preset_id (FK → bottom_line_mappings.id, nullable)
status (enum: completed, failed, rolled_back)
imported_by (FK → users.id)
imported_at
note
created_at

## bottom_line_{key} (dynamic table — สร้างใหม่ทุกครั้งที่ import)
id
row_number
unit_code
bottom_line_price
appraisal_price
standard_budget (nullable — เฉพาะเมื่อ mapping ระบุ standard_budget_column)
base_price (nullable — เฉพาะเมื่อ mapping ระบุ base_price_column)
matched_unit_id (FK → project_units.id, nullable)
old_unit_cost
old_appraisal
old_standard_budget (nullable)
old_base_price (nullable)
status (enum: matched, unmatched, updated, skipped)

## bottom_line_mappings (preset ตั้งค่า column mapping)
id
project_id (FK → projects.id)
preset_name
mapping_config (JSON)
is_default (boolean)
created_by (FK → users.id)
created_at
updated_at

## number_series (เลขที่เอกสารอัตโนมัติ — ตั้งค่า per project per document type)
id
project_id (FK → projects.id)
document_type (enum: SALE, BUDGET_MOVE, BOTTOM_LINE, UNIT_ALLOC)
prefix (VARCHAR(20), e.g., "SO", "BM")
separator (VARCHAR(5), default: "")
year_format (enum: YYYY_BE, YYYY_AD, YY_BE, YY_AD, NONE)
year_separator (VARCHAR(5), default: "-")
running_digits (INT, default: 4)
reset_cycle (enum: YEARLY, MONTHLY, NEVER)
next_number (INT, default: 1)
last_reset_date (DATE, nullable)
sample_output (VARCHAR(50))
is_active (boolean, default: true)
created_at
updated_at
UNIQUE(project_id, document_type)

## number_series_logs (ประวัติการออกเลขที่)
id
number_series_id (FK → number_series.id)
generated_number (VARCHAR(50))
reference_id (INT)
reference_table (VARCHAR(50))
generated_by (FK → users.id)
generated_at

## import_configs (การตั้งค่า import แบบ generic — ใช้ได้กับหลายประเภท)
id
project_id (FK → projects.id)
config_name (VARCHAR 100 — ชื่อ config เช่น "Import ยูนิต PJ001")
import_type (ENUM: bottom_line, unit, promotion, custom — ประเภทการ import)
target_table (VARCHAR 100 — ตารางเป้าหมาย เช่น "project_units")
file_type (ENUM: xlsx, xls, csv DEFAULT xlsx)
sheet_name (VARCHAR 100, nullable — ชื่อ sheet)
header_row (INT DEFAULT 1 — แถวที่เป็น header)
data_start_row (INT DEFAULT 2 — แถวเริ่มต้นข้อมูล)
is_default (BOOLEAN DEFAULT false — เป็น default ของ project+import_type นี้)
created_by (FK → users.id)
created_at
updated_at
UNIQUE(project_id, config_name)
INDEX(project_id, import_type, is_default)

## import_config_columns (รายละเอียด column mapping ของแต่ละ import config)
id
import_config_id (FK → import_configs.id, CASCADE on DELETE)
source_column (VARCHAR 10 — คอลัมน์ใน Excel เช่น "A", "B", "C")
target_field (VARCHAR 100 — field ในระบบ เช่น "unit_code", "unit_cost")
field_label (VARCHAR 255 — label ภาษาไทย เช่น "รหัสยูนิต")
data_type (ENUM: string, number, date, decimal DEFAULT string)
is_required (BOOLEAN DEFAULT false)
is_key_field (BOOLEAN DEFAULT false — ใช้เป็น key สำหรับ matching)
sort_order (INT DEFAULT 0)
created_at
INDEX(import_config_id)

## users
id
narai_id (VARCHAR(50), nullable, unique — user ID จาก Narai Connect)
sso_provider (VARCHAR(50), nullable — ชื่อ provider เช่น 'narai')
narai_access_token (TEXT, nullable — access token สำหรับเรียก Narai Connect API)
email (unique)
password_hash (nullable — SSO-only users ไม่มี password)
name
role (enum: admin, manager, sales, finance, viewer)
phone
avatar_url
is_active (boolean, default: true)
last_login_at
failed_attempts
locked_until
created_at
updated_at

## user_projects
id
user_id (FK → users.id)
project_id (FK → projects.id)
access_level (enum: view, edit — default: view)
created_at
updated_at
UNIQUE(user_id, project_id)

## refresh_tokens
id
user_id (FK → users.id)
token_hash
expires_at
revoked (boolean, default: false)
user_agent
ip_address
created_at

## external_api_configs (การตั้งค่า API ภายนอกสำหรับดึงข้อมูลยูนิต — Narai Connect)
id
project_id (FK → projects.id — RESTRICT/RESTRICT)
name (VARCHAR(255) — ชื่อ config)
api_url (TEXT — endpoint URL ของ API)
is_active (BOOLEAN DEFAULT true)
created_by (FK → users.id — RESTRICT/SET NULL, nullable)
created_at
updated_at
INDEX(project_id)

## sync_from_api (ประวัติการดึงข้อมูลจาก API ภายนอก)
id
code (VARCHAR(100), unique — รหัสอ้างอิง เช่น "API20260403143022" — ใช้เป็นชื่อ dynamic table ห้ามแก้ไข)
name (VARCHAR(255), nullable — ชื่อแสดงผลที่ผู้ใช้ตั้งเอง ถ้าไม่มีจะแสดง code แทน)
project_id (FK → projects.id — RESTRICT/RESTRICT)
config_id (FK → external_api_configs.id — RESTRICT/SET NULL, nullable)
api_url (TEXT — snapshot URL ที่ใช้จริงตอนดึง อาจต่างจาก config ปัจจุบัน)
total_rows (INT DEFAULT 0)
status (ENUM: completed, failed)
error_message (TEXT, nullable)
fetched_by (FK → users.id — RESTRICT/RESTRICT)
created_at
INDEX(project_id, config_id)

หมายเหตุ: dynamic table `units_{code}` ที่เก็บรายละเอียดยูนิตจริงจะสร้างโดย Service ไม่ใช่ migration

## sync_target_tables (รายการ table เป้าหมายที่รองรับการ sync จาก API ภายนอก)
id
table_name (VARCHAR(100), UNIQUE — ชื่อ table จริงใน DB เช่น project_units)
label (VARCHAR(255) — ชื่อแสดง UI เช่น ยูนิตโครงการ)
default_upsert_key (VARCHAR(100) — upsert key แนะนำ เช่น unit_code)
is_active (BOOLEAN DEFAULT true)
created_at (nullable)
updated_at (nullable)

## api_field_mapping_presets (preset การ map field จาก API กับ target table)
id
project_id (FK → projects.id — RESTRICT/RESTRICT)
name (VARCHAR(255) — ชื่อ preset)
target_table (VARCHAR(100) DEFAULT 'project_units' — table เป้าหมายของ preset นี้)
upsert_key (VARCHAR(100) DEFAULT 'unit_code' — field ที่ใช้เป็น key สำหรับ upsert)
project_id_mode (ENUM: from_snapshot, from_field, none — DEFAULT from_snapshot — วิธีจัดการ project_id)
project_id_field (VARCHAR(100), nullable — source field เมื่อ mode = from_field)
is_default (BOOLEAN DEFAULT false)
created_by (FK → users.id — RESTRICT/SET NULL, nullable)
created_at (nullable)
updated_at (nullable)
INDEX(project_id)
UNIQUE(project_id, name)

## api_field_mapping_columns (รายละเอียดคู่ field ของแต่ละ preset)
id
preset_id (FK → api_field_mapping_presets.id — CASCADE/CASCADE)
source_field (VARCHAR(255) — field จาก API เช่น pd_code)
target_field (VARCHAR(255) — field ใน project_units เช่น unit_code)
transform_type (ENUM: none, number, date, status_map, fk_lookup — DEFAULT none)
transform_value (TEXT, nullable — เช่น {"5":"sold","1":"available"})
sort_order (INT DEFAULT 0)
INDEX(preset_id)