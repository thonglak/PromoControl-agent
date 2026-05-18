import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DashboardApiService, Phase, DashboardData, DiscountResult } from './dashboard-api.service';
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
export class DashboardComponent implements OnInit {
  private api = inject(DashboardApiService);
  private project = inject(ProjectService);

  // ── State ─────────────────────────────────────────────────────────────
  loading = signal(true);
  error = signal<string | null>(null);
  phases = signal<Phase[]>([]);
  selectedPhaseId = signal<number | null>(null);
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

  get projectId(): number {
    const id = this.project.selectedProject()?.id;
    return id ? Number(id) : 0;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  ngOnInit(): void {
    if (this.projectId) {
      this.loadPhases();
      this.loadDashboard();
    }
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

    this.api.getDashboard(this.projectId, this.selectedPhaseId()).subscribe({
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
    this.api.calculateDiscount(this.projectId, discount, this.selectedPhaseId()).subscribe({
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
