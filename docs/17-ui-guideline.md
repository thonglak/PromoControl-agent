# UI Guideline สำหรับระบบอสังหา (PromoControl)

> **สถานะ:** Reference document สำหรับ Design Redesign
> **ใช้กับ:** Angular 21 + Angular Material 21 + Tailwind CSS 3
> **วันที่:** 2026-03-18

---

## 1. เป้าหมายของงานออกแบบ

ระบบอสังหาควรให้ความรู้สึก 4 อย่างพร้อมกัน:
- **น่าเชื่อถือ**
- **ดูเป็นมืออาชีพ**
- **ใช้งานง่ายแม้ข้อมูลเยอะ**
- **อ่านตัวเลข ราคา และสถานะได้เร็ว**

UI ไม่ควรแฟนซีเกินไป แต่ต้อง **สะอาด มีลำดับสายตาชัด** และมีความพรีเมียมแบบองค์กร

---

## 2. Brand Personality

บุคลิกของ UI: **Professional + Premium + Clean + Calm**

| บุคลิก | คำอธิบาย |
|--------|----------|
| Professional | เหมาะกับระบบองค์กร |
| Premium | สื่อถึงมูลค่าสินทรัพย์สูง |
| Clean | ข้อมูลเยอะแต่ไม่รก |
| Calm | ใช้งานทั้งวันแล้วไม่ล้าตา |

**ควรหลีกเลี่ยง:**
- สีสดจัดเกินไป
- card แน่นเกินไป
- ปุ่มหลายสีในหน้าเดียว
- shadow หนัก
- ไอคอนหลายสไตล์ปนกัน

---

## 3. Color System

### 3.1 Primary Palette (Corporate Real Estate)

| ชื่อ | Hex | การใช้งาน |
|------|-----|----------|
| Primary 900 | `#16324F` | app bar, ปุ่มหลัก, active tab |
| Primary 700 | `#1F4B73` | selected menu, highlight |
| Primary 500 | `#2F6EA3` | links, secondary action |
| Primary 100 | `#DCEAF6` | background tint, hover |

### 3.2 Secondary / Accent (Premium)

| ชื่อ | Hex | การใช้งาน |
|------|-----|----------|
| Accent Gold | `#C8A96B` | badge พรีเมียม, icon highlight |
| Accent Warm | `#B88A44` | section สำคัญ |
| Accent Light | `#F4E9D7` | chart accent, subtle background |

### 3.3 Neutral Palette

| ชื่อ | Hex |
|------|-----|
| Gray 900 | `#1F2937` |
| Gray 700 | `#374151` |
| Gray 500 | `#6B7280` |
| Gray 300 | `#D1D5DB` |
| Gray 200 | `#E5E7EB` |
| Gray 100 | `#F3F4F6` |
| Gray 50 | `#F8F9FB` |
| White | `#FFFFFF` |

### 3.4 Semantic Colors

| ชื่อ | Hex | การใช้งาน |
|------|-----|----------|
| Success | `#2E7D32` | สถานะสำเร็จ, กำไร |
| Warning | `#ED6C02` | รอดำเนินการ, ส่วนลด |
| Error | `#D32F2F` | ข้อผิดพลาด, ยกเลิก, ขาดทุน |
| Info | `#0288D1` | ข้อมูล, งบคงเหลือ |

### 3.5 พื้นหลังที่แนะนำ

| ส่วน | Hex |
|------|-----|
| App background | `#F6F8FB` |
| Card background | `#FFFFFF` |
| Section tint | `#FAFBFC` |

> **หลักสำคัญ:** อย่าให้ทั้งหน้าขาวล้วนจนแบน ควรมี layer ของพื้นหลังอ่อนๆ ช่วยแยก section

---

## 4. Typography

### 4.1 ฟอนต์ที่แนะนำ

สำหรับภาษาไทย: **Noto Sans Thai** (แนะนำหลัก), IBM Plex Sans Thai, Prompt, Sarabun

### 4.2 Typographic Scale

| ประเภท | ขนาด | น้ำหนัก |
|--------|------|---------|
| Page Title | 28px | 700 |
| Section Title | 22px | 600 |
| Card Title | 18px | 600 |
| Body Large | 16px | 400 |
| Body Normal | 14px | 400 |
| Caption | 12px | 400 |
| KPI Number | 28–36px | 700 |
| Table Text | 13–14px | 400 |

### 4.3 หลักการ

- หัวข้อใหญ่ต้องชัด แต่ไม่ต้องใหญ่เกิน
- ตัวเลขราคาและมูลค่าต้องเด่นกว่าข้อความทั่วไป
- หลีกเลี่ยงการใช้ font หลายแบบในระบบเดียว
- ระยะบรรทัดควรโปร่ง อ่านง่าย

---

## 5. Spacing System

Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48

| การใช้งาน | ระยะ |
|----------|------|
| ภายใน card | 16 หรือ 24 |
| ระหว่าง section | 24 หรือ 32 |
| ระหว่าง field | 12 หรือ 16 |

> อย่าใช้ระยะมั่ว เช่น 7, 13, 19 แบบไม่มีระบบ

---

## 6. Shape & Elevation

### 6.1 Border Radius

| ส่วน | Radius |
|------|--------|
| Input / Button | 10px |
| Card | 16px |
| Dialog | 20px |
| Chip | 999px |

### 6.2 Shadow

- Card ปกติ: shadow บางมาก
- Hover: เพิ่มขึ้นเล็กน้อย
- Dialog: ชัดขึ้นได้
- **อย่าใช้เงาหนักแบบ e-commerce หรือ gaming dashboard**

---

## 7. Layout Principles

### 7.1 Page Structure

ทุกหน้าควรมีโครง:
1. Page Header
2. Toolbar / Filters
3. Main Content
4. Sticky Summary หรือ Action Bar (ถ้าจำเป็น)

### 7.2 Content Width

| Device | Width |
|--------|-------|
| Desktop | max-width 1280px หรือ 1440px |
| Large dashboard | full width (มี gutter ชัด) |
| Mobile | padding 16px |

### 7.3 Grid

| Device | Columns |
|--------|---------|
| Desktop | 12-column |
| Tablet | 8-column |
| Mobile | 4-column |

---

## 8. Navigation

### 8.1 Main Navigation

- Sidebar + Topbar (desktop)
- Drawer (mobile)

### 8.2 เมนู Active State

- background tint
- แถบสี primary ด้านซ้าย
- icon และ text เป็นสี primary

---

## 9. Page Types — Pattern มาตรฐาน

### 9.1 Dashboard Page

- Header สรุป
- KPI cards 4–6 ใบ (ยอดขาย, Unit คงเหลือ, งบโปรโมชั่น, รออนุมัติ, ส่วนลดสะสม)
- Charts
- ตารางรายการล่าสุด
- Activity / approval / alerts

### 9.2 List / Table Page

- title + action button
- search, filter chips, sort
- export / download
- pagination, sticky header

### 9.3 Detail Page

- header card
- information sections
- related records
- timeline / activity
- attachments

### 9.4 Form Page

แบ่ง section ชัด: ข้อมูลลูกค้า, ข้อมูลยูนิต, ส่วนลด/ของแถม, การคำนวณ, สถานะอนุมัติ, หมายเหตุ/เอกสาร

---

## 10. Card Design

### 10.1 KPI Card

- ชื่อ metric
- ตัวเลขหลัก
- trend หรือ comparison
- icon
- คำอธิบายสั้น

### 10.2 Summary Card

เหมาะกับหน้าบันทึกขาย: ราคาขาย, ส่วนลดเงินสด, ของแถม, งบที่ใช้, งบคงเหลือ, กำไรขั้นต้น
ควรทำเป็น **card เด่นหรือ sticky panel**

### 10.3 Property Card

รูปภาพ, รหัสยูนิต, แบบบ้าน, พื้นที่, ราคา, สถานะ, promotion badge

---

## 11. Form Guideline

### 11.1 Form Layout

- **Single column sectioned** — เหมาะกับ mobile และฟอร์มยาว
- **Two-column with summary side panel** — เหมาะกับ desktop (หน้าบันทึกขาย)

### 11.2 Form Rules

- label ต้องชัด
- placeholder ใช้เฉพาะช่วยอธิบาย ไม่ใช่แทน label
- field ที่อ่านอย่างเดียวควรแยกจาก field ที่แก้ไขได้
- field จำนวนเงินควรชิดขวา
- field สำคัญควรมี helper text
- validation ต้องบอกตรงจุด

### 11.3 Form Section ที่ใช้บ่อย

Basic Info, Pricing, Discount & Promotion, Gift Items, Approval, Audit Info

---

## 12. Table Guideline

### 12.1 Table Style

- header background อ่อน
- row height ไม่แน่นเกิน
- hover ได้
- zebra row ใช้ได้แบบอ่อนมาก
- number align right
- action column อยู่ขวาสุด

### 12.2 การแสดงสถานะในตาราง

ใช้ chip/tag แทน text ล้วน — สีต้องคงที่ทั้งระบบ

---

## 13. Status System

| สถานะ | สี |
|-------|-----|
| Available | เทา/เขียวอ่อน |
| Reserved | ฟ้า |
| Pending Approval | ส้ม |
| Approved | เขียว |
| Rejected | แดง |
| Cancelled | เทาเข้ม |

> อย่าใช้สีอย่างเดียว ควรมี text ด้วย, สีต้องคงที่ทั้งระบบ

---

## 14. Buttons & Actions

### Action Hierarchy (ลำดับความเด่น)

1. Primary filled button
2. Secondary outlined button
3. Text button
4. Icon button

> อย่าให้ทุกปุ่มเด่นเท่ากัน, ใช้แค่ 1 primary action ต่อ section

---

## 15. Dialog / Drawer

- dialog ไม่ควรกว้างเกิน
- ข้อมูลเยอะใช้ side drawer จะดีกว่า
- action button ต้องอยู่ตำแหน่งคาดเดาได้

---

## 16. Icons

ใช้ไอคอนชุดเดียวทั้งระบบ (PrimeIcons สำหรับ V2)

ไอคอนที่เข้ากับอสังหา: home, apartment, location_city, meeting_room, payments, receipt_long, inventory_2, request_quote, fact_check, approval, groups, engineering

---

## 17. Charts & Data Visualization

ประเภทที่เหมาะ:
- **line chart:** แนวโน้มยอดขาย
- **bar chart:** เปรียบเทียบแต่ละโครงการ
- **stacked bar:** สถานะ unit
- **donut chart:** สัดส่วนโปรโมชั่น
- **progress bar:** การใช้งบ

กฎ: ใช้สีไม่เกิน 4–5 สีหลัก, เน้นตัวเลขสำคัญรอบ chart, อย่าใส่ chart เยอะจนดูเหมือน BI tool

---

## 18. Empty State

ควรมี: icon, ข้อความสั้น, คำอธิบาย, ปุ่ม action ที่เหมาะ

ตัวอย่าง: "ยังไม่มีรายการขาย", "ยังไม่มีเอกสารแนบ", "ยังไม่มีรายการรออนุมัติ"

---

## 19. Responsive Design

| Device | แนวทาง |
|--------|--------|
| Desktop | table เต็ม, summary side panel, multi-column form |
| Tablet | ลดจำนวนคอลัมน์, card stack, drawer แทน sidebar |
| Mobile | KPI 1-2 คอลัมน์, table → card list, sticky action bar |

---

## 20. Real Estate-specific UI Patterns

### 20.1 Sales Entry Pattern

1. ข้อมูลลูกค้าและยูนิต
2. ส่วนลด / ของแถม / โปรโมชั่น
3. Summary การเงินแบบ sticky

### 20.2 Approval Pattern

- current request summary
- เหตุผล
- ผลกระทบทางการเงิน
- approval history
- ปุ่ม approve / reject เด่นชัด

### 20.3 Inventory Pattern

- filter ตามโครงการ/เฟส/ประเภท
- view แบบ table และ card
- แสดงสถานะเด่น
- เลือกหลายรายการได้ (batch)

---

## 21. Tone of Text

ข้อความในระบบควรเป็น **ทางการแบบเข้าใจง่าย**

ตัวอย่างที่ดี:
- "บันทึกรายการสำเร็จ"
- "ส่งคำขออนุมัติเรียบร้อยแล้ว"
- "กรุณาระบุจำนวนส่วนลด"
- "ไม่พบข้อมูลในช่วงวันที่เลือก"

หลีกเลี่ยง: คำสั้นเกินจนแข็ง, ภาษาไม่สม่ำเสมอ, ปุ่มที่ใช้คำไม่เหมือนกัน (เช่น "บันทึก" ปนกับ "Save")

---

## 22. Design Tokens

```scss
:root {
  /* Colors */
  --color-primary: #16324F;
  --color-primary-700: #1F4B73;
  --color-primary-500: #2F6EA3;
  --color-primary-100: #DCEAF6;
  --color-accent: #C8A96B;
  --color-accent-warm: #B88A44;
  --color-accent-light: #F4E9D7;
  --color-bg: #F6F8FB;
  --color-surface: #FFFFFF;
  --color-section: #FAFBFC;
  --color-border: #E5E7EB;
  --color-text-primary: #1F2937;
  --color-text-secondary: #6B7280;

  /* Semantic */
  --color-success: #2E7D32;
  --color-warning: #ED6C02;
  --color-error: #D32F2F;
  --color-info: #0288D1;

  /* Shape */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 999px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Shadow */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.12);
}
```

---

## 23. Reusable Components ที่ควรมี

สำหรับ PrimeNG (V2):
- app-page-header
- app-section-card
- app-stat-card (KPI)
- app-financial-tag (status chip)
- app-summary-panel (sticky)
- app-empty-state
- app-filter-toolbar
- app-currency-display (pipe)
- app-property-card
- app-approval-timeline

---

## 24. Dark Mode

ลำดับที่แนะนำ:
1. ทำ light theme ให้แข็งแรงก่อน
2. ค่อยทำ dark theme ภายหลัง

---

## 25. Theme Direction — Real Estate Corporate Premium

- พื้นหลังเทาอ่อน (`#F6F8FB`)
- card สีขาว
- primary สีกรมท่า (`#16324F`)
- accent สีทองอ่อน (`#C8A96B`)
- typography เรียบ ชัด
- chip สีสุภาพ
- dashboard โปร่ง
- form เป็น section card
- summary panel เด่นแต่ไม่ฉูดฉาด

---

## สรุป 10 ข้อหลัก

1. ใช้โทนสี corporate real estate
2. ให้ card และ section ชัดเจน
3. ใช้ spacing เป็นระบบ
4. ตัวเลขราคาและมูลค่าต้องเด่น
5. form ต้องแบ่ง section ไม่ยาวเป็นพรืด
6. table ต้องอ่านง่ายและมี status chip
7. หน้าบันทึกขายต้องมี summary panel
8. ทุกหน้าใช้ component กลางร่วมกัน
9. mobile ต้องอ่านง่าย ไม่ยัด table เต็ม
10. ความสวยต้องมาคู่กับการใช้งานเร็ว
