import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ReportService, SalesReport, SalesItem, SalesReportFilter } from '../services/report.service';
import { ProjectService } from '../../../core/services/project.service';
import { HouseModelApiService, HouseModel } from '../../master-data/house-models/house-model-api.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';

@Component({
  selector: 'app-sales-report-tab',
  standalone: true,
  imports: [
    ThaiDatePipe,
    StatusChipComponent,
    CommonModule, ReactiveFormsModule, DecimalPipe, DatePipe,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatProgressSpinnerModule, SvgIconComponent,
  ],
  template: `
    <!-- Filter bar -->
    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">
      <form [formGroup]="filterForm" class="flex flex-wrap gap-3 items-end">
        <mat-form-field appearance="outline" class="w-40" subscriptSizing="dynamic">
          <mat-label>วันที่เริ่ม</mat-label>
          <input matInput [matDatepicker]="fromPicker" formControlName="date_from">
          <mat-datepicker-toggle matSuffix [for]="fromPicker" />
          <mat-datepicker #fromPicker />
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-40" subscriptSizing="dynamic">
          <mat-label>วันที่สิ้นสุด</mat-label>
          <input matInput [matDatepicker]="toPicker" formControlName="date_to">
          <mat-datepicker-toggle matSuffix [for]="toPicker" />
          <mat-datepicker #toPicker />
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-44" subscriptSizing="dynamic">
          <mat-label>แบบบ้าน</mat-label>
          <mat-select formControlName="house_model_id">
            <mat-option [value]="null">ทั้งหมด</mat-option>
            @for (m of houseModels(); track m.id) {
              <mat-option [value]="m.id">{{ m.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-36" subscriptSizing="dynamic">
          <mat-label>สถานะ</mat-label>
          <mat-select formControlName="transaction_status">
            <mat-option value="all">ทั้งหมด</mat-option>
            <mat-option value="active">ปกติ</mat-option>
            <mat-option value="cancelled">ยกเลิก</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-flat-button color="primary" (click)="loadData()" [disabled]="loading()">
          <app-icon name="magnifying-glass" class="w-4 h-4 mr-1 inline-block" />
          ค้นหา
        </button>
        <button mat-stroked-button (click)="exportCSV()" [disabled]="loading() || exporting()">
          @if (exporting()) {
            <mat-spinner diameter="18" class="inline-block mr-1" />
          }
          ส่งออก CSV
        </button>
      </form>
    </div>

    <!-- Summary cards -->
    @if (report()) {
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        <!-- ยอดขายรวม -->
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">ยอดขายรวม</p>
          <p class="text-xl font-bold" style="color: var(--color-primary)">
            {{ '\u0E3F' }}{{ report()!.summary.total_base_price | number:'1.0-0' }}
          </p>
          <p class="text-xs text-slate-400 mt-1">{{ report()!.summary.total_transactions_active }} รายการ (ปกติ)</p>
        </div>
        <!-- ส่วนลดรวม -->
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">ส่วนลดรวม</p>
          <p class="text-xl font-bold" style="color: var(--color-warning)">
            {{ '\u0E3F' }}{{ report()!.summary.total_discount | number:'1.0-0' }}
          </p>
        </div>
        <!-- ราคาสุทธิรวม -->
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">ราคาสุทธิรวม</p>
          <p class="text-xl font-bold" style="color: var(--color-primary)">
            {{ '\u0E3F' }}{{ report()!.summary.total_net_price | number:'1.0-0' }}
          </p>
        </div>
        <!-- ต้นทุนจากของแถม -->
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">ต้นทุนจากของแถม</p>
          <p class="text-xl font-bold" style="color: var(--color-loss)">
            {{ '\u0E3F' }}{{ report()!.summary.total_promo_burden | number:'1.0-0' }}
          </p>
        </div>
        <!-- กำไรรวม -->
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">กำไรรวม</p>
          <p class="text-xl font-bold"
             [style.color]="report()!.summary.total_profit > 0 ? 'var(--color-profit)' : 'var(--color-loss)'">
            {{ '\u0E3F' }}{{ report()!.summary.total_profit | number:'1.0-0' }}
          </p>
          <p class="text-xs text-slate-400 mt-1">เฉลี่ย {{ report()!.summary.avg_profit_margin_percent | number:'1.1-1' }}%</p>
        </div>
        <!-- งบผู้บริหารคงเหลือ -->
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">งบผู้บริหารคงเหลือ</p>
          <p class="text-xl font-bold"
             [style.color]="report()!.summary.management_budget_remaining > 0 ? 'var(--color-primary)' : 'var(--color-loss)'">
            {{ '฿' }}{{ report()!.summary.management_budget_remaining | number:'1.0-0' }}
          </p>
          <p class="text-xs text-slate-400 mt-1">ยอด ณ ปัจจุบัน</p>
        </div>
      </div>
    }

    <!-- Data table -->
    <div class="bg-white rounded-lg border border-slate-200 overflow-hidden relative">
      @if (loading()) {
        <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
          <mat-spinner diameter="36" />
        </div>
      }

      @if (!loading() && items().length === 0) {
        <div class="text-center py-16 text-slate-400">
          <app-icon name="document-text" class="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p class="text-sm">ไม่พบข้อมูลในช่วงที่เลือก</p>
        </div>
      }

      @if (items().length > 0) {
        <div class="overflow-auto">
          <table mat-table [dataSource]="items()" matSort (matSortChange)="onSort($event)" class="w-full min-w-[1100px]">

            <!-- เลขที่ -->
            <ng-container matColumnDef="sale_no">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">เลขที่</th>
              <td mat-cell *matCellDef="let row" class="font-medium"
                  [class.opacity-50]="row.status === 'cancelled'">{{ row.sale_no }}</td>
            </ng-container>

            <!-- วันที่ -->
            <ng-container matColumnDef="sale_date">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">วันที่</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'cancelled'">{{ row.sale_date | date:'dd/MM/yyyy' }}</td>
            </ng-container>

            <!-- ยูนิต -->
            <ng-container matColumnDef="unit_code">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">ยูนิต</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'cancelled'">{{ row.unit_code }}</td>
            </ng-container>

            <!-- แบบบ้าน -->
            <ng-container matColumnDef="house_model_name">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">แบบบ้าน</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'cancelled'">{{ row.house_model_name }}</td>
            </ng-container>

            <!-- ราคาขาย -->
            <ng-container matColumnDef="base_price">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">ราคาขาย</th>
              <td mat-cell *matCellDef="let row" class="text-right"
                  [class.opacity-50]="row.status === 'cancelled'"
                  [class.line-through]="row.status === 'cancelled'">
                {{ row.base_price | number:'1.0-0' }}
              </td>
            </ng-container>

            <!-- ส่วนลด -->
            <ng-container matColumnDef="total_discount">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">ส่วนลด</th>
              <td mat-cell *matCellDef="let row" class="text-right"
                  [class.opacity-50]="row.status === 'cancelled'"
                  [class.line-through]="row.status === 'cancelled'">
                {{ row.total_discount | number:'1.0-0' }}
              </td>
            </ng-container>

            <!-- ราคาสุทธิ -->
            <ng-container matColumnDef="net_price">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">ราคาสุทธิ</th>
              <td mat-cell *matCellDef="let row" class="text-right"
                  [class.opacity-50]="row.status === 'cancelled'"
                  [class.line-through]="row.status === 'cancelled'">
                {{ row.net_price | number:'1.0-0' }}
              </td>
            </ng-container>

            <!-- สุทธิหลังของแถม -->
            <ng-container matColumnDef="net_after_promo">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">สุทธิหลังของแถม</th>
              <td mat-cell *matCellDef="let row" class="text-right"
                  [class.opacity-50]="row.status === 'cancelled'"
                  [class.line-through]="row.status === 'cancelled'">
                {{ row.net_after_promo | number:'1.0-0' }}
              </td>
            </ng-container>

            <!-- กำไร -->
            <ng-container matColumnDef="profit">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">กำไร</th>
              <td mat-cell *matCellDef="let row" class="text-right font-medium"
                  [class.opacity-50]="row.status === 'cancelled'"
                  [class.line-through]="row.status === 'cancelled'"
                  [style.color]="row.status === 'cancelled' ? '' : (row.profit > 0 ? 'var(--color-profit)' : 'var(--color-loss)')">
                {{ row.profit | number:'1.0-0' }}
              </td>
            </ng-container>

            <!-- % กำไร -->
            <ng-container matColumnDef="profit_margin_percent">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">% กำไร</th>
              <td mat-cell *matCellDef="let row" class="text-right"
                  [class.opacity-50]="row.status === 'cancelled'"
                  [style.color]="row.status === 'cancelled' ? '' : (row.profit_margin_percent > 0 ? 'var(--color-profit)' : 'var(--color-loss)')">
                {{ row.profit_margin_percent | number:'1.1-1' }}%
              </td>
            </ng-container>

            <!-- สถานะ -->
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">สถานะ</th>
              <td mat-cell *matCellDef="let row">
                <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                      [ngClass]="row.status === 'active'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'">
                  {{ row.status === 'active' ? 'ปกติ' : 'ยกเลิก' }}
                </span>
              </td>
            </ng-container>

            <!-- Header / Row / Expand -->
            <tr mat-header-row *matHeaderRowDef="displayedColumns" class="sticky top-0 z-10"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"
                class="hover:bg-primary-100 transition-colors cursor-pointer"
                [class.bg-red-50/30]="row.status === 'cancelled'"
                (click)="toggleExpand(row.sale_no)"></tr>

          </table>
        </div>

        <!-- Expanded detail rows -->
        @for (item of items(); track item.sale_no) {
          @if (expandedRow() === item.sale_no) {
            <div class="px-6 py-4 bg-slate-50/50 border-t border-slate-100">
              <!-- Cancelled info -->
              @if (item.status === 'cancelled') {
                <div class="mb-3 p-3 bg-red-50 rounded-lg border border-red-100">
                  <p class="text-sm text-red-700 font-medium mb-1">รายการยกเลิก</p>
                  @if (item.cancel_reason) {
                    <p class="text-sm text-red-600">เหตุผลยกเลิก: {{ item.cancel_reason }}</p>
                  }
                  @if (item.cancelled_at) {
                    <p class="text-sm text-red-600">วันที่ยกเลิก: {{ item.cancelled_at | date:'dd/MM/yyyy HH:mm' }}</p>
                  }
                </div>
              }

              <!-- Transfer info -->
              @if (item.transfer_date) {
                <div class="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p class="text-sm text-blue-700">วันที่โอน: {{ item.transfer_date | date:'dd/MM/yyyy' }}</p>
                </div>
              }

              <!-- Promotion items -->
              @if (item.promotion_items.length > 0) {
                <p class="text-xs font-semibold text-slate-500 mb-2">รายการโปรโมชั่นที่ใช้</p>
                <div class="overflow-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-xs text-slate-500 border-b border-slate-200">
                        <th class="text-left py-1.5 px-2">รายการ</th>
                        <th class="text-left py-1.5 px-2">หมวดหมู่</th>
                        <th class="text-right py-1.5 px-2">มูลค่า</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (pi of item.promotion_items; track pi.name) {
                        <tr class="border-b border-slate-100">
                          <td class="py-1.5 px-2">{{ pi.name }}</td>
                          <td class="py-1.5 px-2">
                            <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                                  [ngClass]="categoryClass(pi.effective_category)">
                              {{ categoryLabel(pi.effective_category) }}
                            </span>
                          </td>
                          <td class="py-1.5 px-2 text-right">{{ pi.used_value | number:'1.0-0' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="text-xs text-slate-400">ไม่มีรายการโปรโมชั่น</p>
              }
            </div>
          }
        }

        <!-- Paginator -->
        <mat-paginator
          [length]="totalItems()"
          [pageSize]="perPage()"
          [pageIndex]="page() - 1"
          [pageSizeOptions]="[25, 50, 100]"
          (page)="onPage($event)"
          showFirstLastButtons
          class="border-t border-slate-200" />
      }
    </div>
  `,
})
export class SalesReportTabComponent implements OnInit {
  private reportService = inject(ReportService);
  private project = inject(ProjectService);
  private fb = inject(FormBuilder);
  private hmApi = inject(HouseModelApiService);

  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  // State
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly report = signal<SalesReport | null>(null);
  readonly items = computed(() => this.report()?.items ?? []);
  readonly totalItems = computed(() => this.report()?.pagination.total ?? 0);
  readonly expandedRow = signal<string | null>(null);
  readonly houseModels = signal<HouseModel[]>([]);

  // Pagination
  readonly page = signal(1);
  readonly perPage = signal(50);

  // Columns
  readonly displayedColumns = [
    'sale_no', 'sale_date', 'unit_code', 'house_model_name',
    'base_price', 'total_discount', 'net_price', 'net_after_promo',
    'profit', 'profit_margin_percent', 'status',
  ];

  // Filter form
  readonly filterForm = this.fb.group({
    date_from: [null as Date | null],
    date_to: [null as Date | null],
    house_model_id: [null as number | null],
    transaction_status: ['all'],
  });

  ngOnInit(): void {
    this.loadHouseModels();
    this.loadData();
  }

  loadHouseModels(): void {
    const pid = this.projectId();
    if (!pid) return;
    this.hmApi.getList(pid).subscribe({
      next: models => this.houseModels.set(models),
    });
  }

  loadData(): void {
    const pid = this.projectId();
    if (!pid) return;

    this.loading.set(true);
    this.expandedRow.set(null);

    const filters = this.buildFilters();
    this.reportService.getSalesReport(pid, filters).subscribe({
      next: data => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  exportCSV(): void {
    const pid = this.projectId();
    if (!pid) return;

    this.exporting.set(true);
    const filters = this.buildFilters();
    this.reportService.exportSalesCSV(pid, filters).subscribe({
      next: blob => {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        this.reportService.downloadBlob(blob, `sales-report-${date}.csv`);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  onSort(sort: Sort): void {
    // Server-side sort ไม่ได้ support ใน API ปัจจุบัน — ใช้ default sort จาก backend
    this.page.set(1);
    this.loadData();
  }

  onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    this.loadData();
  }

  toggleExpand(saleNo: string): void {
    this.expandedRow.set(this.expandedRow() === saleNo ? null : saleNo);
  }

  categoryClass(cat: string): string {
    const map: Record<string, string> = {
      discount: 'bg-amber-50 text-amber-700',
      premium: 'bg-blue-50 text-blue-700',
      expense_support: 'bg-red-50 text-red-700',
    };
    return map[cat] ?? 'bg-slate-100 text-slate-600';
  }

  categoryLabel(cat: string): string {
    const map: Record<string, string> = {
      discount: 'ส่วนลด',
      premium: 'ของแถม',
      expense_support: 'สนับสนุนค่าใช้จ่าย',
    };
    return map[cat] ?? cat;
  }

  private buildFilters(): SalesReportFilter {
    const v = this.filterForm.value;
    return {
      date_from: v.date_from ? this.toISODate(v.date_from) : undefined,
      date_to: v.date_to ? this.toISODate(v.date_to) : undefined,
      house_model_id: v.house_model_id ?? undefined,
      transaction_status: v.transaction_status ?? 'all',
      page: this.page(),
      per_page: this.perPage(),
    };
  }

  private toISODate(d: Date): string {
    return d.toISOString().split('T')[0];
  }
}
