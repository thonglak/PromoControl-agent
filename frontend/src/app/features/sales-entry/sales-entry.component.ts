import { Component, inject, signal, computed, viewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ProjectService } from '../../core/services/project.service';
import { AuthService } from '../../core/services/auth.service';
import { SalesEntryService, EligibleResponse } from './services/sales-entry.service';
import { UnitInfoSectionComponent } from './unit-info-section/unit-info-section.component';
import { BudgetOverviewSectionComponent } from './budget-overview-section/budget-overview-section.component';
import { PremiumPromotionPanelComponent, PanelARow } from './premium-promotion-panel/premium-promotion-panel.component';
import { AdditionalPromotionPanelComponent, PanelBRow, BudgetSourceInfo } from './additional-promotion-panel/additional-promotion-panel.component';
import { SummarySectionComponent, BudgetSummary } from './summary-section/summary-section.component';
import { ConfirmSaleDialogComponent, ConfirmSaleDialogData } from './confirm-sale-dialog.component';
import { Unit } from '../master-data/units/unit-api.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/** แปลง Date หรือ Moment → YYYY-MM-DD string */
function toISODateStr(d: any): string {
  if (!d) return '';
  const y = typeof d.year === 'function' ? d.year() : d.getFullYear();
  const m = String((typeof d.month === 'function' ? d.month() : d.getMonth()) + 1).padStart(2, '0');
  const dd = String(typeof d.date === 'function' ? d.date() : d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

@Component({
  selector: 'app-sales-entry',
  standalone: true,
  imports: [
    PageHeaderComponent,
    CommonModule, MatSnackBarModule, MatButtonModule, MatProgressSpinnerModule, MatDialogModule,
    UnitInfoSectionComponent, BudgetOverviewSectionComponent,
    PremiumPromotionPanelComponent, AdditionalPromotionPanelComponent,
    SummarySectionComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <app-page-header [title]="editMode() ? 'แก้ไขรายการขาย' : 'บันทึกรายการขาย'" [subtitle]="editMode() ? '#' + editTransaction()?.sales_transaction?.sale_no : 'บันทึกข้อมูลการขายและโปรโมชั่น'" />

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- ── Left column: form sections (2/3) ── -->
        <div class="lg:col-span-2 flex flex-col gap-6">

          <!-- Section 1: ข้อมูลยูนิต -->
          <app-unit-info-section
            (unitSelected)="onUnitSelected($event)"
            (saleDateChanged)="onSaleDateChanged($event)" />

          <!-- Section 2: งบประมาณ -->
          <app-budget-overview-section [unitId]="selectedUnitId()" [editReversal]="editReversal()" />

          <!-- Section 3A/3B -->
          @if (selectedUnitId() > 0) {
            @if (loadingEligible()) {
              <div class="section-card text-center">
                <mat-spinner diameter="32" class="mx-auto mb-2"></mat-spinner>
                <div class="text-sm" style="color: var(--color-gray-500)">กำลังโหลดรายการโปรโมชั่น...</div>
              </div>
            }

            @if (eligibleData()) {
              <!-- Panel 3A -->
              <app-premium-promotion-panel
                [eligibleItems]="panelAItems()"
                [unitBudget]="unitStandardBudget()"
                [unitBudgetUsed]="unitBudgetUsedFromMovements()"
                [initialRows]="editPanelARows()"
                (panelAItemsChanged)="onPanelAItemsChanged($event)" />

              <!-- Panel 3B -->
              <app-additional-promotion-panel
                [eligibleItems]="panelBItems()"
                [budgetSources]="budgetSourcesForPanelB()"
                [initialRows]="editPanelBRows()"
                (panelBItemsChanged)="onPanelBItemsChanged($event)" />
            }
          }
        </div>

        <!-- ── Right column: sticky summary (1/3) ── -->
        <div class="lg:col-span-1">
          <div class="sticky" style="top: 80px">
            @if (selectedUnitId() > 0 && eligibleData()) {
              <app-summary-section
                [panelAItems]="currentPanelARows()"
                [panelBItems]="currentPanelBRows()"
                [basePrice]="selectedUnit()?.base_price ?? 0"
                [unitCost]="selectedUnit()?.unit_cost ?? 0"
                [standardBudget]="unitStandardBudget()"
                [budgetSummary]="budgetSummaryForSection4()" />

              <!-- ปุ่มบันทึก -->
              @if (canEdit()) {
                <button mat-flat-button color="primary"
                  class="w-full !text-base !h-12 mt-4"
                  style="border-radius: var(--radius-md)"
                  [disabled]="saving()"
                  (click)="onSave()">
                  @if (saving()) {
                    <mat-spinner diameter="20" class="inline-block mr-2"></mat-spinner>
                  }
                  {{ editMode() ? 'บันทึกการแก้ไข' : 'บันทึกรายการขาย' }}
                </button>
              }
            } @else {
              <div class="section-card text-center" style="color: var(--color-gray-500)">
                <p class="text-sm">เลือกยูนิตเพื่อดูสรุปการขาย</p>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SalesEntryComponent implements OnInit {
  private project = inject(ProjectService);
  private auth = inject(AuthService);
  private salesSvc = inject(SalesEntryService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Edit mode
  readonly editMode = signal(false);
  readonly editTxId = signal<number>(0);
  readonly editTransaction = signal<any>(null);

  readonly unitInfoSection = viewChild(UnitInfoSectionComponent);
  readonly budgetSection = viewChild(BudgetOverviewSectionComponent);

  // State
  readonly selectedUnit = signal<Unit | null>(null);
  readonly selectedUnitId = computed(() => this.selectedUnit()?.id ?? 0);
  readonly saleDate = signal<string>(this.formatToday());
  readonly eligibleData = signal<EligibleResponse | null>(null);
  readonly loadingEligible = signal(false);
  readonly saving = signal(false);

  // Panel rows
  readonly currentPanelARows = signal<PanelARow[]>([]);
  readonly currentPanelBRows = signal<PanelBRow[]>([]);

  readonly canEdit = computed(() => this.editMode() ? true : this.project.canEdit());

  /** edit mode: สร้าง initialRows สำหรับ Panel A จากรายการเดิม (UNIT_STANDARD) */
  readonly editPanelARows = computed<PanelARow[]>(() => {
    const tx = this.editTransaction();
    if (!tx || !this.editMode()) return [];
    const items: any[] = tx.items ?? [];
    return items
      .filter((s: any) => s.funding_source_type === 'UNIT_STANDARD')
      .map((s: any) => ({
        promotion_item_id: Number(s.promotion_item_id),
        name: s.promotion_item_name ?? '',
        category: s.promotion_category ?? s.original_category ?? 'discount',
        value_mode: s.value_mode ?? 'fixed',
        max_value: null,
        calculated_value: null,
        used_value: Number(s.used_value) || 0,
        convert_to_discount: s.convert_to_discount === '1' || s.convert_to_discount === true,
        funding_source_type: 'UNIT_STANDARD' as const,
        formula_display: null,
        fee_formula: null,
        effective_rate: null,
        effective_buyer_share: null,
        warnings: [],
        remark: s.remark ?? '',
        discount_convert_value: null,
        manual_input_value: s.manual_input_value ? Number(s.manual_input_value) : null,
      }));
  });

  /** edit mode: สร้าง initialRows สำหรับ Panel B จากรายการเดิม */
  readonly editPanelBRows = computed<PanelBRow[]>(() => {
    const tx = this.editTransaction();
    if (!tx || !this.editMode()) return [];
    const items: any[] = tx.items ?? [];
    return items
      .filter((s: any) => s.funding_source_type !== 'UNIT_STANDARD')
      .map((s: any) => ({
        promotion_item_id: Number(s.promotion_item_id),
        name: s.promotion_item_name ?? '',
        category: s.promotion_category ?? s.original_category ?? 'discount',
        value_mode: s.value_mode ?? 'fixed',
        max_value: null,
        used_value: Number(s.used_value) || 0,
        funding_source_type: s.funding_source_type,
        remark: s.remark ?? '',
        manual_input_value: s.manual_input_value ? Number(s.manual_input_value) : null,
        calculated_value: null,
        effective_rate: null,
        effective_buyer_share: null,
        fee_formula: null,
        formula_display: null,
        warnings: [],
      }));
  });
  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id > 0) {
      this.editMode.set(true);
      this.editTxId.set(id);
      this.loadEditTransaction(id);
    }
  }

  /** edit mode: รวม used_value ของรายการเดิมแยกตาม funding_source_type เพื่อหักกลับจาก budget */
  readonly editReversal = computed<Record<string, number>>(() => {
    const tx = this.editTransaction();
    if (!tx || !this.editMode()) return {};
    const items: any[] = tx.items ?? [];
    const result: Record<string, number> = {};
    for (const item of items) {
      const source = item.funding_source_type;
      result[source] = (result[source] ?? 0) + Number(item.used_value ?? 0);
    }
    return result;
  });

  readonly panelAItems = computed(() => this.eligibleData()?.panel_a ?? []);
  readonly panelBItems = computed(() => this.eligibleData()?.panel_b ?? []);

  // Budget info
  readonly unitStandardBudget = computed(() => this.eligibleData()?.unit?.standard_budget ?? 0);

  readonly unitBudgetUsedFromMovements = computed(() => {
    const section = this.budgetSection();
    if (!section) return 0;
    const summary = section.summary();
    const raw = summary?.UNIT_STANDARD?.used ?? 0;
    // edit mode: หักรายการเดิมออก เพื่อแสดงเหมือนตอนบันทึกครั้งแรก
    const reversal = this.editReversal()['UNIT_STANDARD'] ?? 0;
    return raw - reversal;
  });

  readonly unitStandardRemaining = computed(() => {
    const section = this.budgetSection();
    if (!section) return 0;
    const summary = section.summary();
    const raw = summary?.UNIT_STANDARD?.remaining ?? 0;
    const reversal = this.editReversal()['UNIT_STANDARD'] ?? 0;
    return raw + reversal;
  });

  readonly totalBudgetAllocated = computed(() => {
    const section = this.budgetSection();
    if (!section) return 0;
    return section.totalAllocated();
  });

  readonly allSourcesUsedFromMovements = computed(() => {
    const section = this.budgetSection();
    if (!section) return 0;
    const summary = section.summary();
    if (!summary) return 0;
    const rev = this.editReversal();
    return (summary.UNIT_STANDARD?.used ?? 0) - (rev['UNIT_STANDARD'] ?? 0)
      + (summary.MANAGEMENT_SPECIAL?.used ?? 0) - (rev['MANAGEMENT_SPECIAL'] ?? 0)
      + (summary.PROJECT_POOL?.used ?? 0) - (rev['PROJECT_POOL'] ?? 0);
  });

  /** budgetSummary สำหรับ Section 4 — ดึงจาก budgetRows ของ Section 2 (รวม pending) */
  readonly budgetSummaryForSection4 = computed<BudgetSummary | null>(() => {
    const section = this.budgetSection();
    if (!section) return null;
    const rows = section.budgetRows();
    if (!rows || rows.length === 0) return null;

    const result: Record<string, { allocated: number; used: number; remaining: number }> = {};
    for (const row of rows) {
      result[row.key] = { allocated: row.allocated, used: row.used, remaining: row.remaining };
    }

    return {
      UNIT_STANDARD: result['UNIT_STANDARD'] ?? { allocated: 0, used: 0, remaining: 0 },
      PROJECT_POOL: result['PROJECT_POOL'] ?? { allocated: 0, used: 0, remaining: 0 },
      MANAGEMENT_SPECIAL: result['MANAGEMENT_SPECIAL'] ?? { allocated: 0, used: 0, remaining: 0 },
    };
  });

  /**
   * budgetSourcesForPanelB — ใช้ remaining จาก summary (ก่อนหัก pending)
   * เพราะ Panel 3B จะหัก usedAmt เองใน footer
   * ถ้าใช้ budgetRows() ที่หัก pendingUsed แล้ว จะเกิด double subtraction
   */
  readonly budgetSourcesForPanelB = computed<BudgetSourceInfo[]>(() => {
    const section = this.budgetSection();
    if (!section) return [];
    const s = section.summary();
    if (!s) return [];
    const rev = this.editReversal();

    const SOURCE_KEYS = ['MANAGEMENT_SPECIAL', 'PROJECT_POOL'];
    const SOURCE_LABELS: Record<string, string> = {
      MANAGEMENT_SPECIAL: 'งบผู้บริหาร',
      PROJECT_POOL: 'งบส่วนกลาง',
    };

    return SOURCE_KEYS.map(key => {
      const src = (s as any)[key] as { allocated: number; used: number; remaining: number } | undefined;
      const reversal = rev[key] ?? 0;
      return {
        key,
        label: SOURCE_LABELS[key] ?? key,
        allocated: src?.allocated ?? 0,
        remaining: (src?.remaining ?? 0) + reversal,
      };
    });
  });

  // ─── Event Handlers ──────────────────────────────────────────────────

  onUnitSelected(unit: Unit | null): void {
    this.selectedUnit.set(unit);
    this.eligibleData.set(null);
    this.currentPanelARows.set([]);
    this.currentPanelBRows.set([]);
    if (unit) {
      this.loadEligibleItems(unit.id, this.saleDate());
    }
  }

  onSaleDateChanged(date: string): void {
    this.saleDate.set(date);
    const uid = this.selectedUnitId();
    if (uid > 0) {
      this.loadEligibleItems(uid, date);
    }
  }

  onPanelAItemsChanged(rows: PanelARow[]): void {
    this.currentPanelARows.set(rows);
    this.syncBudgetPendingUsed();
  }

  onPanelBItemsChanged(rows: PanelBRow[]): void {
    this.currentPanelBRows.set(rows);
    this.syncBudgetPendingUsed();
  }

  // ─── Save ────────────────────────────────────────────────────────────

  onSave(): void {
    // 1. Validate Section 1
    const unitInfo = this.unitInfoSection();
    if (!unitInfo || !unitInfo.isValid()) {
      this.snack.open('กรุณากรอกข้อมูลยูนิตให้ครบ', 'ปิด', { duration: 4000 });
      return;
    }

    const unit = this.selectedUnit();
    if (!unit) return;

    // 2. Build items
    const items = this.buildItemsPayload();
    if (items.length === 0) {
      this.snack.open('ไม่มีรายการโปรโมชั่นที่จะบันทึก (used_value > 0)', 'ปิด', { duration: 4000 });
      return;
    }

    // 3. Calculate summary for confirmation dialog
    const formValues = unitInfo.getFormValues();
    const totalUsed = items.reduce((sum, i) => sum + i.used_value, 0);

    // effective_category-based calculation for net_price & profit
    let totalDiscount = 0;
    let totalPromoCost = 0;
    let totalExpense = 0;
    for (const item of items) {
      const effCat = item.effective_category;
      if (effCat === 'discount') {
        // ถ้าแปลงเป็นส่วนลด + มี discount_convert_value → ใช้ค่านั้น
        totalDiscount += item.discount_convert_value ?? item.used_value;
      } else if (effCat === 'premium') {
        totalPromoCost += item.used_value;
      } else if (effCat === 'expense_support') {
        totalExpense += item.used_value;
      }
    }
    const netPrice = unit.base_price - totalDiscount;
    const netAfterPromo = netPrice - (totalPromoCost + totalExpense);
    const profit = netAfterPromo - unit.unit_cost;

    // 4. Confirmation dialog
    const dialogData: ConfirmSaleDialogData = {
      unitCode: unit.unit_code,
      netAfterPromo,
      netPrice,
      profit,
      totalUsed,
    };

    const ref = this.dialog.open(ConfirmSaleDialogComponent, {
      data: dialogData,
      width: '420px',
      maxHeight: '90vh',
    });

    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.executeSave(unit, formValues, items);
      }
    });
  }

  private executeSave(
    unit: Unit,
    formValues: { customer_name: string; salesperson: string; sale_date: string },
    items: any[]
  ): void {
    const payload = {
      project_id: this.projectId(),
      unit_id: unit.id,
      sale_date: formValues.sale_date,
      customer_name: formValues.customer_name,
      salesperson: formValues.salesperson,
      items: items.map(i => ({
        promotion_item_id: i.promotion_item_id,
        used_value: i.used_value,
        convert_to_discount: i.convert_to_discount ?? false,
        funding_source_type: i.funding_source_type,
        manual_input_value: i.manual_input_value ?? null,
        remark: i.remark || '',
      })),
    };

    this.saving.set(true);
    const obs = this.editMode()
      ? this.salesSvc.updateTransaction(this.editTxId(), payload)
      : this.salesSvc.createTransaction(payload);
    obs.subscribe({
      next: (result: any) => {
        this.saving.set(false);
        this.snack.open(this.editMode() ? 'แก้ไขรายการขายสำเร็จ' : 'บันทึกรายการขายสำเร็จ', 'ปิด', { duration: 4000 });
        const txId = this.editMode() ? this.editTxId() : result?.sales_transaction?.id;
        this.router.navigate(txId ? ['/sales', txId] : ['/sales']);
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err?.error?.error || 'เกิดข้อผิดพลาดในการบันทึก', 'ปิด', { duration: 5000 });
      },
    });
  }

  private buildItemsPayload(): any[] {
    const items: any[] = [];

    // Panel 3A: เฉพาะ used_value > 0
    for (const row of this.currentPanelARows()) {
      if (row.used_value > 0) {
        const isConvert = row.convert_to_discount && row.category === 'premium';
        items.push({
          promotion_item_id: row.promotion_item_id,
          used_value: row.used_value,
          convert_to_discount: row.convert_to_discount,
          effective_category: isConvert ? 'discount' : row.category,
          discount_convert_value: isConvert && row.discount_convert_value ? row.discount_convert_value : null,
          funding_source_type: row.funding_source_type,
          manual_input_value: row.manual_input_value,
          remark: row.remark,
        });
      }
    }

    // Panel 3B: เฉพาะ has item selected + used_value > 0
    for (const row of this.currentPanelBRows()) {
      if (row.promotion_item_id && row.used_value > 0) {
        items.push({
          promotion_item_id: row.promotion_item_id,
          used_value: row.used_value,
          convert_to_discount: false, // Panel 3B ไม่มีสิทธิ์แปลง
          effective_category: row.category,
          funding_source_type: row.funding_source_type,
          manual_input_value: row.manual_input_value,
          remark: row.remark,
        });
      }
    }

    return items;
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private syncBudgetPendingUsed(): void {
    const budgetSection = this.budgetSection();
    if (!budgetSection) return;

    const pending: Record<string, number> = {};
    pending['UNIT_STANDARD'] = this.currentPanelARows().reduce((sum, r) => sum + r.used_value, 0);

    for (const row of this.currentPanelBRows()) {
      if (row.promotion_item_id && row.used_value > 0) {
        pending[row.funding_source_type] = (pending[row.funding_source_type] ?? 0) + row.used_value;
      }
    }

    budgetSection.updatePendingUsed(pending);
  }

  private loadEligibleItems(unitId: number, saleDate: string): void {
    const pid = this.projectId();
    if (pid <= 0) return;

    this.loadingEligible.set(true);
    this.salesSvc.getEligibleItems(pid, unitId, saleDate).subscribe({
      next: data => {
        this.eligibleData.set(data);
        this.loadingEligible.set(false);
        // ถ้า edit mode, pre-fill panels หลังโหลด eligible items เสร็จ
        if (this.editMode() && this.editTransaction()) {
          setTimeout(() => this.applyEditItems(), 100);
        }
      },
      error: err => {
        this.loadingEligible.set(false);
        this.snack.open(err?.error?.error || 'ไม่สามารถโหลดรายการโปรโมชั่นได้', 'ปิด', { duration: 5000 });
      },
    });
  }

  private loadEditTransaction(id: number): void {
    this.salesSvc.getTransaction(id).subscribe({
      next: async (res: any) => {
        this.editTransaction.set(res);
        const tx = res.sales_transaction;
        const projectId = Number(tx.project_id);

        // 1. ตั้ง project context ถ้ายังไม่ได้เลือก
        if (this.projectId() !== projectId) {
          const user = this.auth.currentUser();
          const proj = user?.projects?.find((p: any) => Number(p.id) === projectId);
          if (proj) {
            this.project.selectProject(proj);
          }
        }

        // 2. โหลด units สำหรับ project นี้ + อนุญาต sold unit
        const unitInfo = this.unitInfoSection();
        if (unitInfo) {
          unitInfo.allowSoldUnit.set(true);
          await unitInfo.loadUnitsForProject(projectId);

          // 3. Pre-fill controls หลังจาก units โหลดเสร็จ
          // unit.id จาก API เป็น string — ส่งค่าตรงๆ ให้ match กับ mat-option [value]
          unitInfo.unitControl.setValue(tx.unit_id as any);
          // edit mode: ห้ามเปลี่ยนยูนิต
          unitInfo.unitControl.disable();
          unitInfo.customerNameControl.setValue(tx.customer_name ?? '');
          unitInfo.salespersonControl.setValue(tx.salesperson ?? '');
          if (tx.sale_date) {
            unitInfo.saleDateControl.setValue(new Date(tx.sale_date + 'T00:00:00'));
          }
        }
      },
      error: () => {
        this.snack.open('ไม่สามารถโหลดรายการขายได้', 'ปิด', { duration: 4000 });
      },
    });
  }

  /** เรียกหลัง eligible items โหลดเสร็จ เพื่อ sync budget (Panel A/B ใช้ initialRows input แทน) */
  private applyEditItems(): void {
    const editTx = this.editTransaction();
    if (!editTx || !this.editMode()) return;
    this.syncBudgetPendingUsed();
  }

  private formatToday(): string {
    const d = new Date();
    return toISODateStr(d);
  }
}
