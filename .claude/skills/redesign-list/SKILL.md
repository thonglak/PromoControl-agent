---
name: redesign-list
description: Redesign or restructure a list/index page in PromoControl Angular to follow the standard list page layout — page header + actions, compact summary bar, filter bar, active-filter chips, bulk action bar, and a responsive table card (mobile cards + desktop mat-table). Use when asked to redesign, restructure, standardize, clean up, or build a list/table/index page. Modeled on the units list page.
---

Redesign a PromoControl list page so it follows the approved standard list layout.

The user points to a list page (or asks to build one). Read the target component's `.ts` + `.html`, then restructure it to match the canonical pattern below. Keep the page's own data/API logic — only the layout, structure, and styling change.

## Reference Implementation

The canonical pattern lives in the **units list** — always read it first as the ground truth:

- `frontend/src/app/features/master-data/units/unit-list/unit-list.component.ts`
- `frontend/src/app/features/master-data/units/unit-list/unit-list.component.html`

When this skill and the reference disagree, the reference wins. Copy its class strings verbatim.

## Page Structure (strict order)

```
1. Page wrapper          div p-4 sm:p-6, max-width 1440px, margin auto
2. Page header           <app-page-header> + actions slot
3. Inline panel          (optional) CSV import / expandable tools — collapsed by default
4. Summary bar           compact always-visible strip  → see /redesign-summary
5. Filter bar            white card, reactive form
6. Active filter chips   shown only when hasActiveFilters()
7. Bulk action bar       shown only when rows are selected
8. Table card            <app-section-card [noPadding]="true">
                           ├── loading overlay
                           ├── mobile card list   (md:hidden)
                           ├── desktop mat-table  (hidden md:block)
                           ├── empty state        (inbox icon)
                           └── paginator          (hidden md:block)
```

Never reorder these. The summary bar is always **above** the filter bar.

## 1. Page Wrapper

```html
<div class="p-4 sm:p-6" style="max-width: 1440px; margin: 0 auto;">
  ...
</div>
```

Every page must be wrapped — without it the content stretches full-width.

## 2. Page Header

```html
<app-page-header title="ยูนิต" subtitle="จัดการยูนิตในโครงการ">
  <div actions class="flex flex-wrap items-center justify-end gap-2">
    <!-- column settings: icon-only -->
    <button mat-icon-button matTooltip="ตั้งค่าคอลัมน์" (click)="openTableSettings()"
            class="!text-slate-500 hover:!text-slate-700">
      <app-icon name="adjustments-horizontal" class="w-5 h-5" />
    </button>
    @if (canWrite()) {
      <!-- secondary actions: stroked, icon + label (label hidden on small screens) -->
      <button mat-stroked-button (click)="..." matTooltip="...">
        <app-icon name="arrow-up-tray" class="w-4 h-4 lg:mr-1" />
        <span class="hidden lg:inline">นำเข้า CSV</span>
      </button>
      <!-- primary action: flat, color=primary -->
      <button mat-flat-button color="primary" (click)="openCreate()" matTooltip="สร้างยูนิต">
        <app-icon name="plus" class="w-4 h-4 sm:mr-1" />
        <span class="hidden sm:inline">สร้างยูนิต</span>
      </button>
    }
  </div>
</app-page-header>
```

Rules: write actions gated by `canWrite()`; admin-only actions gated by `isAdmin()`. Primary action is the last button. Labels collapse to icon-only on small screens (`hidden sm:inline` for the primary, `hidden lg:inline` for secondaries).

## 5. Filter Bar

```html
<div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">
  <form [formGroup]="filterForm" class="flex flex-wrap gap-3 items-end">
    <mat-form-field appearance="outline" class="w-full sm:flex-1 sm:min-w-[260px]">
      <mat-label>ค้นหา</mat-label>
      <input matInput formControlName="search" placeholder="..." (input)="onFilterChange()">
      <app-icon matSuffix name="magnifying-glass" class="w-4 h-4 text-slate-400 mr-2" />
    </mat-form-field>
    <mat-form-field appearance="outline" class="w-full sm:w-auto sm:min-w-[200px]">
      <mat-label>สถานะ</mat-label>
      <mat-select formControlName="status" (selectionChange)="onFilterChange()">
        <mat-option value="">ทั้งหมด</mat-option>
        ...
      </mat-select>
    </mat-form-field>
  </form>
</div>
```

Search field flexes (`sm:flex-1`); selects are fixed-ish width. Every control calls `onFilterChange()` on input/selectionChange.

## 6. Active Filter Chips

Shown only when `hasActiveFilters()`. One chip per applied filter + a "ล้างทั้งหมด" reset button.

```html
@if (hasActiveFilters()) {
  <div class="flex flex-wrap items-center gap-2 mb-4 ml-1">
    <span class="text-xs text-slate-400">ตัวกรองที่ใช้:</span>
    @if (filterForm.get('search')?.value) {
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
        ค้นหา: {{ filterForm.get('search')?.value }}
      </span>
    }
    <!-- sort chip uses neutral slate instead of primary -->
    @if (sortRef?.active) {
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
        <app-icon name="arrows-up-down" class="w-3 h-3" /> เรียงตาม {{ sortRef?.active }}
      </span>
    }
    <button type="button" (click)="resetAll()"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors cursor-pointer">
      <app-icon name="x-mark" class="w-3 h-3" /> ล้างทั้งหมด
    </button>
  </div>
}
```

## 7. Bulk Action Bar

Shown only when `canWrite() && selectedIds().size > 0`.

```html
@if (canWrite() && selectedIds().size > 0) {
  <div class="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 px-4 py-2.5 rounded-lg border border-primary-300 bg-primary-100">
    <span class="text-sm font-medium text-primary-700">เลือก {{ selectedIds().size }} ยูนิต</span>
    <span class="hidden sm:block flex-1"></span>
    <button mat-flat-button color="primary" (click)="...">...</button>
    <button mat-stroked-button (click)="clearSelection()">ล้างการเลือก</button>
  </div>
}
```

Omit this block entirely if the page has no bulk actions.

## 8. Table Card

Wrap in `<app-section-card [noPadding]="true">` with a `relative` inner div for the loading overlay. The table has **two renderings** — mobile cards and a desktop mat-table.

```html
<app-section-card [noPadding]="true">
  <div class="relative">

    @if (loading()) {
      <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
        <mat-spinner diameter="36" />
      </div>
    }

    <!-- Mobile: card list -->
    <div class="md:hidden divide-y divide-slate-100">
      @for (u of rows(); track u.id) {
        <div class="p-4"> ... </div>
      }
      @if (!rows().length && !loading()) {
        <div class="text-center py-12 text-slate-400">
          <app-icon name="inbox" class="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p>ไม่พบข้อมูล...</p>
        </div>
      }
    </div>

    <!-- Desktop: table -->
    <div class="overflow-x-auto hidden md:block">
      <table mat-table [dataSource]="dataSource" matSort (matSortChange)="onSortChange($event)" class="w-full">
        <!-- header cell class (every column): -->
        <!-- !text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 -->
        <!-- numeric columns add !text-right to BOTH th and td -->
        <ng-container matColumnDef="...">
          <th mat-header-cell *matHeaderCellDef mat-sort-header
              class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">...</th>
          <td mat-cell *matCellDef="let u">...</td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns(); sticky: true" class="bg-slate-50"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns();"
            class="hover:bg-slate-50 border-b border-slate-100 even:bg-slate-50/40"></tr>
        <tr class="mat-row" *matNoDataRow>
          <td [attr.colspan]="displayedColumns().length" class="text-center py-12 text-slate-400">
            <app-icon name="inbox" class="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p>ไม่พบข้อมูล...</p>
          </td>
        </tr>
      </table>
    </div>

    <mat-paginator class="hidden md:block" [pageSizeOptions]="[25, 50, 100]" pageSize="25" showFirstLastButtons />
  </div>
</app-section-card>
```

Mobile card anatomy: identity row (code + status chip + edit/delete icon buttons), then a `grid grid-cols-2 gap-x-4 gap-y-2.5` of label/value pairs (`text-xs text-slate-400` label, `text-xs tabular-nums` value).

## TypeScript Structure

```ts
const TABLE_ID = 'xxx-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'code',   label: 'รหัส', visible: true },
  ...
  { key: 'actions', label: 'จัดการ', visible: true, locked: true },
];
```

State signals: `loading`, a rows signal for mobile cards, `summary`, `selectedIds = signal<Set<number>>(new Set())`.

- **Table config** — `TableConfigService`: `columnDefs` signal, `displayedColumns` computed = visible keys (prepend `'select'` only when `canWrite()`). `openTableSettings()` opens `TableSettingsDialogComponent`.
- **Data** — `MatTableDataSource`, wire `MatSort` / `MatPaginator` via `@ViewChild` setters.
- **Filter persistence** — load saved filters + sort in `ngOnInit` via `tblCfg.loadFilters(TABLE_ID)`; `onFilterChange()` / `onSortChange()` save then reload.
- **Summary** — `computeSummary(rows)` returns the counts/totals object the summary bar binds to. Do not change existing summary math.
- **Multi-select** — `isSelected`, `toggleRow`, `allSelected`, `someSelected`, `toggleAll`, `clearSelection`; clear selection whenever data reloads.
- **Roles** — `isAdmin` / `canWrite` computed; gate write & admin actions.
- **Helpers** — `hasActiveFilters()`, `resetAll()`, `formatCurrency()`, status label/class maps.

## Color & Typography Rules

- Numeric / currency cells: `tabular-nums`, right-aligned in tables.
- Codes / identifiers: `font-mono font-semibold text-slate-800`.
- Cost values (ต้นทุน, ค่าใช้จ่าย): red — `text-red-600` or `style="color:#DC2626"`.
- Budget values (งบ): blue — `text-blue-600` or `style="color:#0284C7"`.
- Default values: `text-slate-800`; secondary: `text-slate-600`; muted/placeholder: `text-slate-400`.
- Empty values render as `—`.
- Status uses `<app-status-chip>` where a chip type exists.

## Execution Steps

1. Read the units-list `.ts` + `.html` (reference) and the target page's `.ts` + `.html`.
2. Identify which sections the target already has vs. is missing or out of order.
3. Restructure the `.html` to the strict 8-section order; move the summary bar above the filter bar.
4. Apply the reference's class strings exactly; replace inline `style="color:..."` only where the rules above allow the two known cost/budget hex values.
5. Add missing TS pieces (filter persistence, `hasActiveFilters`, `resetAll`, multi-select, `displayedColumns`) — reuse the reference's method bodies.
6. Keep the page's data shape, API calls, and business math unchanged.
7. Build (`docker compose exec promo_frontend npx ng build --configuration development`) and fix any errors.

## What NOT to do

- Do NOT place the summary bar below the filter bar.
- Do NOT skip the mobile card list — every list page needs both renderings.
- Do NOT use `mat-card` for the table — use `<app-section-card [noPadding]="true">`.
- Do NOT change the summary signal shape or `computeSummary()` math.
- Do NOT change API calls, data models, or business logic.
- Do NOT add expand/collapse to the summary bar (see `/redesign-summary`).
- Do NOT show write/admin actions without `canWrite()` / `isAdmin()` gating.
- Do NOT drop the page wrapper (`p-4 sm:p-6`, max-width 1440px).
