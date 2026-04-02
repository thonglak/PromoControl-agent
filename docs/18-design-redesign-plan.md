# แผนปรับ Design ใหม่ — V1 (Angular Material)

> **เป้าหมาย:** ปรับ UI จาก "Finance Control Dashboard" (Blue) → "Real Estate Corporate Premium" (Navy + Gold)
> **Stack:** Angular 21 + Angular Material 21 + Tailwind CSS 3 (ไม่เปลี่ยน)
> **Backend:** ไม่แตะ
> **อ้างอิง:** docs/17-ui-guideline.md (UI Guideline ฉบับเต็ม)

---

## สรุปสิ่งที่เปลี่ยน

### 1. Color Palette

| รายการ | เดิม (V1) | ใหม่ (Redesign) |
|--------|----------|-----------------|
| Primary | `#2563EB` (Blue) | `#16324F` (Corporate Navy) |
| Primary 700 | - | `#1F4B73` |
| Primary 500 | - | `#2F6EA3` |
| Primary 100 | - | `#DCEAF6` |
| Secondary | `#64748B` | `#64748B` (คงเดิม) |
| **Accent Gold** | ไม่มี | `#C8A96B` (**ใหม่**) |
| Accent Warm | ไม่มี | `#B88A44` |
| Accent Light | ไม่มี | `#F4E9D7` |
| Background | `#F8FAFC` | `#F6F8FB` |
| Card | `#FFFFFF` | `#FFFFFF` (คงเดิม) |
| Border | `#E2E8F0` | `#E5E7EB` |
| Profit/Success | `#16A34A` | `#2E7D32` |
| Cost/Error | `#DC2626` | `#D32F2F` |
| Discount/Warning | `#F59E0B` | `#ED6C02` |
| Budget/Info | `#0284C7` | `#0288D1` |

### 2. Typography

| รายการ | เดิม | ใหม่ |
|--------|------|------|
| Page Title | 24px/700 | **28px/700** |
| Section Title | 18px/600 | **22px/600** |
| Card Title | - | **18px/600** (ใหม่) |
| Body | 14px/400 | 14px/400 (คงเดิม) |
| Caption | - | **12px/400** (ใหม่) |
| KPI Number | - | **28-36px/700** (ใหม่) |

### 3. Shape & Elevation

| รายการ | เดิม | ใหม่ |
|--------|------|------|
| Input radius | 4px | **10px** |
| Button radius | 4px | **10px** |
| Card radius | ~8px | **16px** |
| Dialog radius | ~8px | **20px** |
| Chip radius | default | **999px** (full round) |
| Shadow | Material default | **Custom เบา** |

### 4. Spacing

เดิม: ไม่มี scale ชัดเจน → ใหม่: 4, 8, 12, 16, 20, 24, 32, 40, 48

### 5. New Shared Components

| Component | หน้าที่ |
|-----------|--------|
| `app-page-header` | Header ทุกหน้า (title + breadcrumb + action) |
| `app-section-card` | Card wrapper สำหรับ section (border-radius 16px, shadow) |
| `app-stat-card` | KPI card (icon + number + trend + label) |
| `app-status-chip` | Status badge ที่ reuse ทั้งระบบ |
| `app-empty-state` | Empty state (icon + text + action) |
| `app-summary-panel` | Summary panel sticky (หน้า Sales Entry) |
| `app-currency-field` | mat-form-field + format เงิน + align right |

---

## Migration Phases

### Phase D-1: Theme & Design Tokens (0.5 วัน)

**เป้าหมาย:** เปลี่ยน color palette, typography, shape ทั้งระบบจากจุดเดียว

Tasks:
1. อัปเดต Angular Material theme → Corporate Navy palette
2. อัปเดต Tailwind config → colors, borderRadius, boxShadow, fontFamily
3. สร้าง CSS variables (design tokens) → `_design-tokens.scss`
4. อัปเดต global styles → background, font sizes, spacing
5. อัปเดต docs/06-ui-theme-design.md → reflect ค่าใหม่

**ผลลัพธ์:** ทั้ง app เปลี่ยนสีทันที — ปุ่ม, active state, sidebar, topbar

---

### Phase D-2: Shared Components (1 วัน)

**เป้าหมาย:** สร้าง/ปรับ reusable components ให้ตรง guideline

Tasks:
1. สร้าง `app-page-header` component
2. สร้าง `app-section-card` component
3. ปรับ `app-dashboard-card` → `app-stat-card` (KPI card ใหม่)
4. สร้าง `app-status-chip` component (แทน mat-chip ทั่วไป)
5. สร้าง `app-empty-state` component
6. ปรับ `app-summary-card` → summary panel ตาม guideline
7. สร้าง `app-currency-field` component

**ผลลัพธ์:** Component library พร้อมใช้ทั่ว app

---

### Phase D-3: Layout & Navigation Redesign (0.5 วัน)

**เป้าหมาย:** ปรับ layout, sidebar, topbar ให้ตรง guideline

Tasks:
1. Sidebar: พื้นหลัง Navy, active state แถบซ้าย, icon สี Navy
2. Topbar: ปรับสี + typography
3. Login page: background, card radius 20px, ปุ่ม Navy
4. Project selection: card radius 16px, hover shadow
5. Page structure: ตรวจทุกหน้ามี Page Header → Filters → Content → Actions

**ผลลัพธ์:** Layout ดูเป็น Corporate Real Estate Premium

---

### Phase D-4: Feature Pages Redesign (1-2 วัน)

**เป้าหมาย:** ปรับแต่ละ feature page ให้ใช้ shared components + สี/shape ใหม่

Tasks:
1. Dashboard: KPI cards → app-stat-card, chart colors, budget bars
2. Master Data (4 หน้า): table + dialog → section-card, radius, status-chip
3. Bottom Line: stepper + table → section-card wrapping
4. Budget pages: cards + table + chip → new palette
5. Sales Entry: summary panel, section cards, currency fields
6. Sales List/Detail: status chips, cancelled styling, banners
7. Reports: tab + table → chart colors, status tags
8. Settings + User Management: table + dialog → consistent styling
9. Empty states ทุกหน้า

**ผลลัพธ์:** ทุกหน้าสม่ำเสมอ ตรงตาม guideline

---

## Timeline

| Phase | งาน | ระยะเวลา |
|-------|------|---------|
| D-1 | Theme & Design Tokens | 0.5 วัน |
| D-2 | Shared Components | 1 วัน |
| D-3 | Layout & Navigation | 0.5 วัน |
| D-4 | Feature Pages | 1-2 วัน |
| | **รวม** | **~3-4 วัน** |

---

## หมายเหตุ

- ยังใช้ Angular Material เหมือนเดิม (ไม่เปลี่ยน UI library)
- ไม่เปลี่ยน business logic / API / TypeScript
- เปลี่ยนเฉพาะ: สี, ขนาดตัวอักษร, spacing, border-radius, shadow, component templates
- Tailwind config + CSS variables คือจุดเปลี่ยนหลัก — เปลี่ยนที่เดียวกระจายทั้ง app
