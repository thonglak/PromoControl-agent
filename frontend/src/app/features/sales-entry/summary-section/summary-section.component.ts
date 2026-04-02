import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PanelARow } from '../premium-promotion-panel/premium-promotion-panel.component';
import { PanelBRow } from '../additional-promotion-panel/additional-promotion-panel.component';

/** helper: effective_category ตาม convert_to_discount */
function getEffectiveCategory(item: { category: string; convert_to_discount?: boolean }): string {
  if (item.convert_to_discount && item.category === 'premium') return 'discount';
  return item.category;
}

/** ข้อมูลงบแต่ละแหล่ง */
export interface BudgetSourceSummary {
  allocated: number;
  used: number;
  remaining: number;
  returned?: number;
}

export interface BudgetSummary {
  UNIT_STANDARD: BudgetSourceSummary;
  PROJECT_POOL: BudgetSourceSummary;
  MANAGEMENT_SPECIAL: BudgetSourceSummary;
}

@Component({
  selector: 'app-summary-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="section-card">
      <h3 class="font-semibold mb-4" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">สรุปการขาย</h3>

      <div class="space-y-1 text-sm">
        <!-- 1. ราคาขาย -->
        <div class="flex justify-between py-1">
          <span class="text-slate-600">ราคาขาย (Base Price)</span>
          <span class="tabular-nums font-medium">{{ basePrice() | number:'1.0-0' }}</span>
        </div>

        <!-- 2. ส่วนลดทั้งหมด -->
        <div class="flex justify-between py-1">
          <span class="text-slate-600">ส่วนลดทั้งหมด (Total Discount)</span>
          <span class="tabular-nums text-discount">
            @if (totalDiscount() > 0) { - }{{ totalDiscount() | number:'1.0-0' }}
          </span>
        </div>

        <!-- 3. ราคาสุทธิ -->
        <div class="flex justify-between py-2 px-3 font-bold border-t pt-2" style="background-color: var(--color-primary-100); border-radius: var(--radius-sm); color: var(--color-primary)">
          <span>ราคาสุทธิ (Net Price)</span>
          <span class="tabular-nums text-xl">{{ netPrice() | number:'1.0-0' }}</span>
        </div>

        <!-- ───── separator ───── -->
        <div class="border-t border-slate-300 my-2"></div>

        <!-- 5. ต้นทุนของแถม (Promo Cost) -->
        <div class="flex justify-between py-1">
          <span class="text-slate-600">ต้นทุนของแถม (Promo Cost)</span>
          <span class="tabular-nums">{{ totalPromoCost() | number:'1.0-0' }}</span>
        </div>

        <!-- 6. ค่าใช้จ่ายอุดหนุน -->
        <div class="flex justify-between py-1">
          <span class="text-slate-600">ค่าใช้จ่ายอุดหนุน (Expense Support)</span>
          <span class="tabular-nums">{{ totalExpenseSupport() | number:'1.0-0' }}</span>
        </div>

        <!-- 7. ต้นทุนจากของแถม = 5 + 6 -->
        <div class="flex justify-between py-1 text-slate-500 text-xs">
          <span>ต้นทุนจากของแถม (Promo Cost + Expense)</span>
          <span class="tabular-nums">{{ totalPromoBurden() | number:'1.0-0' }}</span>
        </div>

        <!-- 8. สุทธิ = Net Price - ต้นทุนจากของแถม -->
        <div class="flex justify-between py-1 font-semibold text-slate-800 border-t border-slate-200 pt-2">
          <span>สุทธิ</span>
          <span class="tabular-nums">{{ netAfterPromo() | number:'1.0-0' }}</span>
        </div>

        <!-- ───── separator ───── -->
        <div class="border-t border-slate-300 my-2"></div>

        <!-- 10. ต้นทุนยูนิต -->
        <div class="flex justify-between py-1">
          <span class="text-slate-600">ต้นทุนยูนิต (Unit Cost)</span>
          <span class="tabular-nums">{{ unitCost() | number:'1.0-0' }}</span>
        </div>

        <!-- 11. กำไร = สุทธิ - Unit Cost -->
        <div class="flex justify-between py-2 px-3 text-base font-bold" style="border-radius: var(--radius-sm)"
          [class.text-profit]="profit() >= 0"
          [class.text-loss]="profit() < 0">
          <span>กำไร (Profit)</span>
          <span class="tabular-nums">{{ profit() | number:'1.0-0' }}</span>
        </div>

        <!-- ───── separator ───── -->
        <div class="border-t border-slate-300 my-2"></div>

        <!-- 13. งบยูนิตใช้ไป / งบยูนิตเหลือ -->
        <div class="flex justify-between py-1 text-xs text-slate-500">
          <div class="flex gap-4">
            <span>งบยูนิตใช้ไป: <span class="tabular-nums font-medium text-slate-700">{{ totalPanelAUsed() | number:'1.0-0' }}</span></span>
            <span class="text-slate-300">|</span>
            <span>งบยูนิตเหลือ:
              <span class="tabular-nums font-medium"
                [class.text-loss]="budgetUnitRemain() < 0"
                [class.text-profit]="budgetUnitRemain() > 0"
                [class.text-slate-700]="budgetUnitRemain() === 0">
                {{ budgetUnitRemain() | number:'1.0-0' }}
              </span>
            </span>
          </div>
        </div>

        <!-- 14. งบคงเหลือรวม -->
        <div class="flex justify-between py-1">
          <span class="text-slate-600">งบคงเหลือรวม</span>
          <span class="tabular-nums font-medium"
            [class.text-loss]="totalBudgetRemaining() < 0"
            [class.text-profit]="totalBudgetRemaining() > 0"
            [class.text-slate-700]="totalBudgetRemaining() === 0">
            {{ totalBudgetRemaining() | number:'1.0-0' }}
          </span>
        </div>

        <!-- 15. งบนอกสุทธิที่ใช้ -->
        <div class="flex justify-between py-1">
          <span class="text-slate-600">งบนอกสุทธิที่ใช้</span>
          <span class="tabular-nums font-medium"
            [class.text-discount]="netExtraBudgetUsed() > 0"
            [class.text-profit]="netExtraBudgetUsed() <= 0">
            {{ netExtraBudgetUsed() | number:'1.0-0' }}
          </span>
        </div>
      </div>
    </div>
  `,
})
export class SummarySectionComponent {
  // ─── Inputs ──────────────────────────────────────────────────────────
  panelAItems = input<PanelARow[]>([]);
  panelBItems = input<PanelBRow[]>([]);
  basePrice = input<number>(0);
  unitCost = input<number>(0);
  standardBudget = input<number>(0);
  budgetSummary = input<BudgetSummary | null>(null);

  // ─── Computed: all items (with effective_category) ─────────────────
  readonly allItemsWithCategory = computed(() => {
    const aItems = this.panelAItems().map(r => ({
      effective_category: getEffectiveCategory(r),
      used_value: r.used_value,
      funding_source_type: r.funding_source_type,
    }));
    const bItems = this.panelBItems()
      .filter(r => r.promotion_item_id != null)
      .map(r => ({
        effective_category: getEffectiveCategory(r),
        used_value: r.used_value,
        funding_source_type: r.funding_source_type,
      }));
    return [...aItems, ...bItems];
  });

  // ─── Computed: calculations (ตรงตามสูตรใน business rules) ──────────
  readonly totalDiscount = computed(() =>
    this.allItemsWithCategory()
      .filter(i => i.effective_category === 'discount' && i.used_value > 0)
      .reduce((sum, i) => sum + i.used_value, 0)
  );

  readonly totalPromoCost = computed(() =>
    this.allItemsWithCategory()
      .filter(i => i.effective_category === 'premium' && i.used_value > 0)
      .reduce((sum, i) => sum + i.used_value, 0)
  );

  readonly totalExpenseSupport = computed(() =>
    this.allItemsWithCategory()
      .filter(i => i.effective_category === 'expense_support' && i.used_value > 0)
      .reduce((sum, i) => sum + i.used_value, 0)
  );

  readonly netPrice = computed(() => this.basePrice() - this.totalDiscount());

  readonly totalPromoBurden = computed(() => this.totalPromoCost() + this.totalExpenseSupport());

  // สุทธิ (หลังหักต้นทุนของแถม)
  readonly netAfterPromo = computed(() => this.netPrice() - this.totalPromoBurden());

  // กำไร = สุทธิ - ต้นทุนยูนิต
  readonly profit = computed(() => this.netAfterPromo() - this.unitCost());

  // ─── Computed: budget ────────────────────────────────────────────────

  // งบยูนิตใช้ไป (Panel 3A)
  readonly totalPanelAUsed = computed(() =>
    this.panelAItems()
      .filter(i => i.used_value > 0)
      .reduce((sum, i) => sum + i.used_value, 0)
  );

  // งบยูนิตที่คืนเข้า Pool
  readonly totalUnitBudgetReturned = computed(() => this.budgetSummary()?.UNIT_STANDARD?.returned ?? 0);

  // งบยูนิตเหลือ = standard_budget - totalPanelAUsed - totalUnitBudgetReturned
  readonly budgetUnitRemain = computed(() =>
    this.standardBudget() - this.totalPanelAUsed() - this.totalUnitBudgetReturned()
  );

  // งบอื่นที่ใช้ (Panel 3B ทั้งหมด)
  readonly totalPanelBUsed = computed(() =>
    this.panelBItems()
      .filter(r => r.promotion_item_id != null && r.used_value > 0)
      .reduce((sum, r) => sum + r.used_value, 0)
  );

  // งบคงเหลือรวมทุกแหล่ง
  readonly totalBudgetRemaining = computed(() => {
    const bs = this.budgetSummary();
    if (!bs) return 0;
    return bs.UNIT_STANDARD.remaining
         + bs.PROJECT_POOL.remaining
         + bs.MANAGEMENT_SPECIAL.remaining;
  });

  // งบนอกสุทธิที่ใช้ = งบอื่นที่ใช้ - งบยูนิตเหลือ
  readonly netExtraBudgetUsed = computed(() =>
    this.totalPanelBUsed() - this.budgetUnitRemain()
  );
}
