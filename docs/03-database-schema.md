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
description
bedrooms
bathrooms
floors
area_sqm
land_area_sqw
image_url
status (enum: active, inactive)
total_units
created_at
updated_at
UNIQUE(project_id, code)

## project_units
id
project_id (FK → projects.id)
house_model_id (FK → house_models.id, nullable)
unit_code
unit_number
floor
building
base_price
unit_cost
appraisal_price (nullable — ราคาประเมินจากกรมที่ดิน)
bottom_line_key (nullable — FK → bottom_lines.import_key)
area_sqm
unit_type_id (FK → unit_types.id, nullable — ประเภทยูนิต เลือกจาก master ของโครงการ)
standard_budget
status (enum: available, reserved, sold, transferred)
customer_name
salesperson
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
sort_order (INT, default: 0 — อันดับในการเรียงลำดับ ยิ่งน้อยยิ่งแสดงก่อน)
eligible_start_date (DATE, nullable — วันเริ่มต้นที่ใช้ได้ ถ้า null = ไม่จำกัดวันเริ่ม)
eligible_end_date (DATE, nullable — วันสิ้นสุดที่ใช้ได้ ถ้า null = ไม่จำกัดวันสิ้นสุด)
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
movement_no
movement_type
budget_source_type
amount

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
matched_unit_id (FK → project_units.id, nullable)
old_unit_cost
old_appraisal
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

## users
id
email (unique)
password_hash
name
role (enum: admin, manager, sales, finance, viewer)
phone
avatar_url
is_active (boolean, default: true)
last_login_at
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