# Sales Entry — แยก Panel รายการโปรโมชั่น

## ภาพรวม

หน้า Sales Entry แยกรายการโปรโมชั่นเป็น **2 panels** พร้อมระบบ **ตั้งงบเพิ่มเติม (Inline Budget Allocation)** ที่พนักงานขายสามารถตั้งงบผูกกับยูนิตได้เองจากหน้า Sales Entry โดยไม่ต้องไปหน้าอื่น

---

## โครงสร้าง Sales Entry

```
Section 1  — ข้อมูลยูนิต (ช่องยูนิตใช้ `mat-autocomplete` พิมพ์ค้นหาได้ทั้ง unit_code และ house_model_name)
Section 2  — งบประมาณที่ใช้ได้ (รวม Inline Budget Allocation)
Section 3A — รายการโปรโมชั่น Premium (งบยูนิต)
Section 3B — รายการของแถมเพิ่มเติม (งบอื่น)
Section 4  — สรุป (real-time)
```

---

## กฎห้ามรายการซ้ำ (Duplicate Prevention)

> **กฎสำคัญ:** รายการโปรโมชั่น/ของแถม 1 รายการ สามารถปรากฏได้เพียง **ครั้งเดียว** ทั้งหน้า

### การแบ่งชุดข้อมูลตาม is_unit_standard

รายการใน `promotion_item_master` ถูกแบ่งออกเป็น 2 ชุดที่ **ไม่ทับซ้อนกัน** โดยอัตโนมัติ:

| flag | Panel | พฤติกรรม |
|------|-------|----------|
| `is_unit_standard = true` | **3A** (งบยูนิต) | โหลดอัตโนมัติทุกรายการ ไม่มี Dropdown ไม่มีปุ่มเพิ่ม/ลบ |
| `is_unit_standard = false` | **3B** (งบอื่น) | เลือกจาก Dropdown มีปุ่มเพิ่ม/ลบ |

เนื่องจาก 2 ชุดนี้แยกจากกันด้วย flag → **ไม่มีทางซ้ำกันข้าม Panel**

### Duplicate Prevention ภายใน Panel 3B

ภายใน Panel 3B เอง ยังต้องป้องกันไม่ให้เลือกรายการซ้ำ:

1. เมื่อเลือกรายการในแถวหนึ่ง → รายการนั้น **หายจาก Dropdown** ของแถวอื่นใน Panel 3B
2. เมื่อลบ row → รายการนั้นกลับมาแสดงใน Dropdown อีกครั้ง

### ตัวอย่าง

```
promotion_item_master:
  is_unit_standard = true  : แอร์, เฟอร์นิเจอร์ built-in, ส่วนลด Early Bird
  is_unit_standard = false : Gift Voucher, ส่วนลดเงินสด, ค่าโอน, ค่าจดจำนอง

Panel 3A แสดงอัตโนมัติ: แอร์, เฟอร์นิเจอร์ built-in, ส่วนลด Early Bird (ทั้ง 3 รายการ)
Panel 3B Dropdown: Gift Voucher, ส่วนลดเงินสด, ค่าโอน, ค่าจดจำนอง

พนักงานเลือก Gift Voucher ใน Panel 3B
→ Dropdown แถวถัดไปเหลือ: ส่วนลดเงินสด, ค่าโอน, ค่าจดจำนอง
```

### Implementation

```typescript
// helper: ตรวจ eligibility conditions ของรายการของแถม
function isEligible(
  item: PromotionItemMaster,
  unit: ProjectUnit,
  saleDate: Date
): boolean {
  // 1. ตรวจแบบบ้าน (ถ้า eligible_house_models ว่าง = ใช้ได้ทุกแบบ)
  if (item.eligible_house_models?.length > 0) {
    if (unit.house_model_id != null
        && !item.eligible_house_models.includes(unit.house_model_id)) {
      return false;
    }
    // ถ้า unit ไม่มี house_model_id (null) → ผ่าน (ไม่ถูกกรอง)
  }

  // 2. ตรวจระยะเวลา
  if (item.eligible_start_date != null) {
    if (saleDate < new Date(item.eligible_start_date)) return false;
  }
  if (item.eligible_end_date != null) {
    if (saleDate > new Date(item.eligible_end_date)) return false;
  }

  // 3. ตรวจยูนิต (ถ้า eligible_units ว่าง = ใช้ได้ทุกยูนิต)
  if (item.eligible_units?.length > 0) {
    if (!item.eligible_units.includes(unit.id)) return false;
  }

  return true;
}

// Panel 3B: track รายการที่ถูกเลือกแล้ว
selectedPanelBIds = computed(() => {
  return new Set(this.panelBItems().map(i => i.promotion_item_id));
});

// Dropdown สำหรับ Panel 3B: เฉพาะ is_unit_standard = false ที่ eligible + ยังไม่ถูกเลือก
availablePanelBItems = computed(() => {
  const unit = this.selectedUnit();
  const saleDate = this.saleDate();
  return this.allMasterItems()
    .filter(item => !item.is_unit_standard
      && !this.selectedPanelBIds().has(item.id)
      && isEligible(item, unit, saleDate))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'th'));
});

// helper: คำนวณ default used_value (รองรับทั้ง fixed และ calculated)
function getDefaultUsedValue(
  item: PromotionItemMaster,
  unit: ProjectUnit,
  saleDate: Date,
  netPrice?: number  // สำหรับ base_field = 'net_price'
): number {
  if (item.value_mode === 'calculated') {
    return calculateFormulaValue(item, unit, saleDate, netPrice);
  }
  return item.default_used_value ?? item.max_value;
}

// helper: คำนวณมูลค่าจากสูตร (value_mode = 'calculated')
function calculateFormulaValue(
  item: PromotionItemMaster,
  unit: ProjectUnit,
  saleDate: Date,
  netPrice?: number
): number {
  const formula = item.fee_formula; // preloaded จาก API
  if (!formula) return 0;

  // 1. หา base_amount ตาม base_field
  let baseAmount: number;
  switch (formula.base_field) {
    case 'appraisal_price':
      baseAmount = unit.appraisal_price ?? 0; // ถ้าไม่มีราคาประเมิน = 0
      break;
    case 'base_price':
      baseAmount = unit.base_price;
      break;
    case 'net_price':
      baseAmount = netPrice ?? unit.base_price;
      break;
    case 'manual_input':
      return 0; // รอพนักงานกรอกค่าฐาน → คำนวณอีกทีใน onManualInputChange()
  }

  // 2. หา effective rate จาก policy (ถ้ามี)
  const { rate, buyerShare } = resolveEffectiveRate(formula, unit, saleDate);

  // 3. คำนวณ
  let value = baseAmount * rate * buyerShare;

  // 4. cap ด้วย max_value (ถ้ากำหนด)
  if (item.max_value != null && value > item.max_value) {
    value = item.max_value;
  }

  return Math.round(value); // ปัดเศษเป็นจำนวนเต็ม
}

// helper: หา effective rate จาก fee_rate_policies
function resolveEffectiveRate(
  formula: FeeFormula,
  unit: ProjectUnit,
  saleDate: Date
): { rate: number; buyerShare: number } {
  // ดึง policies ที่ active + อยู่ในช่วงเวลา, เรียงตาม priority DESC
  const matchedPolicy = formula.policies
    ?.filter(p => p.is_active
      && new Date(p.effective_from) <= saleDate
      && saleDate <= new Date(p.effective_to)
      && evaluateConditions(p.conditions, unit))
    .sort((a, b) => b.priority - a.priority)
    [0]; // เลือก priority สูงสุด

  if (matchedPolicy) {
    return {
      rate: matchedPolicy.override_rate,
      buyerShare: matchedPolicy.override_buyer_share ?? formula.buyer_share
    };
  }

  return {
    rate: formula.default_rate,
    buyerShare: formula.buyer_share
  };
}

// helper: ตรวจเงื่อนไข policy กับข้อมูลยูนิต
function evaluateConditions(conditions: Record<string, any>, unit: ProjectUnit): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  if (conditions.max_base_price != null) {
    if (unit.base_price > conditions.max_base_price) return false;
  }
  if (conditions.project_types != null) {
    if (!conditions.project_types.includes(unit.project_type)) return false;
  }
  // เพิ่มเงื่อนไขอื่นๆ ได้ตามต้องการ
  return true;
}

// Panel 3A: โหลดอัตโนมัติ (filter eligibility + sort by sort_order)
panelAItems = computed(() => {
  const unit = this.selectedUnit();
  const saleDate = this.saleDate();
  return this.allMasterItems()
    .filter(item => item.is_unit_standard && isEligible(item, unit, saleDate))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'th'))
    .map(item => ({
      promotion_item_id: item.id,
      name: item.name,
      category: item.category,
      value_mode: item.value_mode,
      max_value: item.max_value, // สำหรับ calculated: อาจเป็น null (ไม่มีเพดาน) หรือค่า cap
      calculated_value: item.value_mode === 'calculated'
        ? calculateFormulaValue(item, unit, saleDate) // ค่าที่คำนวณได้จากสูตร
        : null,
      used_value: getDefaultUsedValue(item, unit, saleDate), // calculated → ใช้ค่าจากสูตร (หลัง cap)
      convert_to_discount: false,
      funding_source_type: 'UNIT_STANDARD',
      formula_display: item.value_mode === 'calculated'
        ? getFormulaDisplayText(item, unit, saleDate)  // เช่น "ประเมิน×0.5% (มาตรการลดค่าโอน)"
        : null,
      remark: ''
    }));
});

// Panel 3B: เมื่อเพิ่ม row ใหม่
addPanelBItem(item: PromotionItemMaster) {
  const unit = this.selectedUnit();
  const saleDate = this.saleDate();
  this.panelBItems.update(items => [...items, {
    promotion_item_id: item.id,
    name: item.name,
    category: item.category,
    value_mode: item.value_mode,
    max_value: item.max_value, // cap — null = ไม่มีเพดาน
    calculated_value: item.value_mode === 'calculated'
      ? calculateFormulaValue(item, unit, saleDate)
      : null,
    used_value: getDefaultUsedValue(item, unit, saleDate),
    funding_source_type: 'MANAGEMENT_SPECIAL',
    formula_display: item.value_mode === 'calculated'
      ? getFormulaDisplayText(item, unit, saleDate)
      : null,
    manual_input_value: null, // สำหรับ base_field = 'manual_input'
    remark: ''
  }]);
}
```

---

## Section 2 — งบประมาณที่ใช้ได้ (ปรับใหม่)

### แสดงงบแต่ละแหล่ง

| แหล่งงบ | ตั้งงบ | ใช้ไป | คงเหลือ | ที่มา |
|---------|-------|------|---------|------|
| งบยูนิต (UNIT_STANDARD) | 100,000 | 60,000 | 40,000 | ค่าจาก `project_units.standard_budget` — **แก้ไขไม่ได้** |
| งบผู้บริหาร (MANAGEMENT_SPECIAL) | 200,000 | 150,000 | 50,000 | ตั้งเองได้จาก Inline Allocation |
| งบส่วนกลาง (PROJECT_POOL) | 0 | 0 | 0 | ตั้งเองได้จาก Inline Allocation |
| งบแคมเปญ (CAMPAIGN_SUPPORT) | 0 | 0 | 0 | ตั้งเองได้จาก Inline Allocation |
| **รวม** | **300,000** | **210,000** | **90,000** | |

### ปุ่มตั้งงบเพิ่มเติม

ถัดจากแหล่งงบแต่ละแหล่ง (ยกเว้นงบยูนิต) จะมีปุ่ม **[+ ตั้งงบ]** เพื่อเปิด dialog ตั้งงบ

### ปุ่มโอนงบ

สำหรับแหล่งงบที่ไม่ใช่ UNIT_STANDARD:
- allocated > 0 AND remaining > 0 → แสดงปุ่ม [โอนงบ]
- เมื่อกด → เปิด dialog เลือก unit ปลายทาง + ใส่จำนวน + หมายเหตุ
- หลังโอน → Section 2 refresh ทันที
- โอนได้เฉพาะ MANAGEMENT_SPECIAL และ CAMPAIGN_SUPPORT
- สิทธิ์: admin, manager เท่านั้น

สรุปเงื่อนไขแสดงปุ่ม Section 2 (ไม่รวม UNIT_STANDARD):

| เงื่อนไข | ปุ่มที่แสดง |
|----------|-----------|
| allocated = 0 | แค่ [+ ตั้งงบ] |
| allocated > 0, used = 0, remaining > 0 | [+ ตั้งงบ] + [โอนงบ] + [ยกเลิก] |
| allocated > 0, used > 0, remaining > 0 | [+ ตั้งงบ] + [โอนงบ] (ยกเลิกไม่ได้เพราะมีคนใช้แล้ว) |
| allocated > 0, used > 0, remaining = 0 | [+ ตั้งงบ] เท่านั้น (งบหมดแล้ว) |

---

## Inline Budget Allocation (ตั้งงบผูกยูนิต)

### แนวคิด

พนักงานขายสามารถ **ตั้งงบเพิ่มเติม** ผูกกับยูนิตที่กำลังบันทึกขายได้ โดยไม่ต้องออกจากหน้า Sales Entry

- งบยูนิต (`UNIT_STANDARD`) → **ตั้งเองไม่ได้** ค่ามาจาก `project_units.standard_budget`
- งบอื่นทั้ง 3 แหล่ง → **ตั้งเองได้** ผ่าน Inline Allocation

### Dialog ตั้งงบ

เมื่อกดปุ่ม **[+ ตั้งงบ]** จะเปิด `MatDialog` มีฟอร์มดังนี้:

| ฟิลด์ | ชนิด | หมายเหตุ |
|-------|------|----------|
| แหล่งงบ | `mat-select` (disabled) | แสดงชื่อแหล่งงบที่กดมา เช่น "งบผู้บริหาร" |
| จำนวนเงิน | `mat-input` (number) | จำนวนเงินที่ต้องการตั้ง |
| หมายเหตุ | `mat-input` (text) | เช่น "อนุมัติโดยคุณสมชาย" |
| [ยืนยัน] | button | สร้าง budget movement |

### สิ่งที่เกิดขึ้นเมื่อยืนยัน

1. สร้าง record ใน `unit_budget_allocations` (ตารางใหม่)
2. สร้าง `budget_movements` type = `SPECIAL_BUDGET_ALLOCATE` (หรือ `ALLOCATE` สำหรับ PROJECT_POOL)
3. อัปเดต Section 2 ให้แสดงงบใหม่ทันที (real-time)
4. ถ้า `approval_required = true` → movement status = `pending`
5. ถ้า `approval_required = false` → movement status = `approved` ใช้ได้ทันที

### ตัวอย่างการใช้งาน

```
สถานการณ์: บันทึกขายยูนิต A-001 โครงการ SBP
พนักงานขายต้องการงบผู้บริหาร 200,000 บาท

ขั้นตอน:
1. เลือกยูนิต A-001 → Section 2 แสดงงบยูนิต 100,000 บาท
2. กดปุ่ม [+ ตั้งงบ] ข้างงบผู้บริหาร
3. กรอก 200,000 บาท หมายเหตุ "ผจก.อนุมัติ"
4. ยืนยัน → Section 2 แสดงงบผู้บริหาร 200,000 บาท

Section 2 แสดง:
┌──────────────────────────────────────────────────┐
│ งบยูนิต           100,000    ใช้ 0    เหลือ 100,000 │
│ งบผู้บริหาร  [+ ตั้งงบ] 200,000    ใช้ 0    เหลือ 200,000 │
│ งบส่วนกลาง  [+ ตั้งงบ]       0    ใช้ 0    เหลือ       0 │
│ งบแคมเปญ    [+ ตั้งงบ]       0    ใช้ 0    เหลือ       0 │
│ ────────────────────────────────────────────── │
│ รวมทั้งหมด         300,000    ใช้ 0    เหลือ 300,000 │
└──────────────────────────────────────────────────┘

5. Panel 3B → เพิ่มรายการ Gift Voucher 50,000 (งบผู้บริหาร)
6. Panel 3B → เพิ่มรายการ ส่วนลดเงินสด 100,000 (งบผู้บริหาร)

Section 2 อัปเดต:
┌──────────────────────────────────────────────────┐
│ งบยูนิต           100,000    ใช้ 0      เหลือ 100,000 │
│ งบผู้บริหาร        200,000    ใช้ 150,000 เหลือ  50,000 │
│ ────────────────────────────────────────────── │
│ รวมทั้งหมด         300,000    ใช้ 150,000 เหลือ 150,000 │
└──────────────────────────────────────────────────┘
```

---

## Section 3A — รายการโปรโมชั่น Premium (งบยูนิต) — Auto-load

### คำอธิบาย
แสดงรายการของแถม **Standard** ที่กำหนดไว้ว่าเป็นของแถมงบยูนิต (`is_unit_standard = true`) **อัตโนมัติทันที** เมื่อเลือกยูนิต โดยไม่ต้องกดเพิ่มรายการเอง

ของแถม Standard คือรายการของแถมที่บริษัทเสนอให้ลูกค้าตั้งแต่แรก เช่น แอร์, เฟอร์นิเจอร์ built-in, เครื่องใช้ไฟฟ้า ฯลฯ

### แหล่งข้อมูล

```sql
SELECT pim.*,
       GROUP_CONCAT(DISTINCT pihm.house_model_id) as eligible_house_models,
       GROUP_CONCAT(DISTINCT piu.unit_id) as eligible_units
FROM promotion_item_master pim
LEFT JOIN promotion_item_house_models pihm ON pim.id = pihm.promotion_item_id
LEFT JOIN promotion_item_units piu ON pim.id = piu.promotion_item_id
WHERE pim.is_unit_standard = true
GROUP BY pim.id
ORDER BY pim.sort_order ASC, pim.name ASC
```

เมื่อเลือกยูนิต → ระบบดึงรายการที่ `is_unit_standard = true` แล้ว filter ด้วย eligibility conditions (แบบบ้าน, ระยะเวลา, ยูนิต) → แสดงเฉพาะรายการที่ eligible เป็น row สำเร็จรูปใน Panel 3A ทันที เรียงตาม `sort_order`

### คอลัมน์ในตาราง

| คอลัมน์ | ข้อมูล | หมายเหตุ |
|---------|--------|----------|
| รายการโปรโมชั่น | `promotion_item_master.name` | **แสดงอัตโนมัติ** (read-only, ไม่ใช่ Dropdown) |
| หมวดหมู่ | `promotion_item_master.category` | แสดงอัตโนมัติ (discount / premium / expense_support) |
| มูลค่าสูงสุด | `max_value` | **fixed**: จาก master / **calculated**: จากสูตร (เปลี่ยนตามยูนิต) |
| มูลค่าที่ใช้ | `used_value` | กรอกได้ (**fixed**: default = `default_used_value ?? max_value` / **calculated**: default = ค่าจากสูตร) |
| สูตร/อัตรา | `formula_display` | **เฉพาะ calculated** — แสดง tooltip เช่น "ประเมิน×0.5% (มาตรการลดค่าโอน)" |
| แปลงเป็นส่วนลด | `convert_to_discount` | checkbox — เฉพาะ category = premium เท่านั้น (**เฉพาะ Panel 3A เท่านั้น**ที่แปลงได้) |
| แหล่งงบ | `funding_source_type` | แสดงเป็น "งบยูนิต" (locked) |
| หมายเหตุ | `remark` | กรอกได้ |

### พฤติกรรม
- **ไม่มีปุ่ม [+ เพิ่มรายการ]** — รายการถูกโหลดมาอัตโนมัติจาก master
- **ไม่มีปุ่มลบ row** — รายการ Standard แสดงเสมอ (ถ้าไม่ใช้ ให้ลดค่า `used_value` เป็น 0)
- **มูลค่าที่ใช้ default (fixed)** — ใช้ `default_used_value` จาก master ถ้ากำหนดไว้ ถ้าไม่ได้กำหนด (null) จะใช้ `max_value` แทน พนักงานแก้ไขลดได้
- **มูลค่าที่ใช้ default (calculated)** — ระบบคำนวณจากสูตร `fee_formulas` + `fee_rate_policies` อัตโนมัติ พนักงานแก้ไขได้แต่ต้องไม่เกิน max_value (ถ้ากำหนด)
- **calculated items: recalculate** — ค่าจะคำนวณใหม่ทุกครั้งที่ข้อมูลฐานเปลี่ยน (เปลี่ยนยูนิต, เปลี่ยนราคา)
- **calculated items: แสดงสูตร** — แสดง label บอกอัตราที่ใช้ เช่น "ประเมิน 3,000,000 × 0.5% = 15,000" ถ้าใช้มาตรการรัฐจะแสดงชื่อ policy ด้วย
- **calculated items: ข้อมูลฐานไม่ครบ** — ถ้า `appraisal_price = null` แสดง warning "ยังไม่มีราคาประเมิน" และ used_value = 0
- แหล่งงบล็อกเป็น `UNIT_STANDARD` เสมอ
- รายการจะหักจาก **งบยูนิต** เท่านั้น
- ถ้า category เป็น `premium` → แสดง checkbox "แปลงเป็นส่วนลด" (**Panel 3A เท่านั้น**ที่แปลงได้ Panel 3B ไม่มี)
- มูลค่ารวมทั้ง Panel ต้องไม่เกินงบยูนิตคงเหลือ (validate real-time)
- เฉพาะรายการที่ `used_value > 0` เท่านั้นจะถูกบันทึกเป็น `sales_transaction_items`

### ตัวอย่าง

```
promotion_item_master ที่ is_unit_standard = true:
- แอร์ (premium, max 40,000, value_mode: fixed)
- เฟอร์นิเจอร์ built-in (premium, max 30,000, value_mode: fixed)
- ส่วนลด Early Bird (discount, max 50,000, value_mode: fixed)
- ฟรีค่าธรรมเนียมโอน (expense_support, value_mode: calculated)
  → fee_formula: appraisal_price × 2% × 0.5 (ปกติ)
  → policy: ลดเหลือ 1% × 0.5 = 0.5% (ถ้าราคาขาย ≤ 3M, ช่วง 2024-04-01~2025-12-31)

เมื่อเลือกยูนิต A-001 (งบยูนิต 150,000, base_price 2,800,000, appraisal_price 3,000,000)
sale_date: 2025-06-15 → policy ตรง (2,800,000 ≤ 3,000,000 ✓)
→ ค่าโอน = 3,000,000 × 0.01 × 0.5 = 15,000

Panel 3A แสดงทันที:
┌──────────────────────────────────────────────────────────────────────────┐
│ # | รายการ               | หมวด            | สูงสุด | ใช้    | แปลง | งบ    │
│ 1 | แอร์                 | premium         | 40,000 | 40,000 | ☐   | ยูนิต │
│ 2 | เฟอร์นิเจอร์ built-in | premium         | 30,000 | 30,000 | ☐   | ยูนิต │
│ 3 | ส่วนลด Early Bird    | discount        | 50,000 | 50,000 | —   | ยูนิต │
│ 4 | ฟรีค่าธรรมเนียมโอน   | expense_support | 15,000 | 15,000 | —   | ยูนิต │
│   |   ↳ ประเมิน 3,000,000 × 0.5% (มาตรการลดค่าโอน 67-68)              │
│ ──────────────────────────────────────────────────────────────────────── │
│ รวม Panel 3A: ฿135,000 / งบยูนิตเหลือ: ฿15,000                         │
└──────────────────────────────────────────────────────────────────────────┘

พนักงานขายปรับลดมูลค่าตามจริง (เช่น ลูกค้าไม่ต้องการส่วนลด Early Bird):
│ 1 | แอร์                 | premium         | 40,000 | 40,000 | ☐   | ยูนิต │
│ 2 | เฟอร์นิเจอร์ built-in | premium         | 30,000 | 30,000 | ☐   | ยูนิต │
│ 3 | ส่วนลด Early Bird    | discount        | 50,000 |      0 | —   | ยูนิต │
│ 4 | ฟรีค่าธรรมเนียมโอน   | expense_support | 15,000 | 15,000 | —   | ยูนิต │
│ ──────────────────────────────────────────────────────────────────────── │
│ รวม Panel 3A: ฿85,000 / งบยูนิตเหลือ: ฿65,000                          │

→ รายการ "ส่วนลด Early Bird" ไม่ถูกบันทึกเป็น transaction item เพราะ used_value = 0
→ รายการ "ฟรีค่าธรรมเนียมโอน" คำนวณอัตโนมัติจากสูตร พนักงานแก้ไขลดได้
```

---

## Section 3B — รายการของแถมเพิ่มเติม (งบอื่น)

### คำอธิบาย
แสดงรายการของแถม/โปรโมชั่นที่ **ไม่ใช่ของแถม Standard** (`is_unit_standard = false`) ใช้งบจาก:
- `PROJECT_POOL` — งบส่วนกลางโครงการ
- `MANAGEMENT_SPECIAL` — งบพิเศษจากผู้บริหาร
- `CAMPAIGN_SUPPORT` — งบสนับสนุนแคมเปญ

### แหล่งข้อมูล Dropdown

```sql
SELECT pim.*,
       GROUP_CONCAT(DISTINCT pihm.house_model_id) as eligible_house_models,
       GROUP_CONCAT(DISTINCT piu.unit_id) as eligible_units
FROM promotion_item_master pim
LEFT JOIN promotion_item_house_models pihm ON pim.id = pihm.promotion_item_id
LEFT JOIN promotion_item_units piu ON pim.id = piu.promotion_item_id
WHERE pim.is_unit_standard = false
GROUP BY pim.id
ORDER BY pim.sort_order ASC, pim.name ASC
```

Dropdown จะแสดงเฉพาะรายการที่ `is_unit_standard = false` **และ** ผ่าน eligibility conditions **และ** ยังไม่ถูกเลือกใน Panel 3B (ดูกฎ Duplicate Prevention) เรียงตาม `sort_order`

> **หมายเหตุ:** ไม่ต้อง filter รายการจาก Panel 3A เพราะ Panel 3A กับ 3B ใช้คนละชุดข้อมูลอยู่แล้ว (3A = `is_unit_standard = true`, 3B = `is_unit_standard = false`) จึงไม่มีทางซ้ำกันข้าม Panel

### คอลัมน์ในตาราง

| คอลัมน์ | ข้อมูล | หมายเหตุ |
|---------|--------|----------|
| รายการโปรโมชั่น | `promotion_item_master.name` | **Dropdown** เลือกจากรายการที่ `is_unit_standard = false` |
| หมวดหมู่ | `promotion_item_master.category` | แสดงอัตโนมัติ |
| มูลค่าสูงสุด | `max_value` | แสดงอัตโนมัติจาก master |
| มูลค่าที่ใช้ | `used_value` | กรอกได้ ต้องไม่เกิน max_value (**default = `default_used_value` ถ้ามี, ไม่งั้นใช้ `max_value`**) |
| แหล่งงบ | `funding_source_type` | Dropdown: งบส่วนกลาง / งบผู้บริหาร / งบแคมเปญ (**default = งบผู้บริหาร**) |
| หมายเหตุ | `remark` | กรอกได้ |

> **หมายเหตุ:** Panel 3B **ไม่มี** คอลัมน์ "แปลงเป็นส่วนลด" เพราะสิทธิ์แปลงเป็นส่วนลดมีเฉพาะของแถมงบยูนิต (Panel 3A) เท่านั้น

### พฤติกรรม
- **มีปุ่ม [+ เพิ่มรายการ]** — พนักงานขายเพิ่ม row เองตามต้องการ
- **มีปุ่มลบ row** — ลบรายการที่ไม่ต้องการได้
- **มูลค่าที่ใช้ default (fixed)** — เมื่อเลือกรายการจาก Dropdown ระบบกรอก `used_value = default_used_value` (ถ้ามี) หรือ `max_value` (ถ้าไม่ได้กำหนด) ให้อัตโนมัติ พนักงานแก้ไขลดได้
- **มูลค่าที่ใช้ default (calculated)** — ระบบคำนวณจากสูตรอัตโนมัติ ถ้า `base_field = manual_input` จะแสดงช่องกรอกค่าฐาน (เช่น "วงเงินจำนอง") แล้วคำนวณให้
- **แหล่งงบ default = `MANAGEMENT_SPECIAL` (งบผู้บริหาร)** — เมื่อเพิ่ม row ใหม่ แหล่งงบตั้งเป็นงบผู้บริหารอัตโนมัติ พนักงานเปลี่ยนได้
- **ต้องตั้งงบก่อน** จึงจะเลือกแหล่งงบนั้นได้ (ถ้ายังไม่ตั้งงบผู้บริหาร → ตัวเลือก "งบผู้บริหาร" จะ disabled พร้อมแสดง "ยังไม่ได้ตั้งงบ")
- มูลค่าที่ใช้ต้องไม่เกิน **งบคงเหลือ** ของแหล่งงบที่เลือก (validate real-time)
- **ไม่มีช่อง "แปลงเป็นส่วนลด"** — สิทธิ์แปลงมีเฉพาะ Panel 3A (งบยูนิต)
- แหล่งงบที่งบเหลือ 0 → จะ disabled ใน Dropdown พร้อมแสดง "งบหมดแล้ว"

### ตัวอย่าง Panel 3B กับ calculated item (ค่าจดจำนอง)

```
พนักงานเพิ่มรายการ "ฟรีค่าจดจำนอง" จาก Dropdown
→ base_field = manual_input → แสดงช่องกรอก "วงเงินจำนอง"

│ # | รายการ          | หมวด            | วงเงินจำนอง: [2,000,000] | ใช้  | งบ       │
│ 1 | ฟรีค่าจดจำนอง   | expense_support |    × 0.01% (มาตรการฯ)   | 200  | ผู้บริหาร │
│   |   ↳ วงเงิน 2,000,000 × 0.01% = 200 บาท (มาตรการลดค่าจดจำนอง 67-68)       │

ถ้าราคาขายยูนิต > 3 ล้าน (ไม่ตรงเงื่อนไข policy):
│ 1 | ฟรีค่าจดจำนอง   | expense_support |    × 1%                 | 20,000 | ผู้บริหาร │
│   |   ↳ วงเงิน 2,000,000 × 1% = 20,000 บาท (อัตราปกติ)                        │
```

---

## UI Layout

### Desktop

```
┌─────────────────────────────────────────────────────────────────┐
│  Section 1 — ข้อมูลยูนิต                                        │
│  โครงการ: SBP | ยูนิต: A-001 | ราคาขาย: 3,500,000              │
├─────────────────────────────────────────────────────────────────┤
│  Section 2 — งบประมาณ                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ แหล่งงบ              ตั้งงบ      ใช้ไป     คงเหลือ       │    │
│  │ ─────────────────────────────────────────────────────── │    │
│  │ งบยูนิต              100,000         0    100,000       │    │
│  │ งบผู้บริหาร  [+ตั้งงบ] 200,000   150,000     50,000       │    │
│  │ งบส่วนกลาง  [+ตั้งงบ]       0         0          0       │    │
│  │ งบแคมเปญ    [+ตั้งงบ]       0         0          0       │    │
│  │ ─────────────────────────────────────────────────────── │    │
│  │ รวม                  300,000   150,000    150,000       │    │
│  └─────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  Panel 3A: รายการโปรโมชั่น Premium (งบยูนิต) — โหลดอัตโนมัติ      │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ # | รายการ               | หมวด            | สูงสุด | ใช้    | แปลง | งบ    │
│  │ 1 | แอร์                 | premium         | 40,000 | 40,000 | ☐   | ยูนิต │
│  │ 2 | เฟอร์นิเจอร์ built-in | premium         | 30,000 | 30,000 | ☐   | ยูนิต │
│  │ 3 | ส่วนลด Early Bird    | discount        | 50,000 |      0 | —   | ยูนิต │
│  │ 4 | ฟรีค่าโอน            | expense_support | 15,000 | 15,000 | —   | ยูนิต │
│  │   |   ↳ ประเมิน 3M × 0.5% (มาตรการลดค่าโอน)                        │
│  │   (ไม่มีปุ่มเพิ่ม/ลบ — รายการ Standard โหลดมาครบ)               │
│  │ ──────────────────────────────────────────────────── │      │
│  │ รวม Panel 3A: ฿85,000 / งบยูนิตเหลือ: ฿15,000       │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                 │
│  Panel 3B: รายการของแถมเพิ่มเติม (งบอื่น)                       │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ # | รายการ       | หมวด     | สูงสุด   | ใช้     | งบ         │      │
│  │ 1 | Gift Voucher | premium  | 50,000  | 50,000 | ผู้บริหาร   │      │
│  │ 2 | ส่วนลดเงินสด | discount | 100,000 | 100,000| ผู้บริหาร   │      │
│  │   [+ เพิ่มรายการ]                                     │      │
│  │ ──────────────────────────────────────────────────── │      │
│  │ รวม Panel 3B: ฿150,000                               │      │
│  │   งบผู้บริหาร ใช้: 150,000 / เหลือ: 50,000             │      │
│  └───────────────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────────────────┤
│  Section 4 — สรุป                                               │
│  ราคาขาย (Base Price)          : 3,500,000                      │
│  ส่วนลดทั้งหมด (Total Discount): 100,000                       │
│  ราคาสุทธิ (Net Price)         : 3,400,000                      │
│  ─────────────────────────────────────────                      │
│  ต้นทุนยูนิต (Unit Cost)       : 2,800,000                      │
│  ต้นทุนของแถม (Promo Cost)     : 120,000                        │
│  ค่าใช้จ่ายอุดหนุน (Expense)    : 30,000                        │
│  ต้นทุนจากของแถม               : 150,000  ← Promo Cost + Expense│
│  ต้นทุนรวม (Total Cost)        : 2,950,000 ← Unit + ต้นทุนของแถม│
│  ─────────────────────────────────────────                      │
│  กำไร (Profit)                 : 450,000                        │
│  งบใช้ไป: 220,000 | งบเหลือ: 80,000                            │
└─────────────────────────────────────────────────────────────────┘
```

### Angular Component Structure

```
SalesEntryComponent
├── UnitInfoSection              (Section 1)
├── BudgetOverviewSection        (Section 2 — ปรับใหม่)
│   ├── BudgetRow × 4            (แสดงแต่ละแหล่งงบ)
│   └── InlineBudgetDialog       (MatDialog ตั้งงบ)
├── PremiumPromotionPanel        (Section 3A)
│   └── mat-table + เพิ่ม/ลบ row
├── AdditionalPromotionPanel     (Section 3B)
│   └── mat-table + เพิ่ม/ลบ row + เลือกแหล่งงบ
└── SummarySection               (Section 4 — รวมยอดจาก 3A + 3B)
```

---

## Calculated Items — ของแถมแบบคำนวณตามสูตร

### แนวคิด

ของแถมบางประเภท เช่น ค่าธรรมเนียมโอน, ค่าจดจำนอง มีมูลค่าที่ไม่คงที่ ต้องคำนวณจากข้อมูลยูนิตจริง
รายการเหล่านี้มี `value_mode = 'calculated'` ในตาราง `promotion_item_master`

### โครงสร้าง 3 ชั้น

```
promotion_item_master (value_mode = 'calculated')
    │
    └── fee_formulas (1:1 — สูตรพื้นฐาน: ฐาน × อัตรา × สัดส่วนผู้ซื้อ)
            │
            └── fee_rate_policies (1:N — มาตรการรัฐ/นโยบายพิเศษที่ override อัตรา)
                   มีเงื่อนไข, ช่วงเวลา, ลำดับความสำคัญ
```

### สูตรคำนวณ

```
calculated_value = base_amount × effective_rate × buyer_share
```

- `base_amount` = ค่าจาก `fee_formulas.base_field` (เช่น ราคาประเมิน, ราคาขาย, วงเงินจำนอง)
- `effective_rate` = อัตราจาก policy (ถ้าตรงเงื่อนไข) หรือ `default_rate` (ถ้าไม่ตรง)
- `buyer_share` = สัดส่วนที่ผู้ซื้อรับภาระ (เช่น 0.5 = ครึ่งหนึ่ง)

### ตัวอย่างครบวงจร

```
ยูนิต A-001:
  base_price = 2,800,000
  appraisal_price = 3,000,000
  sale_date = 2025-06-15

รายการ: ฟรีค่าธรรมเนียมโอน
  fee_formula:
    base_field = appraisal_price → 3,000,000
    default_rate = 0.02 (2%)
    buyer_share = 0.5

  fee_rate_policies:
    "มาตรการลดค่าโอน 67-68"
    override_rate = 0.01 (1%)
    override_buyer_share = 0.5
    conditions: {"max_base_price": 3000000}
    effective: 2024-04-01 ~ 2025-12-31

  ตรวจเงื่อนไข:
    ✓ sale_date อยู่ในช่วง
    ✓ base_price 2,800,000 ≤ 3,000,000

  → ใช้ policy: 3,000,000 × 0.01 × 0.5 = 15,000 บาท
  → used_value (default) = 15,000
```

### UI Behavior สำหรับ Calculated Items

| พฤติกรรม | รายละเอียด |
|----------|-----------|
| แสดงค่าอัตโนมัติ | เมื่อเลือกยูนิต → ระบบคำนวณและกรอก `used_value` ทันที |
| แสดงสูตร | แสดง label ใต้ชื่อรายการ เช่น "ประเมิน 3M × 0.5% (มาตรการลดค่าโอน)" |
| Recalculate | คำนวณใหม่อัตโนมัติเมื่อข้อมูลฐานเปลี่ยน |
| Manual Input | ถ้า `base_field = manual_input` → แสดงช่องกรอกค่าฐาน → คำนวณเมื่อกรอก |
| ข้อมูลไม่ครบ | ถ้า base value = null (เช่น ยังไม่มีราคาประเมิน) → แสดง warning, used_value = 0 |
| แก้ไขได้ | พนักงานแก้ไข used_value ได้ แต่ต้องไม่เกิน max_value (ถ้ากำหนด) |
| Cap | ถ้า `max_value` กำหนดไว้ → ค่าจากสูตรจะถูก cap ไม่เกิน max_value |

### Conditions ที่รองรับ (fee_rate_policies.conditions)

| Key | Type | ตัวอย่าง | ความหมาย |
|-----|------|----------|----------|
| `max_base_price` | number | 3000000 | ราคาขายต้องไม่เกินค่านี้ |
| `project_types` | string[] | ["condo","house"] | ประเภทโครงการที่ใช้ได้ |

> **หมายเหตุ:** เพิ่มเงื่อนไขใหม่ได้ในอนาคตโดยแก้ `evaluateConditions()` — ไม่ต้องเปลี่ยน schema

---

## การคำนวณ

สูตรคำนวณกำไร (สูตรหลักไม่เปลี่ยน เพิ่มการแสดงผล "ต้นทุนจากของแถม"):

```
net_price = base_price - total_discount
total_promo_burden = total_promo_cost + total_expense_support   ← ต้นทุนจากของแถม
net_after_promo = net_price - total_promo_burden                ← สุทธิ (แสดงผลใหม่)
profit = net_after_promo - unit_cost                            ← กำไร (ผลลัพธ์เท่าเดิม = net_price - unit_cost - total_promo_burden)
```

### รายละเอียดแต่ละตัวแปร

| ตัวแปร | สูตร | คำอธิบาย |
|--------|------|----------|
| `total_discount` | SUM(`used_value`) ที่ `effective_category = 'discount'` | ส่วนลดทั้งหมด |
| `net_price` | `base_price - total_discount` | ราคาสุทธิ |
| `total_promo_cost` | SUM(`used_value`) ที่ `effective_category = 'premium'` | ต้นทุนของแถม (Promo Cost) |
| `total_expense_support` | SUM(`used_value`) ที่ `effective_category = 'expense_support'` | ค่าใช้จ่ายอุดหนุน (Expense) |
| **`total_promo_burden`** | `total_promo_cost + total_expense_support` | **ต้นทุนจากของแถม** (รายการใหม่) |
| **`net_after_promo`** | `net_price - total_promo_burden` | **สุทธิ (หลังหักต้นทุนของแถม)** — รายการใหม่ |
| `profit` | `net_after_promo - unit_cost` | กำไร (สูตรเดิม: net_price - unit_cost - total_promo_burden) |
| `totalPanelAUsed` | SUM(`used_value`) ที่ `used_value > 0` เฉพาะ Panel 3A | งบยูนิตใช้ไป |
| `totalUnitBudgetReturned` | SUM(`amount`) จาก movement type `RETURN` WHERE unit_id นี้ AND source = `UNIT_STANDARD` | งบยูนิตที่คืนเข้า Pool |
| `budgetUnitRemain` | `standard_budget - totalPanelAUsed - totalUnitBudgetReturned` | งบยูนิตเหลือ (หักส่วนที่คืน Pool แล้ว) |
| `totalPanelBUsed` | SUM(`used_value`) ที่ `used_value > 0` เฉพาะ Panel 3B | งบอื่นที่ใช้ |
| `totalBudgetRemaining` | SUM(remaining ของทุกแหล่งงบ) | งบคงเหลือรวม |
| `netExtraBudgetUsed` | `totalPanelBUsed - budgetUnitRemain` | งบนอกสุทธิที่ใช้ |

### ลำดับการแสดงผลใน Section 4

```
 1. ราคาขาย (Base Price)                     : xxx,xxx
 2. ส่วนลดทั้งหมด (Total Discount)            : -xxx,xxx
 3. ราคาสุทธิ (Net Price) = 1 - 2            : xxx,xxx
 4. ─────────────────────────
 5. ต้นทุนของแถม (Promo Cost)                 : xxx,xxx
 6. ค่าใช้จ่ายอุดหนุน (Expense Support)        : xxx,xxx
 7. ต้นทุนจากของแถม = 5 + 6                   : xxx,xxx
 8. สุทธิ = 3 - 7                            : xxx,xxx  ← netAfterPromo (ใหม่)
 9. ─────────────────────────
10. ต้นทุนยูนิต (Unit Cost)                   : xxx,xxx
11. กำไร (Profit) = 8 - 10                   : xxx,xxx  ← สูตรเดิม แค่แสดงต่าง
12. ─────────────────────────
13. งบยูนิตใช้ไป: totalPanelAUsed | งบยูนิตเหลือ: budgetUnitRemain
14. งบคงเหลือรวม: totalBudgetRemaining
15. งบนอกสุทธิที่ใช้: netExtraBudgetUsed
```

> **หมายเหตุ layout:** บรรทัด 8 "สุทธิ" = `net_after_promo` = `net_price - total_promo_burden`
> กำไรยังคำนวณเหมือนเดิม: `profit = net_price - unit_cost - total_promo_burden`
> แค่แสดงผลต่างจากเดิม: `profit = net_after_promo - unit_cost` (ผลลัพธ์เท่ากัน)

> **สำคัญ:** ใช้ `effective_category` ในการคำนวณเสมอ ไม่ใช่ `promotion_category`
> **หมายเหตุ:** `net_after_promo` เป็นค่าแสดงผลใหม่ = `net_price - total_promo_burden` สูตรคำนวณ `profit` ไม่เปลี่ยน (ผลลัพธ์เท่าเดิม)

---

## การบันทึก Budget Movement

### เมื่อตั้งงบ (Inline Allocation)

| แหล่งงบ | Movement Type |
|---------|---------------|
| `PROJECT_POOL` | `ALLOCATE` |
| `MANAGEMENT_SPECIAL` | `SPECIAL_BUDGET_ALLOCATE` |
| `CAMPAIGN_SUPPORT` | `SPECIAL_BUDGET_ALLOCATE` |

### เมื่อบันทึกขาย (ใช้งบ)

| Panel | แหล่งงบ | Movement Type |
|-------|---------|---------------|
| 3A | `UNIT_STANDARD` | `USE` |
| 3B | `PROJECT_POOL` | `USE` |
| 3B | `MANAGEMENT_SPECIAL` | `SPECIAL_BUDGET_USE` |
| 3B | `CAMPAIGN_SUPPORT` | `SPECIAL_BUDGET_USE` |

### Budget Movement Flow (ตัวอย่างครบวงจร)

```
ยูนิต A-001, โครงการ SBP

1. ตั้งงบผู้บริหาร 200,000
   → budget_movements: SPECIAL_BUDGET_ALLOCATE, 200,000, unit_id=A-001

2. ใช้ Gift Voucher 50,000 จากงบผู้บริหาร
   → budget_movements: SPECIAL_BUDGET_USE, -50,000, unit_id=A-001

3. ใช้ส่วนลดเงินสด 100,000 จากงบผู้บริหาร
   → budget_movements: SPECIAL_BUDGET_USE, -100,000, unit_id=A-001

4. คงเหลืองบผู้บริหาร
   = SUM(movements WHERE unit_id=A-001 AND source='MANAGEMENT_SPECIAL')
   = 200,000 + (-50,000) + (-100,000)
   = 50,000 ✓
```

---

## Validation Rules

1. **ห้ามรายการซ้ำ** — promotion_item_id เดียวกันเลือกได้แค่ครั้งเดียวทั้งหน้า (ทุก Panel รวมกัน)
2. มูลค่ารวมใน Panel 3A ต้องไม่เกิน **งบยูนิตคงเหลือ**
3. มูลค่าที่ใช้ใน Panel 3B ต้องไม่เกิน **งบคงเหลือของแหล่งงบที่เลือก** (แยกตรวจแต่ละแหล่ง)
4. `used_value` ของแต่ละรายการต้องไม่เกิน `max_value`
5. **ต้องตั้งงบก่อนใช้** — Panel 3B จะเลือกแหล่งงบได้เฉพาะที่มีการตั้งงบไว้แล้ว (allocation > 0)
6. ถ้า `approval_required = true` → budget movement status = `pending`
7. ถ้า `approval_required = false` → budget movement status = `approved` ทันที

---

## Dashboard Integration (งบรวมระดับโครงการ)

### การแสดงผลในหน้า Dashboard ของแต่ละโครงการ

```
┌──────────────────────────────────────────────┐
│  สรุปงบโปรโมชั่น — โครงการ SBP               │
│                                              │
│  แหล่งงบ          ตั้งงบรวม   ใช้ไปรวม   คงเหลือ │
│  ──────────────────────────────────────────  │
│  งบยูนิต (รวมทุก unit)  5,000,000  3,200,000  1,800,000 │
│  งบผู้บริหาร            1,500,000    800,000    700,000 │
│  งบส่วนกลาง            2,000,000  1,100,000    900,000 │
│  งบแคมเปญ                500,000    200,000    300,000 │
│  ──────────────────────────────────────────  │
│  รวม                   9,000,000  5,300,000  3,700,000 │
└──────────────────────────────────────────────┘
```

### วิธีคำนวณ (ทุกค่าคำนวณจาก budget_movements เท่านั้น)

```sql
-- งบตั้งรวม (ต่อแหล่ง ต่อโครงการ)
SELECT budget_source_type,
       SUM(amount) as total_allocated
FROM budget_movements
WHERE project_id = :project_id
  AND movement_type IN ('ALLOCATE', 'SPECIAL_BUDGET_ALLOCATE', 'SPECIAL_BUDGET_ADD')
  AND status = 'approved'
GROUP BY budget_source_type;

-- งบใช้ไปรวม (ต่อแหล่ง ต่อโครงการ)
SELECT budget_source_type,
       SUM(ABS(amount)) as total_used
FROM budget_movements
WHERE project_id = :project_id
  AND movement_type IN ('USE', 'SPECIAL_BUDGET_USE')
  AND status = 'approved'
GROUP BY budget_source_type;

-- คงเหลือ = ตั้งงบ - ใช้ไป (derive จาก movement เสมอ ไม่เก็บ balance โดยตรง)
```

---

## Database — ตารางใหม่: unit_budget_allocations

เพิ่มตารางใหม่เพื่อ track การตั้งงบผูกยูนิต:

```
## unit_budget_allocations
id
unit_id (FK → project_units.id)
project_id (FK → projects.id)
budget_source_type (enum: PROJECT_POOL, MANAGEMENT_SPECIAL, CAMPAIGN_SUPPORT)
allocated_amount
movement_id (FK → budget_movements.id — อ้างอิง movement ที่สร้างตอนตั้งงบ)
note
created_by (FK → users.id)
created_at
updated_at
UNIQUE(unit_id, budget_source_type) — 1 ยูนิตตั้งงบแต่ละแหล่งได้ 1 ครั้ง (เพิ่มได้ทีหลัง)
```

> **หมายเหตุ:** `UNIT_STANDARD` ไม่อยู่ใน enum ของตารางนี้ เพราะงบยูนิตมาจาก `project_units.standard_budget` อยู่แล้ว

> **หมายเหตุ 2:** ถ้าต้องการตั้งงบเพิ่มภายหลัง → สร้าง record ใหม่ + budget_movement ใหม่ → ยอดรวมคำนวณจาก SUM(movements)

---

## Budget Remaining Tracking

### ระดับยูนิต (แสดงใน Sales Entry — Section 2)

```
งบคงเหลือแต่ละแหล่ง = SUM(budget_movements WHERE unit_id AND source_type AND status='approved')
```

### ระดับโครงการ (แสดงใน Dashboard)

```
งบคงเหลือแต่ละแหล่ง = SUM(budget_movements WHERE project_id AND source_type AND status='approved')
```

> **กฎสำคัญ:** ไม่มี column `balance` ใดๆ ในระบบ ทุกยอดคงเหลือ derive จาก `budget_movements` เสมอ
