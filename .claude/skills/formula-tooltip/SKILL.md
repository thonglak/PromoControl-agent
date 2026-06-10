---
name: formula-tooltip
description: Add an explanatory info-icon tooltip to a computed/derived value in a PromoControl Angular page. The tooltip shows the formula in words AND substitutes the live numbers so users understand where the result came from. Use when asked to add, explain, or annotate the source/ที่มา of a number, KPI, summary value, or calculated field with a tooltip.
---

Add a hover tooltip that explains how a displayed value is calculated — both the formula in Thai words and the actual numbers plugged in.

The user points to a value on a page (e.g. a dashboard row, a summary cell). Read the surrounding HTML to find the expressions that produce the value, then attach an info icon + multiline tooltip next to the label.

## The Approved Pattern

The tooltip has **two lines**:
1. Formula in words: `<ชื่อค่า> = <operand A> <op> <operand B>`
2. Live numbers: `<formatNumber(A)> <op> <formatNumber(B)> = <formatNumber(result)>`

### HTML Template
```html
<div class="flex items-center justify-between px-2 py-3 ...">
  <!-- 1) Declare each operand as a @let using the SAME expression the source row displays -->
  @let opAchieved = hasLegacy() ? combinedValueAchieved() : discountResult()!.value_achieved;
  @let opApproved = hasLegacyUnits() ? combinedApprovedProjectValue() : discountResult()!.approved_project_value;
  @let result = opAchieved - opApproved;

  <!-- 2) Label gets flex + gap-1 + the info icon -->
  <span class="text-body text-gray-700 flex items-center gap-1">
    มูลค่าส่วนต่าง
    <app-icon
      name="information-circle"
      class="w-4 h-4 text-gray-400 cursor-help"
      matTooltip="มูลค่าส่วนต่าง = มูลค่าโครงการที่ทำได้ − มูลค่าโครงการที่อนุมัติ&#10;{{ formatNumber(opAchieved) }} − {{ formatNumber(opApproved) }} = {{ formatNumber(result) }}"
      matTooltipClass="tooltip-multiline"
      matTooltipPosition="above" />
  </span>

  <!-- 3) Reuse the SAME @let in the value cell — never recompute -->
  <span class="text-body-lg font-semibold tabular-nums" [class.text-loss]="result < 0">
    {{ formatNumber(result) }}
  </span>
</div>
```

## Hard Rules

- **Newline** between the two lines = `&#10;` (HTML entity) inside the `matTooltip` string. A literal line break in the attribute will not render.
- **Multiline rendering** requires `matTooltipClass="tooltip-multiline"`. That class already exists in `src/styles.scss` (`white-space: pre-line`). Do NOT redefine it.
- **Use `formatNumber()`** for every number in the tooltip — same formatter the rows use, so the substituted values match what the user sees on screen exactly.
- **Mirror the source expression precisely.** Find the row that already displays each operand and copy its exact ternary (e.g. one operand may key off `hasLegacy()`, another off `hasLegacyUnits()` — keep them as-is, do not "fix" the inconsistency). This guarantees tooltip numbers add up to the displayed result.
- **Compute once with `@let`, reuse everywhere.** Declare operands + result as `@let` before the label, then reference them in both the tooltip and the value cell. Never duplicate the formula in two places — they will drift.
- **Minus sign:** use the typographic `−` (U+2212) to match existing labels, not the ASCII hyphen `-`.
- The `@let` declarations must sit inside the same view (the row `<div>`), before the elements that use them.

## Execution Steps

1. **Read** the target component `.html` and locate the value's display expression.
2. **Trace each operand** to the row that already shows it; copy that exact expression.
3. **Add `@let`** declarations for each operand and the result at the top of the row `<div>`.
4. **Wrap the label** in `<span class="... flex items-center gap-1">` and insert the `app-icon` + `matTooltip`.
5. **Refactor the value cell** to reference the result `@let` instead of recomputing.
6. **Confirm** `tooltip-multiline` exists in `src/styles.scss` (it should) — add it only if missing.
7. Leave coloring/business logic untouched unless the user asks.

## What NOT to do
- Do NOT hardcode numbers in the tooltip — always interpolate `formatNumber(...)`.
- Do NOT recompute the formula separately for the tooltip and the value — share one `@let`.
- Do NOT change the calculation, color classes, or `matTooltipPosition` of unrelated rows.
- Do NOT use `\n` or a real newline in the attribute — only `&#10;`.
- Do NOT invent a new tooltip CSS class when `tooltip-multiline` already covers it.
