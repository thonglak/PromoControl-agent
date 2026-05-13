import {
  Component, input, signal, computed, output, effect, untracked, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

import { EligibleItem } from '../services/sales-entry.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';

// ─── ประเภทข้อมูลแถวใน Panel 3A ────────────────────────────────────────
export interface PanelARow {
  promotion_item_id: number;
  name: string;
  category: 'discount' | 'premium' | 'expense_support';
  value_mode: string;
  max_value: number | null;
  calculated_value: number | null;
  /** มูลค่ารวมที่หักจากงบยูนิต */
  used_value: number;
  /** ส่วนของ used_value ที่แปลงเป็นส่วนลด (0..used_value) เฉพาะ premium; ของแถมจริง = used_value - discount_convert_value */
  discount_convert_value: number;
  funding_source_type: 'UNIT_STANDARD';
  formula_display: string | null;
  applied_policy_name: string | null;
  fee_formula: any | null;
  effective_rate: number | null;
  effective_buyer_share: number | null;
  warnings: string[];
  remark: string;
  manual_input_value: number | null;
}

@Component({
  selector: 'app-premium-promotion-panel',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule,
    MatTooltipModule, SvgIconComponent, CurrencyMaskDirective,
  ],
  template: `
    <div class="section-card">
      <div class="flex items-center justify-between cursor-pointer" (click)="collapsed.set(!collapsed())">
        <h3 class="font-semibold m-0" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">
          Premium (งบยูนิต)
          <span class="text-sm font-normal ml-2" style="color: var(--color-gray-500)">{{ rows().length }} รายการ</span>
        </h3>
        <div class="flex items-center gap-2">
          @if (collapsed() && rows().length > 0) {
            <span class="text-sm font-semibold tabular-nums" style="color: var(--color-text-primary)">฿{{ totalUsed() | number:'1.0-0' }}</span>
          }
          <app-icon [name]="collapsed() ? 'chevron-right' : 'chevron-down'" class="w-5 h-5" style="color: var(--color-gray-500)" />
        </div>
      </div>

      @if (!collapsed() && rows().length === 0) {
        <div class="text-sm py-4 text-center" style="color: var(--color-gray-500)">ไม่มีรายการโปรโมชั่นงบยูนิต</div>
      } @else if (!collapsed()) {
        <div class="space-y-3 mt-3">
          @for (row of rows(); track row.promotion_item_id; let i = $index) {
            <div class="border rounded-lg p-3 transition-opacity"
                 style="border-color: var(--color-border); border-radius: var(--radius-md)"
                 [class.opacity-40]="row.used_value === 0">

              <!-- Row 1: ชื่อรายการ -->
              <div class="flex items-center gap-2 flex-wrap mb-2">
                <span class="font-medium" style="color: var(--color-text-primary)">{{ row.name }}</span>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  [class]="categoryClass(row.category)">
                  {{ categoryLabel(row.category) }}
                </span>
                @if (row.promotion_item_id === lockedItemId()) {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
                        matTooltip="ผูกกับค่าธรรมเนียมโอน (ใช้งบยูนิต) — แก้ไขที่ส่วนข้อมูลยูนิต">
                    🔒 ผูกกับค่าธรรมเนียมโอน
                  </span>
                }
                @if (row.applied_policy_name) {
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200"
                        [matTooltip]="'มาตรการที่ใช้: ' + row.applied_policy_name">
                    🏷 {{ row.applied_policy_name }}
                  </span>
                }
                @if (row.formula_display) {
                  <span class="text-xs" style="color: var(--color-primary-500)" [matTooltip]="row.formula_display">
                    ↳ {{ row.formula_display }}
                  </span>
                }
              </div>

              @for (warn of row.warnings; track warn) {
                <div class="text-xs mb-1 flex items-center gap-1" style="color: var(--color-warning)">
                  <app-icon name="exclamation-triangle" class="w-3 h-3" /> {{ warn }}
                </div>
              }

              <!-- Row 2: fields grid -->
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
                  <mat-form-field appearance="outline" class="!text-sm w-full" subscriptSizing="dynamic"
                    [matTooltip]="row.promotion_item_id === lockedItemId() ? 'ผูกกับค่าธรรมเนียมโอน — แก้ที่ส่วนข้อมูลยูนิต' : ''">
                    <mat-label>มูลค่าที่ใช้</mat-label>
                    <span matTextPrefix>฿&nbsp;</span>
                    <input matInput currencyMask
                      [ngModel]="row.used_value"
                      (ngModelChange)="onUsedValueChange(i, $event)"
                      [readonly]="row.promotion_item_id === lockedItemId()"
                      [min]="0"
                      class="text-right">
                  </mat-form-field>
                </div>

                <!-- แปลงส่วนลด (เฉพาะ premium) — กรอกได้ 0..used_value -->
                <div>
                  @if (row.category === 'premium') {
                    <mat-form-field appearance="outline" class="!text-sm w-full" subscriptSizing="dynamic"
                      [matTooltip]="'ส่วนของมูลค่าที่ใช้ ที่แปลงเป็นส่วนลด (ของแถมจริง = มูลค่าที่ใช้ − แปลงส่วนลด)'">
                      <mat-label>แปลงส่วนลด</mat-label>
                      <span matTextPrefix>฿&nbsp;</span>
                      <input matInput currencyMask
                        [ngModel]="row.discount_convert_value"
                        (ngModelChange)="onDiscountConvertChange(i, $event)"
                        [min]="0"
                        class="text-right">
                    </mat-form-field>
                  }
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

              <!-- breakdown ของ premium ที่ split -->
              @if (row.category === 'premium' && row.discount_convert_value > 0 && row.discount_convert_value < row.used_value) {
                <div class="text-xs mt-2 px-2 py-1 rounded bg-blue-50 border border-blue-200 flex gap-4">
                  <span style="color: var(--color-text-secondary)">
                    ↳ ของแถมจริง: <span class="font-semibold tabular-nums" style="color: var(--color-primary)">฿{{ (row.used_value - row.discount_convert_value) | number:'1.0-0' }}</span>
                  </span>
                  <span style="color: var(--color-text-secondary)">
                    ↳ ส่วนลด: <span class="font-semibold tabular-nums text-discount">฿{{ row.discount_convert_value | number:'1.0-0' }}</span>
                  </span>
                </div>
              }

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

        <!-- Footer -->
        <div class="mt-4 pt-3" style="border-top: 2px solid var(--color-gray-300)">
          <div class="flex justify-between items-center">
            <span class="font-semibold" style="color: var(--color-text-primary)">รวม Panel 3A:</span>
            <div class="flex items-center gap-4">
              <span class="font-semibold tabular-nums" style="color: var(--color-text-primary)">฿{{ totalUsed() | number:'1.0-0' }}</span>
              <span class="text-sm"
                [class.text-profit]="!budgetExceeded()"
                [class.text-loss]="budgetExceeded()"
                [class.font-semibold]="budgetExceeded()">
                งบยูนิตเหลือ: ฿{{ unitBudgetRemaining() | number:'1.0-0' }}
                @if (budgetExceeded()) {
                  <span class="text-xs ml-1">(เกินงบ!)</span>
                }
              </span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PremiumPromotionPanelComponent implements OnInit {
  // ─── Inputs ──────────────────────────────────────────────────────────
  eligibleItems = input<EligibleItem[]>([]);
  unitBudget = input<number>(0);          // standard_budget จากยูนิต
  unitBudgetUsed = input<number>(0);      // งบที่ใช้ไปแล้ว (จาก movements ที่ approved)
  initialRows = input<PanelARow[]>([]);   // edit mode: ค่าจากรายการขายเดิม
  /** id ของ promotion_item ที่ถูกผูกกับค่าธรรมเนียมโอน (mode=as_unit_expense)
   *  - used_value ของแถวนี้ถูกควบคุมจาก unit-info → readonly + แสดง chip lock
   *  - parent push ค่าผ่าน setUsedValueForItem() แทน */
  lockedItemId = input<number | null>(null);

  // ─── Outputs ─────────────────────────────────────────────────────────
  panelAItemsChanged = output<PanelARow[]>();

  // ─── State ───────────────────────────────────────────────────────────
  readonly collapsed = signal(false);
  readonly rows = signal<PanelARow[]>([]);

  // ─── Computed ────────────────────────────────────────────────────────
  readonly totalUsed = computed(() =>
    this.rows().reduce((sum, r) => sum + r.used_value, 0)
  );

  readonly unitBudgetRemaining = computed(() =>
    this.unitBudget() - this.unitBudgetUsed() - this.totalUsed()
  );

  readonly budgetExceeded = computed(() => this.unitBudgetRemaining() < 0);

  // ─── Effects: rebuild rows เมื่อ eligible items เปลี่ยน ──────────────
  // หมายเหตุ: เมื่อ parent ทำ recalc (เช่น contract_price/net_price เปลี่ยน) eligibleItems จะถูก
  // โหลดใหม่ — เราต้องคงค่าที่ user กรอกไว้ (used_value ของ manual/fixed, discount_convert_value, remark)
  // แต่ปรับ calculated_value/formula_display/warnings ให้ตรงกับ BE ใหม่
  // กันกระตุก: reuse reference ของ row เดิมถ้า content ไม่เปลี่ยน + skip set+emit ถ้าทั้ง array เหมือนเดิม
  // (Material form field จะไม่ rebuild เพราะ binding อ้างอิง object เดิม)
  private rebuildEffect = effect(() => {
    const items = this.eligibleItems();
    const initRows = this.initialRows();
    if (items.length === 0) {
      if (untracked(() => this.rows()).length > 0) {
        this.rows.set([]);
        this.emitChanges([]);
      }
      return;
    }
    // อ่าน rows ปัจจุบันแบบไม่ติดตาม (กัน infinite loop)
    const inFlight = untracked(() => this.rows());
    const inFlightById = new Map<number, PanelARow>();
    for (const r of inFlight) {
      if (r.promotion_item_id) inFlightById.set(r.promotion_item_id, r);
    }

    // ลำดับความสำคัญของค่าที่จะ merge (last-write-wins):
    // 1) initRows ก่อน — seed ค่าจากรายการเดิมตอน first load (inFlight ยังว่าง)
    // 2) inFlight ทับ — หลัง user กรอก ค่า user ต้องชนะ initRows ตอน eligible reload (net_price recalc)
    const savedMap = new Map<number, PanelARow>();
    for (const r of initRows) {
      savedMap.set(r.promotion_item_id, r);
    }
    for (const r of inFlight) {
      if (r.promotion_item_id) savedMap.set(r.promotion_item_id, r);
    }

    const newRows = items.map(item => {
      const saved = savedMap.get(item.id);
      const fresh = this.buildRow(item);
      if (!saved) {
        // ไม่มีค่าเดิม — edit mode ใหม่ใส่ used_value=0; ปกติใช้ default จาก buildRow
        return initRows.length > 0 ? { ...fresh, used_value: 0 } : fresh;
      }
      // มีค่าเดิม — preserve user input + อัปเดต server-derived fields
      const newUsedValue = item.value_mode === 'calculated' ? fresh.used_value : saved.used_value;
      // ถ้า used_value ลดลงจน < discount_convert_value → clamp
      const newConvert = Math.min(saved.discount_convert_value, newUsedValue);
      const merged: PanelARow = {
        ...fresh,
        // value_mode='calculated' → ใช้ค่าใหม่จาก BE; โหมดอื่น → คงค่าที่ user กรอก
        used_value:              newUsedValue,
        discount_convert_value:  newConvert,
        remark:                  saved.remark,
        manual_input_value:      saved.manual_input_value,
      };
      // ถ้า row เดิมเหมือน merged ทุกประการ → reuse reference เดิม กัน Material rebuild
      const existing = inFlightById.get(item.id);
      if (existing && this.rowsEqual(existing, merged)) return existing;
      return merged;
    });

    // ถ้าทุก row ยังเป็น reference เดิม + length เท่าเดิม → ไม่ต้อง set/emit
    const allSameRefs = newRows.length === inFlight.length
      && newRows.every((r, i) => r === inFlight[i]);
    if (allSameRefs) return;

    this.rows.set(newRows);
    this.emitChanges(newRows);
  });

  /** เปรียบเทียบ row 2 ตัวระดับ field ที่กระทบ render (shallow) */
  private rowsEqual(a: PanelARow, b: PanelARow): boolean {
    return a.promotion_item_id === b.promotion_item_id
      && a.used_value === b.used_value
      && a.discount_convert_value === b.discount_convert_value
      && a.remark === b.remark
      && a.manual_input_value === b.manual_input_value
      && a.calculated_value === b.calculated_value
      && a.max_value === b.max_value
      && a.formula_display === b.formula_display
      && a.applied_policy_name === b.applied_policy_name
      && a.effective_rate === b.effective_rate
      && a.effective_buyer_share === b.effective_buyer_share
      && a.value_mode === b.value_mode
      && a.category === b.category
      && a.fee_formula === b.fee_formula
      && (a.warnings?.length ?? 0) === (b.warnings?.length ?? 0);
  }

  ngOnInit(): void {}

  // ─── Build row จาก EligibleItem ─────────────────────────────────────
  private buildRow(item: EligibleItem): PanelARow {
    let usedValue = 0;

    if (item.value_mode === 'calculated') {
      // calculated: ใช้ค่าจาก API (หลัง cap แล้ว)
      usedValue = item.calculated_value ?? 0;
    } else if (item.value_mode === 'fixed') {
      // fixed: default_used_value ?? max_value
      usedValue = item.default_used_value ?? item.max_value ?? 0;
    } else {
      // actual / manual
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
      discount_convert_value: 0,
      funding_source_type: 'UNIT_STANDARD',
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

  // ─── Event handlers ──────────────────────────────────────────────────

  onUsedValueChange(index: number, value: number | null): void {
    // กัน user แก้ผ่าน input ถ้าแถวถูกผูกกับค่าธรรมเนียมโอน (readonly อยู่แล้ว — กันชั้นที่ 2)
    const current = this.rows()[index];
    if (current && current.promotion_item_id === this.lockedItemId()) return;

    this.rows.update(rows => {
      const updated = [...rows];
      const row = { ...updated[index] };
      let v = value ?? 0;
      if (v < 0) v = 0;
      if (row.max_value != null && v > row.max_value) v = row.max_value;
      row.used_value = v;
      // clamp discount_convert_value ไม่ให้เกิน used_value ใหม่
      if (row.discount_convert_value > v) row.discount_convert_value = v;
      updated[index] = row;
      return updated;
    });
    this.emitChanges(this.rows());
  }

  /** ตั้ง used_value ของแถวที่ผูกกับค่าธรรมเนียมโอน — เรียกจาก parent (sales-entry)
   *  ค่าจะถูก clamp ตาม max_value (เหมือน onUsedValueChange)
   *  ไม่ทำอะไรถ้าไม่พบ item หรือ value ไม่เปลี่ยน */
  setUsedValueForItem(itemId: number, value: number): void {
    const idx = this.rows().findIndex(r => r.promotion_item_id === itemId);
    if (idx < 0) return;
    let v = Math.max(0, Number(value) || 0);
    const max = this.rows()[idx].max_value;
    if (max != null && v > max) v = max;
    if (this.rows()[idx].used_value === v) return; // ไม่เปลี่ยน → ไม่ต้อง emit

    this.rows.update(rows => {
      const updated = [...rows];
      const row = { ...updated[idx] };
      row.used_value = v;
      if (row.discount_convert_value > v) row.discount_convert_value = v;
      updated[idx] = row;
      return updated;
    });
    this.emitChanges(this.rows());
  }

  onDiscountConvertChange(index: number, value: number | null): void {
    this.rows.update(rows => {
      const updated = [...rows];
      const row = { ...updated[index] };
      let v = value ?? 0;
      if (v < 0) v = 0;
      if (v > row.used_value) v = row.used_value;
      row.discount_convert_value = v;
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

      // recalculate used_value: base × effective_rate × effective_buyer_share
      if (value != null && value > 0 && row.effective_rate != null && row.effective_buyer_share != null) {
        let calcVal = value * row.effective_rate * row.effective_buyer_share;

        // cap ด้วย max_value
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

  // ─── Helpers ─────────────────────────────────────────────────────────

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

  private emitChanges(rows: PanelARow[]): void {
    this.panelAItemsChanged.emit(rows);
  }
}
