import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';

import { DashboardApiService, DashboardSummary, RecentSale, DashboardCharts, UnitStatusItem, BudgetUsageItem } from './dashboard-api.service';
import { ProjectService } from '../../core/services/project.service';
import { AuthService } from '../../core/services/auth.service';
import { SvgIconComponent } from '../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { SectionCardComponent } from '../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../shared/components/status-chip/status-chip.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { formatThaiDate } from '../../shared/pipes/thai-date.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    ThaiDatePipe,
    CommonModule, MatButtonModule, MatProgressSpinnerModule, MatTableModule,
    SvgIconComponent, PageHeaderComponent, StatCardComponent,
    SectionCardComponent, StatusChipComponent, EmptyStateComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private api = inject(DashboardApiService);
  private project = inject(ProjectService);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(true);
  error = signal<string | null>(null);
  summary = signal<DashboardSummary | null>(null);
  recentSales = signal<RecentSale[]>([]);
  charts = signal<DashboardCharts | null>(null);

  projectName = computed(() => this.project.selectedProject()?.name ?? '');
  canWrite = computed(() => this.project.canEdit());

  get projectId(): number {
    const id = this.project.selectedProject()?.id;
    return id ? Number(id) : 0;
  }

  // ── KPI computed values ─────────────────────────────────────────────────
  totalSalesAmount = computed(() => this.summary()?.project_summary?.total_sales_amount ?? 0);
  totalDiscount = computed(() => this.summary()?.project_summary?.total_discount ?? 0);
  totalProfit = computed(() => this.summary()?.project_summary?.total_profit ?? 0);
  promoBurden = computed(() => this.summary()?.project_summary?.total_promo_burden ?? 0);
  budgetRemaining = computed(() => this.summary()?.budget_summary?.total_budget_remaining ?? 0);
  budgetUsedPercent = computed(() => this.summary()?.budget_summary?.budget_utilization_percent ?? 0);
  totalUnits = computed(() => this.summary()?.project_summary?.total_units ?? 1);

  totalActiveLabel = computed(() => {
    const s = this.summary()?.project_summary;
    return s ? `${s.total_transactions_active ?? 0} รายการ (ปกติ)` : '';
  });

  ngOnInit(): void {
    if (this.projectId) this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.getSummary(this.projectId).subscribe({
      next: data => {
        if (data?.project_summary && data?.budget_summary) this.summary.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');
        this.loading.set(false);
      },
    });

    this.api.getRecentSales(this.projectId, 10).subscribe({
      next: data => this.recentSales.set(data ?? []),
      error: () => this.recentSales.set([]),
    });

    this.api.getCharts(this.projectId).subscribe({
      next: data => { if (data) this.charts.set(data); },
      error: () => {},
    });
  }

  // ── Formatters ──────────────────────────────────────────────────────────

  formatCurrency(value: number | undefined | null): string {
    if (value == null || isNaN(value)) return '฿0';
    return '฿' + new Intl.NumberFormat('th-TH').format(value);
  }

  formatDate(dateStr: string): string {
    return formatThaiDate(dateStr, 'auto');
  }

  getProfitColor(profit: number): string {
    return profit > 0 ? 'var(--color-profit)' : 'var(--color-loss)';
  }

  // ── Chart colors (design tokens) ────────────────────────────────────────

  getUnitStatusColor(status: string): string {
    const map: Record<string, string> = {
      available: 'var(--color-success)',
      reserved: 'var(--color-warning)',
      sold: 'var(--color-info)',
      transferred: 'var(--color-gray-500)',
    };
    return map[status] ?? 'var(--color-gray-300)';
  }

  getBudgetBarColor(item: BudgetUsageItem): string {
    const usedPct = item.allocated > 0 ? (item.used / item.allocated) * 100 : 0;
    if (usedPct > 80) return 'var(--color-loss)';

    const map: Record<string, string> = {
      UNIT_STANDARD: 'var(--color-primary)',
      PROJECT_POOL: 'var(--color-success)',
      MANAGEMENT_SPECIAL: 'var(--color-warning)',
    };
    return map[item.source] ?? 'var(--color-primary-500)';
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  goToSales(): void { this.router.navigate(['/sales']); }
  goToBudget(): void { this.router.navigate(['/budget']); }
  goToSaleDetail(sale: RecentSale): void { this.router.navigate(['/sales-entry', 'detail', sale.sale_no]); }
  retry(): void { this.loadData(); }
}
