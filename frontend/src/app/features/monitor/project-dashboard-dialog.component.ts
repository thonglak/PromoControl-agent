import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

interface DashboardData {
  // base summary
  sold_units: number;
  sold_net_price: number;
  avg_price_sold: number;
  remaining_units: number;
  stock_value: number;
  avg_price_remaining: number;
  total_units: number;
  approved_project_value: number;
  approved_from_user_input: boolean;
  legacy_unit_count: number;
  legacy_unit_cost_sum: number;
  // from calculateDiscount(0) — same shape as หน้า dashboard ใช้
  net_after_discount: number;
  project_net_sales: number;
  avg_price_project: number;
  value_achieved: number;
  value_difference: number;
  difference_percent: number;
  total_discount_amount: number;
  // legacy reconciliation
  legacy: {
    sold_units?: number;
    sold_net_price?: number;
    total_discount_amount?: number;
    value_achieved?: number;
    as_of_date?: string;
  } | null;
}

export interface ProjectDashboardDialogData {
  token: string;
  projectId: number;
  projectCode: string;
  projectName: string;
}

const VALUE_BASIS_STORAGE_KEY = 'monitor_value_basis';
function restoreValueBasis(): 'selling' | 'cost' {
  try {
    return localStorage.getItem(VALUE_BASIS_STORAGE_KEY) === 'cost' ? 'cost' : 'selling';
  } catch {
    return 'selling';
  }
}

@Component({
  selector: 'app-project-dashboard-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatProgressSpinnerModule, MatTooltipModule],
  template: `
    <div class="!p-0">
      <!-- Header -->
      <div class="px-5 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{{ data.projectCode }}</p>
            <h2 class="text-base font-semibold text-slate-800 leading-tight mt-0.5">{{ data.projectName }}</h2>
          </div>
          <button mat-icon-button (click)="ref.close()" class="!w-8 !h-8 -mr-1 -mt-1 shrink-0">
            <span class="text-slate-500 text-lg leading-none">✕</span>
          </button>
        </div>

        <!-- Value basis toggle (ราคาขาย / ต้นทุน) — ตรงกับหน้า Dashboard -->
        <div class="mt-2 inline-flex rounded-md border border-slate-300 overflow-hidden text-xs">
          <button type="button"
                  class="px-3 py-1 font-medium transition-colors"
                  [class.bg-primary-700]="valueBasis() === 'selling'"
                  [class.text-white]="valueBasis() === 'selling'"
                  [class.bg-white]="valueBasis() !== 'selling'"
                  [class.text-slate-700]="valueBasis() !== 'selling'"
                  [class.hover:bg-slate-50]="valueBasis() !== 'selling'"
                  matTooltip="คำนวณ stock จาก base_price (ราคาขาย)"
                  (click)="setBasis('selling')">
            ราคาขาย
          </button>
          <button type="button"
                  class="px-3 py-1 font-medium border-l border-slate-300 transition-colors"
                  [class.bg-primary-700]="valueBasis() === 'cost'"
                  [class.text-white]="valueBasis() === 'cost'"
                  [class.bg-white]="valueBasis() !== 'cost'"
                  [class.text-slate-700]="valueBasis() !== 'cost'"
                  [class.hover:bg-slate-50]="valueBasis() !== 'cost'"
                  matTooltip="คำนวณ stock จาก unit_cost (ต้นทุน)"
                  (click)="setBasis('cost')">
            ต้นทุน
          </button>
        </div>
      </div>

      <mat-dialog-content class="!p-0 !max-h-[75vh]">
        @if (loading()) {
          <div class="flex flex-col items-center justify-center py-16 gap-3">
            <mat-spinner diameter="32" />
            <p class="text-sm text-slate-500">กำลังโหลด Dashboard…</p>
          </div>
        } @else if (error()) {
          <div class="p-6 text-center">
            <p class="text-sm text-red-700">{{ error() }}</p>
          </div>
        } @else if (dashboardData(); as d) {
          <div class="px-4 py-4 space-y-4 bg-slate-50">

            <!-- Section 1: ยอดขายตั้งแต่เริ่มต้นถึงปัจจุบัน -->
            <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div class="px-4 py-2 bg-slate-50 border-b border-slate-200">
                <p class="text-xs font-semibold text-slate-600">ยอดขายตั้งแต่เริ่มต้นถึงปัจจุบัน</p>
              </div>
              <div class="divide-y divide-slate-100">
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">จำนวนยูนิตที่ขายได้</span>
                  <div class="text-right">
                    <span class="text-sm font-semibold tabular-nums text-slate-800 block">
                      {{ (hasLegacy() ? combinedSoldUnits() : d.sold_units) | number }} ยูนิต
                    </span>
                    @if (hasLegacy()) {
                      <span class="text-[10px] text-slate-400">ระบบใหม่ {{ d.sold_units | number }} · ระบบเก่า {{ (d.legacy?.sold_units ?? 0) | number }}</span>
                    }
                  </div>
                </div>
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">มูลค่าขายสุทธิที่ขายได้</span>
                  <div class="text-right">
                    <span class="text-sm font-semibold tabular-nums text-slate-800 block">
                      ฿{{ (hasLegacy() ? combinedSoldNetPrice() : d.sold_net_price) | number:'1.0-0' }}
                    </span>
                    @if (hasLegacy()) {
                      <span class="text-[10px] text-slate-400">ระบบใหม่ ฿{{ d.sold_net_price | number:'1.0-0' }} · ระบบเก่า ฿{{ (d.legacy?.sold_net_price ?? 0) | number:'1.0-0' }}</span>
                    }
                  </div>
                </div>
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">ราคาเฉลี่ยต่อยูนิตที่ขายได้</span>
                  <span class="text-sm font-semibold tabular-nums text-slate-800">
                    ฿{{ (hasLegacy() ? combinedAvgPriceSold() : d.avg_price_sold) | number:'1.0-0' }}
                  </span>
                </div>
              </div>
            </section>

            <!-- Section 2: Stock ที่เหลือ -->
            <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div class="px-4 py-2 bg-slate-50 border-b border-slate-200">
                <p class="text-xs font-semibold text-slate-600">Stock ที่เหลือ</p>
              </div>
              <div class="divide-y divide-slate-100">
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">จำนวนยูนิตที่เหลือ</span>
                  <span class="text-sm font-semibold tabular-nums text-slate-800">{{ d.remaining_units | number }} ยูนิต</span>
                </div>
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">มูลค่าสุทธิที่เหลือ</span>
                  <span class="text-sm font-semibold tabular-nums text-slate-800">฿{{ d.stock_value | number:'1.0-0' }}</span>
                </div>
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">ราคาเฉลี่ยต่อยูนิตที่เหลือ</span>
                  <span class="text-sm font-semibold tabular-nums text-slate-800">฿{{ d.avg_price_remaining | number:'1.0-0' }}</span>
                </div>
              </div>
            </section>

            <!-- Section 3: สรุปการขาย ทั้งโครงการ -->
            <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div class="px-4 py-2 bg-slate-50 border-b border-slate-200">
                <p class="text-xs font-semibold text-slate-600">สรุปการขาย ทั้งโครงการ</p>
              </div>
              <div class="divide-y divide-slate-100">
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">จำนวนยูนิตทั้งโครงการ</span>
                  <div class="text-right">
                    <span class="text-sm font-semibold tabular-nums text-slate-800 block">
                      {{ combinedTotalUnits() | number }} ยูนิต
                    </span>
                    @if (hasLegacyUnits()) {
                      <span class="text-[10px] text-slate-400">ระบบใหม่ {{ d.total_units | number }} · ระบบเก่า {{ d.legacy_unit_count | number }}</span>
                    }
                  </div>
                </div>
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">มูลค่าขายสุทธิทั้งโครงการ</span>
                  <span class="text-sm font-semibold tabular-nums text-slate-800">฿{{ combinedProjectNetSales() | number:'1.0-0' }}</span>
                </div>
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">มูลค่าโครงการที่อนุมัติ</span>
                  <span class="text-sm font-semibold tabular-nums text-slate-800">฿{{ combinedApprovedProjectValue() | number:'1.0-0' }}</span>
                </div>
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500">มูลค่าโครงการที่ทำได้</span>
                  <span class="text-sm font-semibold tabular-nums text-slate-800">
                    ฿{{ combinedValueAchieved() | number:'1.0-0' }}
                  </span>
                </div>
                <div class="px-4 py-2.5 flex items-center justify-between">
                  <span class="text-xs text-slate-500 flex items-center gap-1">
                    มูลค่าส่วนต่าง
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                         class="w-3.5 h-3.5 text-slate-400 cursor-help shrink-0"
                         matTooltip="มูลค่าส่วนต่าง = มูลค่าโครงการที่ทำได้ − มูลค่าโครงการที่อนุมัติ&#10;฿{{ combinedValueAchieved() | number:'1.0-0' }} − ฿{{ combinedApprovedProjectValue() | number:'1.0-0' }} = ฿{{ combinedValueDifference() | number:'1.0-0' }}"
                         matTooltipClass="tooltip-multiline"
                         matTooltipPosition="above">
                      <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
                    </svg>
                  </span>
                  <div class="text-right">
                    <span class="text-sm font-semibold tabular-nums block"
                          [class.text-green-600]="combinedValueDifference() >= 0"
                          [class.text-red-600]="combinedValueDifference() < 0">
                      ฿{{ combinedValueDifference() | number:'1.0-0' }}
                    </span>
                    <span class="text-[10px] tabular-nums"
                          [class.text-green-600]="combinedDifferencePercent() >= 0"
                          [class.text-red-600]="combinedDifferencePercent() < 0">
                      ({{ combinedDifferencePercent() | number:'1.1-1' }}%)
                    </span>
                  </div>
                </div>
              </div>
            </section>

            @if (d.legacy?.as_of_date) {
              <p class="text-[10px] text-slate-400 text-center">
                ข้อมูลระบบเก่า ณ {{ d.legacy?.as_of_date }}
              </p>
            }

          </div>
        }
      </mat-dialog-content>
    </div>
  `,
})
export class ProjectDashboardDialogComponent implements OnInit {
  readonly data: ProjectDashboardDialogData = inject(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ProjectDashboardDialogComponent>);
  private http = inject(HttpClient);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly dashboardData = signal<DashboardData | null>(null);
  readonly valueBasis = signal<'selling' | 'cost'>(restoreValueBasis());

  // mirror dashboard.component.ts computeds
  readonly hasLegacy = computed(() => this.dashboardData()?.legacy != null);
  readonly hasLegacyUnits = computed(() => (this.dashboardData()?.legacy_unit_count ?? 0) > 0);

  readonly combinedSoldUnits = computed(() => {
    const d = this.dashboardData();
    if (!d) return 0;
    return (d.legacy?.sold_units ?? 0) + d.sold_units;
  });
  readonly combinedSoldNetPrice = computed(() => {
    const d = this.dashboardData();
    if (!d) return 0;
    return (d.legacy?.sold_net_price ?? 0) + d.sold_net_price;
  });
  readonly combinedAvgPriceSold = computed(() => {
    const units = this.combinedSoldUnits();
    const net = this.combinedSoldNetPrice();
    return units > 0 ? net / units : 0;
  });
  readonly combinedTotalUnits = computed(() => {
    const d = this.dashboardData();
    if (!d) return 0;
    return d.total_units + (d.legacy_unit_count ?? 0);
  });
  readonly combinedApprovedProjectValue = computed(() => {
    const d = this.dashboardData();
    if (!d) return 0;
    if (d.approved_from_user_input) return d.approved_project_value;
    return d.approved_project_value + (d.legacy_unit_cost_sum ?? 0);
  });
  readonly combinedProjectNetSales = computed(() => {
    const d = this.dashboardData();
    if (!d) return 0;
    return d.project_net_sales + (d.legacy?.sold_net_price ?? 0);
  });
  readonly combinedValueAchieved = computed(() => {
    const d = this.dashboardData();
    if (!d) return 0;
    return d.sold_net_price + (d.legacy?.sold_net_price ?? 0) + d.net_after_discount;
  });
  readonly combinedValueDifference = computed(() => {
    return this.combinedValueAchieved() - this.combinedApprovedProjectValue();
  });
  readonly combinedDifferencePercent = computed(() => {
    const approved = this.combinedApprovedProjectValue();
    return approved > 0 ? (this.combinedValueDifference() / approved) * 100 : 0;
  });

  ngOnInit(): void {
    this.load();
  }

  setBasis(basis: 'selling' | 'cost'): void {
    if (basis === this.valueBasis()) return;
    this.valueBasis.set(basis);
    try { localStorage.setItem(VALUE_BASIS_STORAGE_KEY, basis); } catch { /* ignore */ }
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    const url = `/api/public/monitor/${this.data.token}/dashboard/${this.data.projectId}?value_basis=${this.valueBasis()}`;
    this.http.get<{ data: DashboardData }>(url).subscribe({
      next: res => {
        this.dashboardData.set(res.data);
        this.loading.set(false);
      },
      error: err => {
        const msg = err?.error?.messages?.error ?? 'โหลดข้อมูลไม่สำเร็จ';
        this.error.set(typeof msg === 'string' ? msg : 'โหลดข้อมูลไม่สำเร็จ');
        this.loading.set(false);
      },
    });
  }
}
