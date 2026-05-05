import {
  Component, input, signal, computed, output, effect, untracked, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

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

// ─── ตัวเลือกแหล่งงบ ──────────────────────────────────────────────────
const FUNDING_SOURCES = [
  { key: 'MANAGEMENT_SPECIAL', label: 'งบผู้บริหาร' },
  { key: 'PROJECT_POOL', label: 'งบส่วนกลาง' },
];

@Component({
  selector: 'app-additional-promotion-panel',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatTooltipModule, SvgIconComponent, CurrencyMaskDirective,
  ],
  template: `
    <div class="section-card">
      <div class="flex items-center justify-between cursor-pointer" (click)="collapsed.set(!collapsed())">
        <h3 class="font-semibold m-0" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">
          ของแถมเพิ่มเติม (งบอื่นๆ)
          <span class="text-sm font-normal ml-2" style="color: var(--color-gray-500)">{{ rows().length }} รายการ</span>
        </h3>
        <div class="flex items-center gap-2">
          @if (collapsed() && rows().length > 0) {
            <span class="text-sm font-semibold tabular-nums" style="color: var(--color-text-primary)">฿{{ totalUsed() | number:'1.0-0' }}</span>
          }
          <app-icon [name]="collapsed() ? 'chevron-right' : 'chevron-down'" class="w-5 h-5" style="color: var(--color-gray-500)" />
        </div>
      </div>

      @if (!collapsed() && rows().length === 0 && availableItems().length === 0) {
        <div class="text-slate-400 text-sm py-4 text-center">ไม่มีรายการของแถมเพิ่มเติมที่ eligible</div>
      } @else if (!collapsed() && rows().length === 0) {
        <div class="text-slate-400 text-sm py-4 text-center">
          กดปุ่ม "เพิ่มรายการ" เพื่อเพิ่มของแถมเพิ่มเติม ({{ availableItems().length }} รายการพร้อมเลือก)
        </div>
      } @else if (!collapsed()) {
        <div class="space-y-3 mt-3">
          @for (row of rows(); track $index; let i = $index) {
            <div class="border rounded-lg p-3 hover:bg-slate-50 transition-colors"
                 style="border-color: var(--color-border); border-radius: var(--radius-md)">

              <!-- Row 1: ชื่อรายการ + ปุ่มลบ -->
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="flex-1">
                  @if (row.promotion_item_id === null) {
                    <mat-form-field appearance="outline" class="!text-sm w-full" subscriptSizing="dynamic">
                      <mat-label>เลือกรายการ</mat-label>
                      <mat-select (selectionChange)="onItemSelected(i, $event.value)">
                        @for (item of getDropdownItems(i); track item.id) {
                          <mat-option [value]="item.id">{{ item.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  } @else {
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-medium" style="color: var(--color-text-primary)">{{ row.name }}</span>
                      @if (row.category) {
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          [class]="categoryClass(row.category)">
                          {{ categoryLabel(row.category) }}
                        </span>
                      }
                      @if (row.applied_policy_name) {
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200"
                              [matTooltip]="'มาตรการที่ใช้: ' + row.applied_policy_name">
                          🏷 {{ row.applied_policy_name }}
                        </span>
                      }
                    </div>
                    @if (row.formula_display) {
                      <div class="text-xs mt-0.5" style="color: var(--color-primary-500)" [matTooltip]="row.formula_display">
                        ↳ {{ row.formula_display }}
                      </div>
                    }
                    @for (warn of row.warnings; track warn) {
                      <div class="text-xs mt-0.5 flex items-center gap-1" style="color: var(--color-warning)">
                        <app-icon name="exclamation-triangle" class="w-3 h-3" /> {{ warn }}
                      </div>
                    }
                  }
                </div>
                <button mat-icon-button class="!w-8 !h-8 flex-shrink-0" (click)="removeRow(i)" matTooltip="ลบรายการ">
                  <app-icon name="trash" class="w-4 h-4" style="color: var(--color-error)" />
                </button>
              </div>

              <!-- Row 2: fields grid (เฉพาะเมื่อเลือกรายการแล้ว) -->
              @if (row.promotion_item_id) {
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <!-- มูลค่าสูงสุด -->
                  <div>
                    <p class="text-xs mb-1" style="color: var(--color-gray-500)">มูลค่าสูงสุด</p>
                    <p class="text-sm font-medium tabular-nums" style="color: var(--color-text-primary)">
                      @if (row.value_mode === 'calculated' && row.calculated_value != null) {
                        ฿{{ row.calculated_value | number:'1.0-0' }}
                      } @else if (row.max_value != null) {
                        ฿{{ row.max_value | number:'1.0-0' }}
                      } @else {
                        <span style="color: var(--color-gray-400)">—</span>
                      }
                    </p>
                  </div>

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

                  <!-- แหล่งงบ -->
                  <div>
                    <mat-form-field appearance="outline" class="!text-sm w-full" subscriptSizing="dynamic">
                      <mat-label>แหล่งงบ</mat-label>
                      <mat-select
                        [ngModel]="row.funding_source_type"
                        (ngModelChange)="onFundingSourceChange(i, $event)">
                        @for (src of fundingSources; track src.key) {
                          <mat-option [value]="src.key" [disabled]="isFundingDisabled(src.key)">
                            {{ src.label }}{{ getFundingDisabledReason(src.key) }}
                          </mat-option>
                        }
                      </mat-select>
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
              }
            </div>
          }
        </div>

        <!-- Footer summary -->
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

      @if (canAddRow() && !collapsed()) {
        <div class="mt-4 flex justify-center">
          <button mat-stroked-button color="primary" class="!text-sm" (click)="addRow()">
            + เพิ่มรายการ ({{ availableItems().length }} รายการพร้อมเลือก)
          </button>
        </div>
      }
    </div>
  `,
})
export class AdditionalPromotionPanelComponent implements OnInit {
  // ─── Inputs ──────────────────────────────────────────────────────────
  eligibleItems = input<EligibleItem[]>([]);
  budgetSources = input<BudgetSourceInfo[]>([]);
  initialRows = input<PanelBRow[]>([]);

  // ─── Outputs ─────────────────────────────────────────────────────────
  panelBItemsChanged = output<PanelBRow[]>();

  // ─── State ───────────────────────────────────────────────────────────
  readonly collapsed = signal(false);
  readonly rows = signal<PanelBRow[]>([]);
  readonly fundingSources = FUNDING_SOURCES;

  // ─── Computed: dropdown items (Duplicate Prevention) ──────────────────
  readonly selectedIds = computed(() =>
    new Set(this.rows().filter(r => r.promotion_item_id != null).map(r => r.promotion_item_id!))
  );

  readonly availableItems = computed(() => {
    const selected = this.selectedIds();
    return this.eligibleItems().filter(item => !selected.has(item.id));
  });

  readonly canAddRow = computed(() => this.availableItems().length > 0);

  // ─── Computed: totals ──────────────────────────────────────────────
  readonly totalUsed = computed(() =>
    this.rows().reduce((sum, r) => sum + r.used_value, 0)
  );

  /** ใช้ไปแยกต่อแหล่งงบ (เฉพาะจาก Panel 3B rows) */
  readonly usedBySource = computed(() => {
    const map: Record<string, number> = {};
    for (const r of this.rows()) {
      if (r.promotion_item_id && r.used_value > 0) {
        map[r.funding_source_type] = (map[r.funding_source_type] ?? 0) + r.used_value;
      }
    }
    return map;
  });

  /** สำหรับ footer — รวมข้อมูลงบแต่ละแหล่งกับ used */
  readonly usedBySourceList = computed(() => {
    const used = this.usedBySource();
    const sources = this.budgetSources();
    return FUNDING_SOURCES.map(fs => {
      const src = sources.find(s => s.key === fs.key);
      const usedAmt = used[fs.key] ?? 0;
      const remaining = (src?.remaining ?? 0) - usedAmt;
      return {
        key: fs.key,
        label: fs.label,
        allocated: src?.allocated ?? 0,
        used: usedAmt,
        remaining,
        exceeded: remaining < 0,
      };
    });
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

  /** เติม server-derived fields ลง row จาก EligibleItem (ถ้าเจอ) — คง used_value/remark/funding_source ที่ user กรอกเดิมไว้ */
  private mergeFromItem(row: PanelBRow, item: EligibleItem | undefined): PanelBRow {
    if (!item) return row;
    return {
      ...row,
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

  addRow(): void {
    if (!this.canAddRow()) return;
    this.rows.update(rows => [...rows, this.createEmptyRow()]);
  }

  removeRow(index: number): void {
    this.rows.update(rows => rows.filter((_, i) => i !== index));
    this.emitChanges(this.rows());
  }

  // ─── Event handlers ──────────────────────────────────────────────────

  onItemSelected(index: number, itemId: number): void {
    const item = this.eligibleItems().find(i => i.id === itemId);
    if (!item) return;

    this.rows.update(rows => {
      const updated = [...rows];
      updated[index] = this.buildRowFromItem(item);
      return updated;
    });
    this.emitChanges(this.rows());
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

  onFundingSourceChange(index: number, source: string): void {
    this.rows.update(rows => {
      const updated = [...rows];
      updated[index] = { ...updated[index], funding_source_type: source };
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

  // ─── Dropdown helpers ────────────────────────────────────────────────

  /** Dropdown items สำหรับแถวที่ index — ไม่รวมรายการที่เลือกในแถวอื่น */
  getDropdownItems(index: number): EligibleItem[] {
    const otherSelected = new Set(
      this.rows()
        .filter((r, i) => i !== index && r.promotion_item_id != null)
        .map(r => r.promotion_item_id!)
    );
    return this.eligibleItems().filter(item => !otherSelected.has(item.id));
  }

  // ─── Funding source helpers ──────────────────────────────────────────

  isFundingDisabled(key: string): boolean {
    const src = this.budgetSources().find(s => s.key === key);
    if (!src) return true;
    // งบผู้บริหาร (MANAGEMENT_SPECIAL) ใช้ได้เสมอ — ทีมการตลาดบริหารจัดการเอง อนุญาตติดลบ
    if (key === 'MANAGEMENT_SPECIAL') return false;
    if (src.allocated <= 0) return true;
    // ตรวจงบเหลือ: allocated - already_used_by_movements - pending_from_panel_b
    const pendingUsed = this.usedBySource()[key] ?? 0;
    return (src.remaining - pendingUsed) <= 0;
  }

  getFundingDisabledReason(key: string): string {
    // งบผู้บริหารใช้ได้เสมอ ไม่ต้องแสดงเหตุผล disable
    if (key === 'MANAGEMENT_SPECIAL') return '';
    const src = this.budgetSources().find(s => s.key === key);
    if (!src || src.allocated <= 0) return ' (ยังไม่ได้ตั้งงบ)';
    const pendingUsed = this.usedBySource()[key] ?? 0;
    if ((src.remaining - pendingUsed) <= 0) return ' (งบหมดแล้ว)';
    return '';
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

  private createEmptyRow(): PanelBRow {
    return {
      promotion_item_id: null,
      name: '',
      category: '',
      value_mode: '',
      max_value: null,
      calculated_value: null,
      used_value: 0,
      funding_source_type: this.getDefaultFundingSource(),
      formula_display: null,
      applied_policy_name: null,
      fee_formula: null,
      effective_rate: null,
      effective_buyer_share: null,
      warnings: [],
      remark: '',
      manual_input_value: null,
    };
  }

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
      funding_source_type: this.getDefaultFundingSource(),
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

  /** Default = MANAGEMENT_SPECIAL ถ้ามี allocation, ไม่งั้นเลือกแหล่งแรกที่มี */
  private getDefaultFundingSource(): string {
    const sources = this.budgetSources();
    const mgmt = sources.find(s => s.key === 'MANAGEMENT_SPECIAL');
    if (mgmt && mgmt.allocated > 0) return 'MANAGEMENT_SPECIAL';
    const avail = sources.find(s => s.allocated > 0);
    return avail?.key ?? 'MANAGEMENT_SPECIAL';
  }

  private emitChanges(rows: PanelBRow[]): void {
    this.panelBItemsChanged.emit(rows);
  }
}
