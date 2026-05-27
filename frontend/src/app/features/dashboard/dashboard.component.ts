import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DashboardApiService, Phase, DashboardData, DiscountResult } from './dashboard-api.service';

const VALUE_BASIS_STORAGE_KEY = 'dashboard_value_basis';
function restoreValueBasis(): 'selling' | 'cost' {
  try {
    return localStorage.getItem(VALUE_BASIS_STORAGE_KEY) === 'cost' ? 'cost' : 'selling';
  } catch {
    return 'selling';
  }
}
import { ProjectService } from '../../core/services/project.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../shared/components/section-card/section-card.component';
import { SvgIconComponent } from '../../shared/components/svg-icon/svg-icon.component';
import { CurrencyMaskDirective } from '../../shared/directives/currency-mask.directive';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatSelectModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatTooltipModule, MatProgressSpinnerModule,
    PageHeaderComponent, SectionCardComponent, SvgIconComponent,
    CurrencyMaskDirective,
    ThaiDatePipe,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private api = inject(DashboardApiService);
  private project = inject(ProjectService);

  constructor() {
    // Reactive: เมื่อ user เปลี่ยนโครงการ (signal selectedProject เปลี่ยน) → reload data ใหม่
    // ครอบคลุมทั้งกรณี first-load และกรณีอยู่หน้า dashboard อยู่แล้วแล้ว switch project
    effect(() => {
      const id = this.project.selectedProject()?.id;
      if (!id) return;
      // ครอบ untracked เพื่อกัน effect re-fire เมื่อ valueBasis/selectedPhaseId เปลี่ยน
      // (loadDashboard อ่าน signal เหล่านี้ — ถ้าไม่ untracked effect จะ track โดยไม่ตั้งใจ)
      untracked(() => {
        this.selectedPhaseId.set(null);
        this.discountInput.set(0);
        this.discountResult.set(null);
        // valueBasis คง user preference ข้ามโครงการ — restore จาก localStorage
        this.valueBasis.set(restoreValueBasis());
        this.loadPhases();
        this.loadDashboard();
      });
    });
  }

  // ── State ─────────────────────────────────────────────────────────────
  loading = signal(true);
  error = signal<string | null>(null);
  phases = signal<Phase[]>([]);
  selectedPhaseId = signal<number | null>(null);
  /** ฐานคำนวณ stock_value: selling = base_price, cost = unit_cost — persist ใน localStorage */
  valueBasis = signal<'selling' | 'cost'>(restoreValueBasis());
  dashboardData = signal<DashboardData | null>(null);
  discountInput = signal<number>(0);
  discountResult = signal<DiscountResult | null>(null);
  calculatingDiscount = signal(false);

  projectName = computed(() => this.project.selectedProject()?.name ?? '');

  // ── Legacy computed signals ───────────────────────────────────────────

  /** มีข้อมูลระบบเก่าหรือไม่ */
  hasLegacy = computed(() => this.dashboardData()?.legacy != null);

  /** จำนวนยูนิตรวม (ระบบเก่า + ระบบใหม่) */
  combinedSoldUnits = computed(() => {
    const data = this.dashboardData();
    if (!data) return 0;
    return (data.legacy?.sold_units ?? 0) + data.sold_units;
  });

  /** มูลค่าขายสุทธิรวม (ระบบเก่า + ระบบใหม่) */
  combinedSoldNetPrice = computed(() => {
    const data = this.dashboardData();
    if (!data) return 0;
    return (data.legacy?.sold_net_price ?? 0) + data.sold_net_price;
  });

  /** ราคาเฉลี่ยต่อยูนิตรวม คำนวณจาก combined */
  combinedAvgPriceSold = computed(() => {
    const units = this.combinedSoldUnits();
    const net = this.combinedSoldNetPrice();
    return units > 0 ? net / units : 0;
  });

  /** มูลค่าส่วนลดรวม (ระบบเก่า + ระบบใหม่) — ดึงจาก discountResult */
  combinedTotalDiscountAmount = computed(() => {
    const result = this.discountResult();
    if (!result) return 0;
    return (result.legacy?.total_discount_amount ?? 0) + result.total_discount_amount;
  });

  /** มูลค่าโครงการที่ทำได้รวม (ระบบเก่า + ระบบใหม่) — ดึงจาก discountResult */
  combinedValueAchieved = computed(() => {
    const result = this.discountResult();
    if (!result) return 0;
    return (result.legacy?.value_achieved ?? 0) + result.value_achieved;
  });

  // ── Section 4 (สรุปการขาย ทั้งโครงการ) combined ─────────────────────────
  // legacy_unit_count + legacy_unit_base_price_sum มาจาก project_units ที่ flag = caldiscount
  // (ราย unit จริง) ต่างจาก legacy aggregate (projects.legacy_*) ที่ user กรอกเองเป็น aggregate

  /** จำนวนยูนิตทั้งโครงการ = ระบบใหม่ + caldiscount units */
  combinedTotalUnits = computed(() => {
    const r = this.discountResult();
    if (!r) return 0;
    return r.total_units + (r.legacy_unit_count ?? 0);
  });

  /** มูลค่าโครงการที่อนุมัติ — ถ้า user กรอกเองใน projects → ใช้ค่าตรง (สมมุติรวมแล้ว)
   *  ไม่งั้น approved (SUM unit_cost ระบบใหม่) + unit_cost ของ caldiscount units */
  combinedApprovedProjectValue = computed(() => {
    const r = this.discountResult();
    if (!r) return 0;
    if (r.approved_from_user_input) return r.approved_project_value;
    return r.approved_project_value + (r.legacy_unit_cost_sum ?? 0);
  });

  /** มูลค่าขายสุทธิทั้งโครงการ = project_net_sales (new) + legacy aggregate sold_net_price */
  combinedProjectNetSales = computed(() => {
    const r = this.discountResult();
    if (!r) return 0;
    return r.project_net_sales + (r.legacy?.sold_net_price ?? 0);
  });

  /** ราคาเฉลี่ย/ยูนิต ทั้งโครงการ — combined sales / combined units */
  combinedAvgPriceProject = computed(() => {
    const units = this.combinedTotalUnits();
    return units > 0 ? this.combinedProjectNetSales() / units : 0;
  });

  /** มูลค่าส่วนต่าง = achieved (combined) − approved (combined) */
  combinedValueDifference = computed(() => {
    return this.combinedValueAchieved() - this.combinedApprovedProjectValue();
  });

  /** % ส่วนต่าง = diff / approved (combined) × 100 */
  combinedDifferencePercent = computed(() => {
    const approved = this.combinedApprovedProjectValue();
    return approved > 0 ? (this.combinedValueDifference() / approved) * 100 : 0;
  });

  /** มีข้อมูล legacy unit (caldiscount sync) — ใช้แสดง breakdown */
  hasLegacyUnits = computed(() => (this.dashboardData()?.legacy_unit_count ?? 0) > 0);

  get projectId(): number {
    const id = this.project.selectedProject()?.id;
    return id ? Number(id) : 0;
  }

  // ── Data Loading ──────────────────────────────────────────────────────

  loadPhases(): void {
    this.api.getPhases(this.projectId).subscribe({
      next: data => this.phases.set(data ?? []),
      error: () => this.phases.set([]),
    });
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.getDashboard(this.projectId, this.selectedPhaseId(), this.valueBasis()).subscribe({
      next: data => {
        this.dashboardData.set(data);
        this.loading.set(false);
        // Auto-calculate discount ด้วยค่า 0 เพื่อ populate Section 3-4
        this.doCalculateDiscount(this.discountInput());
      },
      error: () => {
        this.error.set('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');
        this.loading.set(false);
      },
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────

  onPhaseChange(phaseId: number | null): void {
    this.selectedPhaseId.set(phaseId);
    this.discountInput.set(0);
    this.discountResult.set(null);
    this.loadDashboard();
  }

  onValueBasisChange(basis: 'selling' | 'cost'): void {
    if (basis === this.valueBasis()) return;
    this.valueBasis.set(basis);
    try { localStorage.setItem(VALUE_BASIS_STORAGE_KEY, basis); } catch { /* ignore */ }
    this.discountInput.set(0);
    this.discountResult.set(null);
    this.loadDashboard();
  }

  onCalculateDiscount(): void {
    this.doCalculateDiscount(this.discountInput());
  }

  onResetDiscount(): void {
    this.discountInput.set(0);
    this.doCalculateDiscount(0);
  }

  retry(): void {
    this.loadDashboard();
  }

  private doCalculateDiscount(discount: number): void {
    this.calculatingDiscount.set(true);
    this.api.calculateDiscount(this.projectId, discount, this.selectedPhaseId(), this.valueBasis()).subscribe({
      next: data => {
        this.discountResult.set(data);
        this.calculatingDiscount.set(false);
      },
      error: () => {
        this.calculatingDiscount.set(false);
      },
    });
  }

  // ── Formatters ────────────────────────────────────────────────────────

  formatNumber(value: number | undefined | null, decimals: number = 2): string {
    if (value == null || isNaN(value)) return '0.00';
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  formatInteger(value: number | undefined | null): string {
    if (value == null || isNaN(value)) return '0';
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
}
