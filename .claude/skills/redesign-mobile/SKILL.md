---
name: redesign-mobile
description: Make a PromoControl Angular page work well on mobile/tablet. Applies the project's responsive conventions — fluid page wrapper, collapsing header actions, stacking grids, table→card switch, full-width form fields, and mobile-safe dialogs. Use when asked to redesign, fix, adapt, or check a page for mobile, make something responsive, or fix layout that breaks on small screens.
---

Redesign a PromoControl page so it is usable on phones and tablets, following the project's existing responsive conventions. Only layout and responsive classes change — data, API calls, and business logic stay untouched.

The user points to a page or component. Read its `.ts` + `.html`, find what breaks below the `md` breakpoint, and apply the patterns below.

## Breakpoints (Tailwind defaults)

| Prefix | Min width | Used in PromoControl for |
|---|---|---|
| _(none)_ | 0 | phone — the default; design mobile-first |
| `sm:` | 640px | large phone / small tablet — restore inline layouts, show labels |
| `md:` | 768px | the table card split — mobile cards below, `mat-table` at/above |
| `lg:` | 1024px | desktop — show secondary action labels |

Rule: write the **mobile** layout as the unprefixed default, then add `sm:`/`md:`/`lg:` to upgrade. Never the reverse (no `max-*` variants).

## Reference Implementations

Read these first as ground truth — copy their class strings verbatim:

- List page (table↔card, header, summary, filters): `frontend/src/app/features/master-data/units/unit-list/unit-list.component.html`
- App shell (sidenav drawer): `frontend/src/app/layout/app-layout/app-layout.component.{ts,html}`

When this skill and the reference disagree, the reference wins.

## The shell already handles itself

`AppLayoutComponent` switches `mat-sidenav` to overlay mode and auto-closes it on navigation when `BreakpointObserver` matches `Handset`/`TabletPortrait`. Do **not** add page-level logic for the sidebar — assume the menu is handled.

## 1. Page Wrapper — fluid, never fixed

```html
<div class="p-4 sm:p-6" style="max-width: 1440px; margin: 0 auto;">
```

Tighter padding on phones (`p-4`), roomier on `sm`. Every page needs this wrapper. Never set a fixed pixel width on the wrapper or any inner block — use `w-full` + `max-w-*`.

## 2. Header Actions — collapse to icons

Buttons keep their icon always; the text label hides on small screens.

```html
<div actions class="flex flex-wrap items-center justify-end gap-2">
  <!-- icon-only action: no label at all -->
  <button mat-icon-button matTooltip="ตั้งค่าคอลัมน์" (click)="openTableSettings()">
    <app-icon name="adjustments-horizontal" class="w-5 h-5" />
  </button>
  <!-- secondary action: label appears at lg -->
  <button mat-stroked-button (click)="...">
    <app-icon name="arrow-up-tray" class="w-4 h-4 lg:mr-1" />
    <span class="hidden lg:inline">นำเข้า CSV</span>
  </button>
  <!-- primary action: label appears at sm -->
  <button mat-flat-button color="primary" (click)="openCreate()">
    <app-icon name="plus" class="w-4 h-4 sm:mr-1" />
    <span class="hidden sm:inline">สร้างยูนิต</span>
  </button>
</div>
```

`flex-wrap` so actions wrap instead of overflowing. Primary label `hidden sm:inline`; secondary labels `hidden lg:inline`. Always keep a `matTooltip` so the icon-only state stays discoverable.

## 3. Grids & rows — stack on mobile

Any multi-column block must collapse to one (or two) columns on phones.

```html
<!-- form / detail grid: 1 col → 2 → 3 -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

<!-- compact label/value pairs (mobile card body): 2 cols is fine -->
<div class="grid grid-cols-2 gap-x-4 gap-y-2.5">

<!-- a horizontal row of controls/chips -->
<div class="flex flex-wrap gap-3 items-end">
```

Replace any `flex` row that holds 3+ items with `flex-wrap`, or with a `grid` that starts at `grid-cols-1`. Spacer elements that only matter on desktop get `hidden sm:block`.

## 4. Tables — mobile card list + desktop mat-table

`mat-table` does not fit a phone. Every data table needs **two renderings** sharing the same row data:

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
        <div class="p-4">
          <!-- identity row: code + status chip + edit/delete icon buttons -->
          <div class="flex items-start gap-2"> ... </div>
          <!-- detail pairs -->
          <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div class="min-w-0">
              <p class="text-xs text-slate-400 mb-0.5">ราคาขาย</p>
              <p class="text-xs tabular-nums font-medium text-slate-800 truncate">{{ formatCurrency(u.base_price) }}</p>
            </div>
            ...
          </div>
        </div>
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
      <table mat-table ...> ... </table>
    </div>

    <mat-paginator class="hidden md:block" [pageSizeOptions]="[25, 50, 100]" pageSize="25" showFirstLastButtons />
  </div>
</app-section-card>
```

Mobile card anatomy: identity row (`font-mono font-semibold` code + `<app-status-chip>` + icon-only edit/delete buttons), then a `grid grid-cols-2 gap-x-4 gap-y-2.5` of label/value pairs — label `text-xs text-slate-400`, value `text-xs tabular-nums ... truncate`. Every value cell wrapper gets `min-w-0` so `truncate` works.

If the page is a full list page, defer the whole table+header+filters job to `/redesign-list` instead — this skill covers the table block when it appears standalone (e.g. inside a detail page or dialog).

## 5. Forms — full-width fields

```html
<form [formGroup]="form" class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
  <mat-form-field appearance="outline" class="w-full">...</mat-form-field>
  <!-- a field that should span the whole row -->
  <mat-form-field appearance="outline" class="w-full sm:col-span-2">...</mat-form-field>
</form>
```

Every `mat-form-field` gets `class="w-full"` — never a fixed width. Filter bars: search field `w-full sm:flex-1 sm:min-w-[260px]`, selects `w-full sm:w-auto sm:min-w-[200px]`. Form action buttons go in a `flex flex-wrap justify-end gap-2` footer; on phones make the primary button full-width if it stands alone (`w-full sm:w-auto`).

## 6. Dialogs — fit the viewport

`MatDialog` config:

```ts
this.dialog.open(SomeDialogComponent, {
  width: '500px',
  maxWidth: '95vw',     // ← required; without it a fixed width overflows phones
  maxHeight: '90vh',
  ...
});
```

Inside the dialog: `<mat-dialog-content>` scrolls on its own — keep content in a `grid grid-cols-1 sm:grid-cols-2` so it stacks. Dialog action rows use `flex flex-wrap`.

## 7. Summary / KPI bars

Already a solved pattern — see `/redesign-summary`. The strip is `flex-wrap sm:flex-nowrap`: 2-col wrap on phones, single divided row on `sm+`. If the target page has a summary bar that is not responsive, apply `/redesign-summary`.

## Common breakage to look for

- Fixed widths: `style="width:..."`, `w-[700px]`, `min-w-[...]` without a `w-full` fallback.
- `flex` rows with 3+ children and no `flex-wrap` → overflow / horizontal scroll.
- A bare `mat-table` with no mobile card list.
- `grid-cols-3` / `grid-cols-4` with no `grid-cols-1` base.
- `mat-form-field` without `w-full`.
- `mat-dialog` opened with a fixed `width` and no `maxWidth`.
- Action buttons in a non-wrapping row.
- Long text/codes with no `truncate` + `min-w-0` parent.
- Horizontal padding too large for phones (`p-8`, `px-10`) — drop to `p-4 sm:p-6/8`.

## Execution Steps

1. Read the target component's `.ts` + `.html`, and the units-list reference.
2. List every breakage from the section above — note line numbers.
3. Fix mobile-first: unprefixed = phone layout, add `sm:`/`md:`/`lg:` to upgrade.
4. For data tables, add the `md:hidden` mobile card list mirroring the table columns.
5. For dialogs, add `maxWidth: '95vw'` and stack the content grid.
6. Keep all data bindings, API calls, signals, and business math unchanged.
7. Build: `docker compose exec promo_frontend npx ng build --configuration development` — fix any errors.
8. If practical, verify at a phone width (~375px) via the `/verify` skill or Playwright (`webapp-testing`).

## What NOT to do

- Do NOT use `max-sm:` / `max-md:` variants — design mobile-first with min-width prefixes.
- Do NOT keep any fixed pixel width on a layout container — use `w-full` + `max-w-*`.
- Do NOT render a `mat-table` on mobile — always provide the card list.
- Do NOT add page-level sidebar/drawer logic — the app shell handles it.
- Do NOT change `computeSummary()` math, the `summary` signal shape, API calls, or data models.
- Do NOT drop the page wrapper (`p-4 sm:p-6`, max-width 1440px).
- Do NOT use inline `style` for layout — Tailwind classes only (the two cost/budget hex colors are the only allowed inline styles, per `/redesign-list`).
- Do NOT hide content on mobile to "fix" overflow — restructure it to stack instead.
