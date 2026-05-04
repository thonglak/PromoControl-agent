import {
  Component, input, signal, computed, output, effect, untracked, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
  used_value: number;
  convert_to_discount: boolean;
  funding_source_type: 'UNIT_STANDARD';
  formula_display: string | null;
  fee_formula: any | null;
  effective_rate: number | null;
  effective_buyer_share: number | null;
  warnings: string[];
  remark: string;
  discount_convert_value: number | null;
  manual_input_value: number | null;
}

@Component({
  selector: 'app-premium-promotion-panel',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
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

                <!-- แปลงส่วนลด -->
                <div class="flex items-center">
                  @if (row.category === 'premium') {
                    <mat-checkbox
                      [checked]="row.convert_to_discount"
                      (change)="onConvertToggle(i, $event.checked)"
                      color="primary">
                      <span class="text-sm" style="color: var(--color-text-primary)">แปลงส่วนลด</span>
                    </mat-checkbox>
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
  // โหลดใหม่ — เราต้องคงค่าที่ user กรอกไว้ (used_value ของ manual/fixed, convert_to_discount, remark)
  // แต่ปรับ calculated_value/formula_display/warnings ให้ตรงกับ BE ใหม่
  private rebuildEffect = effect(() => {
    const items = this.eligibleItems();
    const initRows = this.initialRows();
    if (items.length === 0) {
      this.rows.set([]);
      return;
    }
    // อ่าน rows ปัจจุบันแบบไม่ติดตาม (กัน infinite loop)
    const inFlight = untracked(() => this.rows());

    // ลำดับความสำคัญของค่าที่จะ merge:
    // 1) initialRows (edit mode — มีก็ต่อเมื่อโหลดรายการเดิมเข้ามา)
    // 2) inFlight (ค่าที่ user กำลังกรอกอยู่)
    const savedMap = new Map<number, PanelARow>();
    for (const r of inFlight) {
      if (r.promotion_item_id) savedMap.set(r.promotion_item_id, r);
    }
    for (const r of initRows) {
      savedMap.set(r.promotion_item_id, r);
    }

    const newRows = items.map(item => {
      const saved = savedMap.get(item.id);
      const fresh = this.buildRow(item);
      if (!saved) {
        // ไม่มีค่าเดิม — edit mode ใหม่ใส่ used_value=0; ปกติใช้ default จาก buildRow
        return initRows.length > 0 ? { ...fresh, used_value: 0 } : fresh;
      }
      // มีค่าเดิม — preserve user input + อัปเดต server-derived fields
      return {
        ...fresh,
        // value_mode='calculated' → ใช้ค่าใหม่จาก BE; โหมดอื่น → คงค่าที่ user กรอก
        used_value:           item.value_mode === 'calculated' ? fresh.used_value : saved.used_value,
        convert_to_discount:  saved.convert_to_discount,
        remark:               saved.remark,
        manual_input_value:   saved.manual_input_value,
      };
    });
    this.rows.set(newRows);
    this.emitChanges(newRows);
  });

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
      convert_to_discount: false,
      funding_source_type: 'UNIT_STANDARD',
      formula_display: item.formula_display,
      fee_formula: item.fee_formula,
      effective_rate: item.effective_rate,
      effective_buyer_share: item.effective_buyer_share,
      warnings: item.warnings ?? [],
      remark: '',
      manual_input_value: null,
      discount_convert_value: item.discount_convert_value ?? null,
    };
  }

  // ─── Event handlers ──────────────────────────────────────────────────

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

  onConvertToggle(index: number, checked: boolean): void {
    this.rows.update(rows => {
      const updated = [...rows];
      updated[index] = { ...updated[index], convert_to_discount: checked };
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

  /** ดึง effective_category ตาม convert_to_discount */
  getEffectiveCategory(row: PanelARow): string {
    if (row.convert_to_discount && row.category === 'premium') {
      return 'discount';
    }
    return row.category;
  }

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
