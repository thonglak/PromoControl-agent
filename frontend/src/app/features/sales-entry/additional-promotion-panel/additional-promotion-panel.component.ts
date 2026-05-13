import {
  Component, input, signal, computed, output, effect, untracked, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { EligibleItem } from '../services/sales-entry.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';

// ─── ข้อมูลงบแต่ละแหล่ง (ส่งเข้ามาจาก parent) ────────────────────────
export interface BudgetSourceInfo {
  key: string;
  label: string;
  allocated: number;
  remaining: number;
}

// ─── แถวใน Panel 3B ────────────────────────────────────────────────────
export interface PanelBRow {
  promotion_item_id: number | null;
  name: string;
  category: 'discount' | 'premium' | 'expense_support' | '';
  value_mode: string;
  max_value: number | null;
  calculated_value: number | null;
  used_value: number;
  funding_source_type: string;
  formula_display: string | null;
  applied_policy_name: string | null;
  fee_formula: any | null;
  effective_rate: number | null;
  effective_buyer_share: number | null;
  warnings: string[];
  remark: string;
  manual_input_value: number | null;
}

// ─── แหล่งงบ ──────────────────────────────────────────────────────────
// fixed = MANAGEMENT_SPECIAL ตลอด — PROJECT_POOL ถูกตัดออกจาก sales-entry
const DEFAULT_FUNDING_SOURCE = 'MANAGEMENT_SPECIAL';

@Component({
  selector: 'app-additional-promotion-panel',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule,
    MatButtonModule, MatTooltipModule, MatCheckboxModule, MatSlideToggleModule,
    SvgIconComponent, CurrencyMaskDirective,
  ],
  template: `
    <div class="section-card">
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between cursor-pointer" (click)="collapsed.set(!collapsed())">
        <h3 class="font-semibold m-0" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">
          ของแถมเพิ่มเติม (งบผู้บริหาร)
          <span class="text-sm font-normal ml-2" style="color: var(--color-gray-500)">
            เลือก {{ selectedCount() }} / {{ eligibleItems().length }} รายการ
          </span>
        </h3>
        <div class="flex items-center gap-2">
          @if (collapsed() && (selectedCount() > 0 || extraExpenseAmount() > 0)) {
            <span class="text-sm font-semibold tabular-nums" style="color: var(--color-text-primary)">฿{{ totalUsed() | number:'1.0-0' }}</span>
          }
          <app-icon [name]="collapsed() ? 'chevron-right' : 'chevron-down'" class="w-5 h-5" style="color: var(--color-gray-500)" />
        </div>
      </div>

      @if (!collapsed()) {
        @if (eligibleItems().length === 0 && staleSelectedRows().length === 0 && extraExpenseAmount() <= 0) {
          <div class="text-slate-400 text-sm py-4 text-center">ไม่มีรายการของแถมเพิ่มเติมที่ eligible</div>
        } @else {
          <!-- ── Toolbar: filter toggle ───────────────────────────────── -->
          @if (selectedCount() > 0) {
            <div class="flex items-center justify-end mt-3 mb-2" (click)="$event.stopPropagation()">
              <mat-slide-toggle
                [checked]="showSelectedOnly()"
                (change)="showSelectedOnly.set($event.checked)"
                class="!text-xs">
                แสดงเฉพาะที่เลือก
              </mat-slide-toggle>
            </div>
          }

          <!-- ── Stale rows section (item หลุดจาก eligible) ─────────── -->
          @if (staleSelectedRows().length > 0) {
            <div class="mb-3 p-3 rounded-lg border-2"
                 style="border-color: var(--color-error); background-color: var(--color-error-light, rgba(239,68,68,0.05))">
              <div class="flex items-center gap-2 mb-2 text-sm font-semibold" style="color: var(--color-error)">
                <app-icon name="exclamation-triangle" class="w-4 h-4" />
                รายการไม่ตรงเงื่อนไขแล้ว ({{ staleSelectedRows().length }})
              </div>
              <p class="text-xs mb-2" style="color: var(--color-gray-600)">
                รายการเหล่านี้ถูกเลือกไว้ แต่เงื่อนไขโครงการ/ยูนิตเปลี่ยนไปแล้ว — กรุณาตัดสินใจลบเอง
              </p>
              @for (row of staleSelectedRows(); track row.promotion_item_id) {
                <div class="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <div class="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                    <span class="font-medium truncate" style="color: var(--color-text-primary)">{{ row.name || '(ไม่ทราบชื่อ)' }}</span>
                    @if (row.category) {
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        [class]="categoryClass(row.category)">{{ categoryLabel(row.category) }}</span>
                    }
                    <span class="tabular-nums text-xs" style="color: var(--color-gray-500)">฿{{ row.used_value | number:'1.0-0' }}</span>
                  </div>
                  <button mat-icon-button class="!w-8 !h-8 flex-shrink-0"
                    (click)="removeStaleRow(row.promotion_item_id)" matTooltip="ลบรายการนี้">
                    <app-icon name="trash" class="w-4 h-4" style="color: var(--color-error)" />
                  </button>
                </div>
              }
            </div>
          }

          <!-- ── Transfer fee info (mode=as_premium) ─────────────────── -->
          @if (extraExpenseAmount() > 0) {
            <div class="mb-3 p-3 rounded-lg flex items-start gap-3"
              style="background-color: var(--color-primary-100); border: 1px solid var(--color-primary-300)">
              <app-icon name="banknotes" class="w-5 h-5 mt-0.5 flex-shrink-0" style="color: var(--color-primary-700)" />
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="text-sm font-semibold" style="color: var(--color-text-primary)">
                    ค่าธรรมเนียมโอนบวกเพิ่ม
                  </span>
                  <span class="text-base font-semibold tabular-nums" style="color: var(--color-text-primary)">
                    ฿{{ extraExpenseAmount() | number:'1.0-0' }}
                  </span>
                </div>
                <p class="text-xs mt-1 m-0" style="color: var(--color-gray-600)">
                  ตั้งค่าใน "ส่วนข้อมูลยูนิต" → วิธีคิดค่าธรรมเนียมโอน
                </p>
              </div>
            </div>
          }

          <!-- ── Item list (checkbox) ──────────────────────────────────── -->
          @if (displayList().length === 0) {
            <div class="text-slate-400 text-sm py-4 text-center">
              @if (showSelectedOnly()) {
                ยังไม่เลือกรายการใด — ลองปิด "แสดงเฉพาะที่เลือก"
              } @else {
                ไม่มีรายการของแถมเพิ่มเติมที่ eligible
              }
            </div>
          } @else {
            <div class="space-y-2 mt-2">
              @for (item of displayList(); track item.id) {
                @let row = rowMap().get(item.id);
                @let selected = !!row;
                <div class="border rounded-lg transition-colors"
                     [class.bg-white]="!selected"
                     [style.border-color]="selected ? 'var(--color-primary-500)' : 'var(--color-border)'"
                     [style.background-color]="selected ? 'var(--color-primary-50, rgba(59,130,246,0.04))' : ''"
                     style="border-radius: var(--radius-md)">

                  <!-- Header row: checkbox + name + chips -->
                  <label class="flex items-start gap-3 p-3 cursor-pointer select-none">
                    <mat-checkbox
                      [checked]="selected"
                      (change)="toggleItem(item, $event.checked)"
                      class="!mt-0.5"
                      (click)="$event.stopPropagation()" />
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-medium" style="color: var(--color-text-primary)">{{ item.name }}</span>
                        @if (item.category) {
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            [class]="categoryClass(item.category)">
                            {{ categoryLabel(item.category) }}
                          </span>
                        }
                        @if (item.applied_policy_name) {
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200"
                                [matTooltip]="'มาตรการที่ใช้: ' + item.applied_policy_name">
                            🏷 {{ item.applied_policy_name }}
                          </span>
                        }
                        <!-- มูลค่าสูงสุด (แสดงข้างชื่อ ก่อนเลือก ก็เห็น) -->
                        <span class="text-xs ml-auto tabular-nums" style="color: var(--color-gray-500)">
                          @if (item.value_mode === 'calculated' && item.calculated_value != null) {
                            สูงสุด ฿{{ item.calculated_value | number:'1.0-0' }}
                          } @else if (item.max_value != null) {
                            สูงสุด ฿{{ item.max_value | number:'1.0-0' }}
                          }
                        </span>
                      </div>
                      @if (item.formula_display) {
                        <div class="text-xs mt-0.5" style="color: var(--color-primary-500)"
                             [matTooltip]="item.formula_display">
                          ↳ {{ item.formula_display }}
                        </div>
                      }
                      @for (warn of item.warnings ?? []; track warn) {
                        <div class="text-xs mt-0.5 flex items-center gap-1" style="color: var(--color-warning)">
                          <app-icon name="exclamation-triangle" class="w-3 h-3" /> {{ warn }}
                        </div>
                      }
                    </div>
                  </label>

                  <!-- Expanded: fields grid (เมื่อ checked แล้ว) -->
                  @if (selected && row) {
                    @let i = rowIndexFor(row.promotion_item_id);
                    <div class="px-3 pb-3 pt-1" style="border-top: 1px dashed var(--color-border)">
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                        <!-- มูลค่าที่ใช้ -->
                        <div>
                          <mat-form-field appearance="outline" class="!text-sm w-full" subscriptSizing="dynamic">
                            <mat-label>มูลค่าที่ใช้</mat-label>
                            <span matTextPrefix>฿&nbsp;</span>
                            <input matInput currencyMask
                              [ngModel]="row.used_value"
                              (ngModelChange)="onUsedValueChange(i, $event)"
                              [min]="0"
                              class="text-right">
                          </mat-form-field>
                        </div>

                        <!-- หมายเหตุ -->
                        <div>
                          <mat-form-field appearance="outline" class="!text-sm w-full" subscriptSizing="dynamic">
                            <mat-label>หมายเหตุ</mat-label>
                            <input matInput
                              [ngModel]="row.remark"
                              (ngModelChange)="onRemarkChange(i, $event)">
                          </mat-form-field>
                        </div>
                      </div>

                      @if (row.fee_formula?.base_field === 'manual_input') {
                        <mat-form-field appearance="outline" class="!text-xs w-40 mt-1" subscriptSizing="dynamic">
                          <mat-label>{{ row.fee_formula.manual_input_label || 'กรอกค่าฐาน' }}</mat-label>
                          <input matInput currencyMask
                            [ngModel]="row.manual_input_value"
                            (ngModelChange)="onManualInputChange(i, $event)"
                            placeholder="0">
                        </mat-form-field>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }

          <!-- ── Footer summary ───────────────────────────────────────── -->
          @if (selectedCount() > 0 || extraExpenseAmount() > 0) {
            <div class="mt-4 pt-3" style="border-top: 2px solid var(--color-gray-300)">
              <div class="flex justify-between items-center mb-2">
                <span class="font-semibold" style="color: var(--color-text-primary)">รวม Panel 3B:</span>
                <span class="font-semibold tabular-nums" style="color: var(--color-text-primary)">฿{{ totalUsed() | number:'1.0-0' }}</span>
              </div>
              @for (src of usedBySourceList(); track src.key) {
                @if (src.used > 0 || src.allocated > 0) {
                  <div class="flex justify-between items-center text-xs py-0.5">
                    <span style="color: var(--color-gray-500)">{{ src.label }}:</span>
                    <div class="flex gap-4">
                      <span [class.text-loss]="src.exceeded" [style.color]="src.exceeded ? '' : 'var(--color-gray-700)'">
                        ใช้: ฿{{ src.used | number:'1.0-0' }}
                      </span>
                      <span [class.text-loss]="src.exceeded" [style.color]="src.exceeded ? '' : 'var(--color-gray-500)'">
                        เหลือ: ฿{{ src.remaining | number:'1.0-0' }}
                        @if (src.exceeded) { <span class="font-semibold ml-1">(เกินงบ!)</span> }
                      </span>
                    </div>
                  </div>
                }
              }
            </div>
          }
        }
      }
    </div>
  `,
})
export class AdditionalPromotionPanelComponent implements OnInit {
  // ─── Inputs ──────────────────────────────────────────────────────────
  eligibleItems = input<EligibleItem[]>([]);
  budgetSources = input<BudgetSourceInfo[]>([]);
  initialRows = input<PanelBRow[]>([]);
  /** ค่าธรรมเนียมโอน mode=as_premium (หักจาก MGMT_SPECIAL) — ตั้งจากหน้า unit-info
   *  แสดงเป็น info card เพื่อให้ user เห็นว่ามีรายการนี้กินงบ MGMT อยู่ — ไม่โต้ตอบในที่นี้ */
  extraExpenseAmount = input<number>(0);

  // ─── Outputs ─────────────────────────────────────────────────────────
  panelBItemsChanged = output<PanelBRow[]>();

  // ─── State ───────────────────────────────────────────────────────────
  readonly collapsed = signal(false);
  readonly rows = signal<PanelBRow[]>([]);
  /** toggle: แสดงเฉพาะรายการที่ติ๊ก (โหมดดู checklist) */
  readonly showSelectedOnly = signal(false);

  // ─── Computed: selected lookup ─────────────────────────────────────
  readonly selectedIds = computed(() =>
    new Set(this.rows().filter(r => r.promotion_item_id != null).map(r => r.promotion_item_id!))
  );

  /** Map<promotion_item_id, PanelBRow> — ใช้ใน template เพื่อ lookup row จาก item */
  readonly rowMap = computed(() => {
    const map = new Map<number, PanelBRow>();
    for (const r of this.rows()) {
      if (r.promotion_item_id != null) map.set(r.promotion_item_id, r);
    }
    return map;
  });

  readonly selectedCount = computed(() => this.selectedIds().size);

  /** displayList = [items ที่ติ๊ก (ตามลำดับ rows)] → [items ที่ยังไม่ติ๊ก (ตามลำดับ eligible เดิม)] */
  readonly displayList = computed<EligibleItem[]>(() => {
    const items = this.eligibleItems();
    const selectedRows = this.rows();
    const byId = new Map(items.map(it => [it.id, it]));
    const selectedFirst: EligibleItem[] = [];
    const seen = new Set<number>();
    for (const r of selectedRows) {
      if (r.promotion_item_id != null) {
        const it = byId.get(r.promotion_item_id);
        if (it) { selectedFirst.push(it); seen.add(it.id); }
      }
    }
    const unselected = items.filter(it => !seen.has(it.id));
    const list = [...selectedFirst, ...unselected];
    if (this.showSelectedOnly()) {
      const sel = this.selectedIds();
      return list.filter(it => sel.has(it.id));
    }
    return list;
  });

  /** rows ที่ถูกเลือกไว้ แต่ item หลุดจาก eligible แล้ว → แสดง section พิเศษ */
  readonly staleSelectedRows = computed<PanelBRow[]>(() => {
    const byId = new Map(this.eligibleItems().map(it => [it.id, it]));
    return this.rows().filter(r => r.promotion_item_id != null && !byId.has(r.promotion_item_id));
  });

  // ─── Computed: totals ──────────────────────────────────────────────
  // รวม extraExpenseAmount (ค่าธรรมเนียมโอน mode=as_premium) ในยอดของ panel นี้
  readonly totalUsed = computed(() =>
    this.rows().reduce((sum, r) => sum + r.used_value, 0) + (this.extraExpenseAmount() || 0)
  );

  /** ใช้ไปแยกต่อแหล่งงบ (รวม extraExpenseAmount ใต้ MGMT) */
  readonly usedBySource = computed(() => {
    const map: Record<string, number> = {};
    for (const r of this.rows()) {
      if (r.promotion_item_id && r.used_value > 0) {
        map[r.funding_source_type] = (map[r.funding_source_type] ?? 0) + r.used_value;
      }
    }
    const extra = this.extraExpenseAmount() || 0;
    if (extra > 0) {
      map[DEFAULT_FUNDING_SOURCE] = (map[DEFAULT_FUNDING_SOURCE] ?? 0) + extra;
    }
    return map;
  });

  /** สำหรับ footer — สรุปเฉพาะงบผู้บริหาร (แหล่งงบเดียวของ panel นี้) */
  readonly usedBySourceList = computed(() => {
    const used = this.usedBySource();
    const src = this.budgetSources().find(s => s.key === DEFAULT_FUNDING_SOURCE);
    const usedAmt = used[DEFAULT_FUNDING_SOURCE] ?? 0;
    const remaining = (src?.remaining ?? 0) - usedAmt;
    return [{
      key: DEFAULT_FUNDING_SOURCE,
      label: 'งบผู้บริหาร',
      allocated: src?.allocated ?? 0,
      used: usedAmt,
      remaining,
      exceeded: remaining < 0,
    }];
  });

  // ─── Effect: sync rows เมื่อ eligibleItems เปลี่ยน ──────────────────
  // - First load (rows ว่าง): edit mode → ใช้ initialRows + enrich จาก eligibleItems; ปกติ → ว่าง
  // - Subsequent (recalc จาก parent): preserve rows ที่ user กรอก แต่ refresh fee_formula
  //   ของแถวที่อ้างถึง item ที่ค่าเปลี่ยน (calculated_value/formula_display/warnings)
  // กันกระตุก: reuse reference ของ row เดิมถ้า server-derived ไม่เปลี่ยน + skip set+emit ถ้าทั้ง array เหมือนเดิม
  private resetEffect = effect(() => {
    const items = this.eligibleItems();
    const init = this.initialRows();
    const inFlight = untracked(() => this.rows());
    const itemMap = new Map(items.map(it => [it.id, it]));

    // first load
    if (inFlight.length === 0) {
      if (init.length > 0) {
        // edit mode: enrich initialRows ด้วย server-derived fields (max_value/fee_formula ฯลฯ)
        // เพราะ parent สร้าง init จากรายการเดิมเท่านั้น ไม่มี max_value/formula
        const enriched = init.map(row => this.mergeFromItem(row, itemMap.get(row.promotion_item_id ?? -1)));
        this.rows.set(enriched);
        this.emitChanges(enriched);
      } else {
        this.rows.set([]);
        this.emitChanges([]);
      }
      return;
    }

    // subsequent: refresh server-derived fields แต่คงค่า user
    const updated = inFlight.map(row => {
      if (row.promotion_item_id == null) return row;
      const item = itemMap.get(row.promotion_item_id);
      if (!item) return row; // item ไม่อยู่ในรายการ eligible แล้ว — คงค่าเดิม

      const newCalc = item.value_mode === 'calculated' ? (item.calculated_value ?? null) : row.calculated_value;
      const newUsed = item.value_mode === 'calculated' ? (item.calculated_value ?? 0) : row.used_value;

      // ถ้า server-derived ไม่มีอะไรเปลี่ยน → reuse row เดิม กัน Material rebuild
      if (
        row.max_value === item.max_value
        && row.formula_display === item.formula_display
        && row.applied_policy_name === item.applied_policy_name
        && row.fee_formula === item.fee_formula
        && row.effective_rate === item.effective_rate
        && row.effective_buyer_share === item.effective_buyer_share
        && (row.warnings?.length ?? 0) === (item.warnings?.length ?? 0)
        && row.calculated_value === newCalc
        && row.used_value === newUsed
      ) {
        return row;
      }

      return {
        ...row,
        // server-derived
        max_value:             item.max_value,
        formula_display:       item.formula_display,
        applied_policy_name:   item.applied_policy_name,
        fee_formula:           item.fee_formula,
        effective_rate:        item.effective_rate,
        effective_buyer_share: item.effective_buyer_share,
        warnings:              item.warnings ?? [],
        calculated_value:      newCalc,
        used_value:            newUsed,
      };
    });

    // ถ้าทุก row ยังเป็น reference เดิม → ไม่ต้อง set/emit (Section 4 + Section 2 ไม่ recompute ฟรีๆ)
    const allSameRefs = updated.length === inFlight.length
      && updated.every((r, i) => r === inFlight[i]);
    if (allSameRefs) return;

    this.rows.set(updated);
    this.emitChanges(updated);
  });

  /** เติม server-derived fields ลง row จาก EligibleItem (ถ้าเจอ) — คง used_value/remark ที่ user กรอกเดิมไว้
   *  edit mode legacy: row เก่า funding=PROJECT_POOL → migrate เป็น MANAGEMENT_SPECIAL ตลอด
   *  (PROJECT_POOL ถูกถอดจาก panel นี้แล้ว user แก้ไม่ได้ ต้อง migrate ไม่งั้น save ค้างค่าเก่า) */
  private mergeFromItem(row: PanelBRow, item: EligibleItem | undefined): PanelBRow {
    const fundingSource = row.funding_source_type === 'PROJECT_POOL'
      ? DEFAULT_FUNDING_SOURCE
      : (row.funding_source_type || DEFAULT_FUNDING_SOURCE);
    if (!item) return { ...row, funding_source_type: fundingSource };
    return {
      ...row,
      funding_source_type:   fundingSource,
      max_value:             item.max_value,
      formula_display:       item.formula_display,
      applied_policy_name:   item.applied_policy_name,
      fee_formula:           item.fee_formula,
      effective_rate:        item.effective_rate,
      effective_buyer_share: item.effective_buyer_share,
      warnings:              item.warnings ?? [],
      calculated_value:      item.value_mode === 'calculated' ? (item.calculated_value ?? null) : row.calculated_value,
      // edit mode: ใช้ value_mode/category จาก server (กันกรณี config เปลี่ยน)
      value_mode:            item.value_mode || row.value_mode,
      category:              row.category || item.category,
    };
  }

  ngOnInit(): void {}

  // ─── Actions ─────────────────────────────────────────────────────────

  /** ติ๊ก/เอาออก checkbox — `checked` คือสถานะที่ user เพิ่งเลือก */
  toggleItem(item: EligibleItem, checked: boolean): void {
    if (checked) {
      // เพิ่ม row ถ้ายังไม่มี
      if (this.selectedIds().has(item.id)) return;
      this.rows.update(rows => [...rows, this.buildRowFromItem(item)]);
      this.emitChanges(this.rows());
      return;
    }
    // ติ๊กออก — ตรวจค่ากรอกค้างก่อนลบ
    const row = this.rowMap().get(item.id);
    if (!row) return;
    if (this.hasUserEdits(row)) {
      const ok = window.confirm(
        `"${row.name}" มีข้อมูลกรอกไว้ (มูลค่าใช้/หมายเหตุ)\n\nยืนยันการลบรายการนี้?`
      );
      if (!ok) return;
    }
    this.removeRowById(item.id);
  }

  /** ลบ row ที่ item หลุดจาก eligible แล้ว (ไม่ต้อง confirm เพราะ user รู้อยู่แล้ว) */
  removeStaleRow(itemId: number | null): void {
    if (itemId == null) return;
    this.removeRowById(itemId);
  }

  /** หา index ของ row ใน rows() จาก item id — สำหรับส่งให้ event handlers เดิม */
  rowIndexFor(itemId: number | null): number {
    if (itemId == null) return -1;
    return this.rows().findIndex(r => r.promotion_item_id === itemId);
  }

  private removeRowById(itemId: number): void {
    this.rows.update(rows => rows.filter(r => r.promotion_item_id !== itemId));
    this.emitChanges(this.rows());
  }

  private hasUserEdits(row: PanelBRow): boolean {
    // value_mode=calculated → used_value มาจากสูตร ไม่ใช่ user → skip
    const usedIsUserEdit = row.value_mode !== 'calculated' && row.used_value > 0;
    const remarkFilled = (row.remark ?? '').trim().length > 0;
    return usedIsUserEdit || remarkFilled;
  }

  onUsedValueChange(index: number, value: number | null): void {
    this.rows.update(rows => {
      const updated = [...rows];
      const row = { ...updated[index] };
      let v = value ?? 0;
      if (v < 0) v = 0;
      if (row.max_value != null && v > row.max_value) v = row.max_value;
      row.used_value = v;
      updated[index] = row;
      return updated;
    });
    this.emitChanges(this.rows());
  }

  onRemarkChange(index: number, value: string): void {
    this.rows.update(rows => {
      const updated = [...rows];
      updated[index] = { ...updated[index], remark: value };
      return updated;
    });
  }

  onManualInputChange(index: number, value: number | null): void {
    this.rows.update(rows => {
      const updated = [...rows];
      const row = { ...updated[index] };
      row.manual_input_value = value;

      if (value != null && value > 0 && row.effective_rate != null && row.effective_buyer_share != null) {
        let calcVal = value * row.effective_rate * row.effective_buyer_share;
        if (row.max_value != null && calcVal > row.max_value) {
          calcVal = row.max_value;
        }
        row.calculated_value = Math.round(calcVal);
        row.used_value = Math.round(calcVal);
      } else {
        row.calculated_value = 0;
        row.used_value = 0;
      }

      updated[index] = row;
      return updated;
    });
    this.emitChanges(this.rows());
  }

  // ─── UI helpers ──────────────────────────────────────────────────────

  categoryClass(cat: string): string {
    switch (cat) {
      case 'discount': return 'bg-amber-100 text-amber-700';
      case 'premium': return 'bg-blue-100 text-blue-700';
      case 'expense_support': return 'bg-purple-100 text-purple-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  categoryLabel(cat: string): string {
    switch (cat) {
      case 'discount': return 'ส่วนลด';
      case 'premium': return 'ของแถม';
      case 'expense_support': return 'ค่าใช้จ่าย';
      default: return cat;
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private buildRowFromItem(item: EligibleItem): PanelBRow {
    let usedValue = 0;

    if (item.value_mode === 'calculated') {
      usedValue = item.calculated_value ?? 0;
    } else {
      usedValue = item.default_used_value ?? item.max_value ?? 0;
    }

    return {
      promotion_item_id: item.id,
      name: item.name,
      category: item.category,
      value_mode: item.value_mode,
      max_value: item.max_value,
      calculated_value: item.calculated_value,
      used_value: usedValue,
      funding_source_type: DEFAULT_FUNDING_SOURCE,
      formula_display: item.formula_display,
      applied_policy_name: item.applied_policy_name,
      fee_formula: item.fee_formula,
      effective_rate: item.effective_rate,
      effective_buyer_share: item.effective_buyer_share,
      warnings: item.warnings ?? [],
      remark: '',
      manual_input_value: null,
    };
  }

  private emitChanges(rows: PanelBRow[]): void {
    this.panelBItemsChanged.emit(rows);
  }
}
