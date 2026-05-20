---
name: redesign-summary
description: Redesign a summary/stats bar in PromoControl Angular pages. Replaces collapsible/large-number summary bars with a compact, always-visible horizontal strip. Use when asked to redesign, clean up, or simplify a summary bar, KPI strip, or stats row on any list/dashboard page.
---

Redesign a summary bar component on a PromoControl Angular page following the approved compact strip pattern.

The user points to a page or component. Read the current summary bar HTML and TS, then replace it with a clean always-visible horizontal strip.

## The Approved Pattern

### Visual Design
- **Always visible** — no expand/collapse toggle, no chevron button
- **Compact number size** — `text-sm font-semibold tabular-nums` (NOT `text-2xl` or `text-lg`)
- **Small uppercase label** — `text-[11px] font-medium text-slate-400 uppercase tracking-wide leading-none`
- **Color coding**:
  - Default values: `text-slate-800`
  - Negative/cost values (ต้นทุน, ค่าใช้จ่าย): `text-red-600`
  - Budget/plan values (งบประมาณ): `text-blue-600`
  - Profit/positive values: `text-green-600`
- **Container**: `bg-white rounded-lg border border-slate-200 overflow-hidden`

### Responsive Layout
```
Desktop (≥ sm): single flex row, divide-x dividers between cells
Mobile (< sm):  2-col wrap, border-b on top rows, border-r on left-col items
Last item on mobile spans full width (col-span or w-full) if count is odd
```

### HTML Template
```html
<!-- Summary Bar -->
<div class="mb-4 bg-white rounded-lg border border-slate-200 overflow-hidden">
  <div class="flex flex-wrap sm:flex-nowrap sm:divide-x sm:divide-slate-100">

    <!-- COUNT metric with unit label -->
    <div class="w-1/2 sm:flex-1 px-4 py-3 flex flex-col gap-0.5 border-b border-r border-slate-100 sm:border-b-0 sm:border-r-0">
      <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wide leading-none">จำนวนยูนิต</span>
      <div class="flex items-baseline gap-1 mt-1.5">
        <span class="text-sm font-semibold tabular-nums text-slate-800">{{ summary().count | number:'1.0-0' }}</span>
        <span class="text-xs text-slate-400">ยูนิต</span>
      </div>
    </div>

    <!-- CURRENCY metric (plain) -->
    <div class="w-1/2 sm:flex-1 px-4 py-3 flex flex-col gap-0.5 border-b border-slate-100 sm:border-b-0">
      <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wide leading-none">ราคาขายรวม</span>
      <span class="text-sm font-semibold tabular-nums text-slate-800 mt-1.5">฿{{ summary().basePrice | number:'1.0-0' }}</span>
    </div>

    <!-- CURRENCY metric (red = cost) -->
    <div class="w-1/2 sm:flex-1 px-4 py-3 flex flex-col gap-0.5 border-r border-slate-100 sm:border-r-0">
      <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wide leading-none">ต้นทุนรวม</span>
      <span class="text-sm font-semibold tabular-nums text-red-600 mt-1.5">฿{{ summary().unitCost | number:'1.0-0' }}</span>
    </div>

    <!-- CURRENCY metric (blue = budget) — last item full-width on mobile if odd -->
    <div class="w-full sm:flex-1 px-4 py-3 flex flex-col gap-0.5 border-t border-slate-100 sm:border-t-0">
      <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wide leading-none">งบมาตรฐานรวม</span>
      <span class="text-sm font-semibold tabular-nums text-blue-600 mt-1.5">฿{{ summary().standardBudget | number:'1.0-0' }}</span>
    </div>

  </div>
</div>
```

### Mobile border rules (per cell position in a 2-col grid)
| Position | Classes to add |
|---|---|
| Left column, NOT last row | `border-r border-b border-slate-100` |
| Right column, NOT last row | `border-b border-slate-100` |
| Left column, last row | `border-r border-slate-100` |
| Right column, last row | _(no extra border)_ |
| Full-width last item (odd count) | `border-t border-slate-100 sm:border-t-0` |

Desktop overrides for all cells: `sm:border-b-0 sm:border-r-0` — the parent's `sm:divide-x` handles separators.

### TypeScript cleanup
Remove any `signal` or state that was only used for the old expand/collapse toggle:
```ts
// DELETE — no longer needed:
summaryExpanded = signal(false);
```

## Page Layout Order

Always place the Summary Bar **above** the filter bar:

```
Header
Summary Bar      ← อยู่บน filter bar เสมอ
Filter bar
Active filter chips
Table
```

## Execution Steps

1. **Read** the target component's `.html` and `.ts` files
2. **Identify** the current summary bar section (look for collapse/expand pattern, `summaryExpanded`, large number classes like `text-2xl`)
3. **Check position** — if the summary bar is below the filter bar, move it above
4. **Count** the metrics to determine mobile layout (even count = clean 2-col; odd count = last item spans full width)
5. **Map** each metric to the right color:
   - Count/quantity → slate-800 + unit label
   - Revenue/price → slate-800
   - Cost/expense → red-600
   - Budget → blue-600
   - Profit → green-600
6. **Replace** the summary bar HTML with the compact strip
7. **Remove** `summaryExpanded` signal from TS (if present)
8. **Verify** no template references to `summaryExpanded()` remain

## What NOT to do
- Do NOT use `text-2xl`, `text-xl`, or `text-lg` for metric values
- Do NOT add a toggle button, chevron, or expand/collapse behavior
- Do NOT add `mat-card` — use plain `div` with border/bg
- Do NOT use inline `style="..."` — Tailwind classes only
- Do NOT change the `summary` signal shape or `computeSummary()` logic
- Do NOT place the summary bar below the filter bar
