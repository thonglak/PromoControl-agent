# UI Theme & UX Design Specification

## Purpose

This document defines the UI/UX design system for the Promotion & Budget Management System.

> **Updated:** 2026-03-18 — Redesigned to Corporate Navy theme
> **Full guideline:** See `docs/17-ui-guideline.md` for comprehensive design reference

## Technology Stack

Frontend: Angular 21 (standalone components)
UI library: Angular Material 21 (M3 theming)
CSS framework: Tailwind CSS 3
Icons: Custom SvgIconComponent (Heroicons inline SVG) — `<app-icon name="...">`
Build: Node 22 via Docker

---

# Design Concept

Theme: **Real Estate Corporate Premium**

Principles: Professional, Premium, Clean, Calm
- ข้อมูลเยอะแต่ไม่รก
- ตัวเลขราคาและมูลค่าต้องเด่น
- ใช้งานทั้งวันไม่ล้าตา

---

# Color Palette

## Primary (Corporate Navy)

| Name | Hex | Usage |
|------|-----|-------|
| Primary 900 | `#16324F` | app bar, ปุ่มหลัก, active tab |
| Primary 700 | `#1F4B73` | selected menu, highlight |
| Primary 500 | `#2F6EA3` | links, secondary action |
| Primary 300 | `#6FA3D4` | subtle accent |
| Primary 100 | `#DCEAF6` | background tint, hover |

## Accent (Gold / Premium)

| Name | Hex | Usage |
|------|-----|-------|
| Accent | `#C8A96B` | badge พรีเมียม, active indicator |
| Accent Warm | `#B88A44` | section สำคัญ |
| Accent Light | `#F4E9D7` | subtle background |

## Neutral

| Name | Hex |
|------|-----|
| Gray 900 | `#1F2937` |
| Gray 700 | `#374151` |
| Gray 500 | `#6B7280` |
| Gray 300 | `#D1D5DB` |
| Gray 200 | `#E5E7EB` |
| Gray 100 | `#F3F4F6` |
| Gray 50 | `#F8F9FB` |

## Financial Colors

| Purpose | Hex | CSS Variable |
|---------|-----|--------------|
| Profit / กำไร | `#2E7D32` | `var(--color-profit)` |
| Loss / ขาดทุน | `#D32F2F` | `var(--color-loss)` |
| Discount / ส่วนลด | `#ED6C02` | `var(--color-discount)` |
| Budget / งบ | `#0288D1` | `var(--color-budget)` |

## Surfaces

| Surface | Hex |
|---------|-----|
| App background | `#F6F8FB` |
| Card / Surface | `#FFFFFF` |
| Section tint | `#FAFBFC` |
| Border | `#E5E7EB` |

---

# Typography

Font stack: `Inter, Noto Sans Thai, system-ui, sans-serif`

| Type | Size | Weight | CSS Variable |
|------|------|--------|--------------|
| Page Title | 28px | 700 | `--font-size-page-title` |
| Section Title | 22px | 600 | `--font-size-section-title` |
| Card Title | 18px | 600 | `--font-size-card-title` |
| Body Large | 16px | 400 | `--font-size-body-lg` |
| Body | 14px | 400 | `--font-size-body` |
| Caption | 12px | 400 | `--font-size-caption` |
| KPI Number | 32px | 700 | `--font-size-kpi` |
| Table | 13px | 400 | `--font-size-table` |

---

# Shape & Elevation

## Border Radius

| Element | Radius | CSS Variable |
|---------|--------|--------------|
| Button / Input | 10px | `--radius-md` |
| Card | 16px | `--radius-lg` |
| Dialog | 20px | `--radius-xl` |
| Chip | 999px | `--radius-full` |

## Shadow

| Level | Usage | CSS Variable |
|-------|-------|--------------|
| sm | Card default | `--shadow-sm` |
| md | Card hover | `--shadow-md` |
| lg | Dialog | `--shadow-lg` |

---

# Spacing

Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48

| Usage | Size |
|-------|------|
| Card padding | 24px (`--space-6`) |
| Section gap | 24-32px |
| Field gap | 12-16px |

---

# Design Tokens

All values defined in `src/styles/_design-tokens.scss` as CSS custom properties.

Reference: `--color-*`, `--radius-*`, `--shadow-*`, `--space-*`, `--font-size-*`

---

# Shared Components

| Component | Usage |
|-----------|-------|
| `app-page-header` | ทุกหน้า: title + subtitle + action slot |
| `app-section-card` | Wrap content: radius 16px, shadow sm, padding 24px |
| `app-stat-card` | KPI card: 32px number, icon circle, 6 variants |
| `app-status-chip` | Status display: consistent colors, 9+ types |
| `app-empty-state` | Empty table/list: icon, title, description, action |
| `CurrencyDisplayPipe` | Format: `{{ value \| currencyDisplay }}` -> `฿1,500,000` |
| `CurrencyFieldComponent` | Form input: ฿ prefix, right-align, format on blur |

---

# Angular Material Theme

M3 theming with custom palettes:
- Primary: Corporate Navy tonal palette (900=#16324F)
- Tertiary: Gold Accent tonal palette (400=#C8A96B)

Defined in `src/styles.scss`.

---

# Layout Structure

- Sidebar: Navy gradient (#16324F -> #1F4B73), white text, Gold active bar
- Topbar: White, shadow-sm, 64px height, Navy breadcrumb
- Content: max-width 1440px, centered
- Every page: `app-page-header` -> Filters -> `app-section-card` content

---

# Sidebar Navigation

- Background: `linear-gradient(180deg, #16324F, #1F4B73)`
- Menu items: white text, Gold active indicator
- Section labels: white/40 uppercase
- Collapsed: 56px, icon only with tooltip

---

# Status Chip Types

Available in `app-status-chip`:

- `unit_status`: available, reserved, sold, transferred
- `transaction_status`: active, cancelled
- `movement_type`: ALLOCATE, USE, RETURN, ADJUST, etc.
- `movement_status`: pending, approved, rejected, voided
- `budget_source`: unit_standard, pool, executive, campaign
- `promotion_category`: discount, premium, expense_support
- `project_type`: condo, house, townhouse, mixed
- `project_status`: active, inactive, completed
- `user_role`: admin, manager, sales, finance, viewer
- `user_status`: active, inactive

---

# Icons

Custom SvgIconComponent using Heroicons. Use `<app-icon name="...">`.
Do NOT use `mat-icon` or `pi pi-*`.

---

# Mobile Design

- Sidebar collapses to drawer
- Cards stack vertically
- Tables scroll horizontally
- KPI cards: 1-2 columns
