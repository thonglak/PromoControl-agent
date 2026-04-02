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

import {
  ReportService, BudgetReport, BudgetMovement, BudgetReportFilter, BudgetSourceSummary,
} from '../services/report.service';
import { ProjectService } from '../../../core/services/project.service';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

@Component({
  selector: 'app-budget-report-tab',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, DecimalPipe, DatePipe,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatProgressSpinnerModule, SvgIconComponent, ThaiDatePipe, StatusChipComponent,
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
          <mat-label>แหล่งงบ</mat-label>
          <mat-select formControlName="budget_source_type">
            <mat-option value="">ทั้งหมด</mat-option>
            <mat-option value="UNIT_STANDARD">งบมาตรฐาน</mat-option>
            <mat-option value="PROJECT_POOL">งบ Pool</mat-option>
            <mat-option value="MANAGEMENT_SPECIAL">งบผู้บริหาร</mat-option>
            </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-48" subscriptSizing="dynamic">
          <mat-label>ประเภท</mat-label>
          <mat-select formControlName="movement_type">
            <mat-option value="">ทั้งหมด</mat-option>
            <mat-option value="ALLOCATE">จัดสรร</mat-option>
            <mat-option value="USE">ใช้</mat-option>
            <mat-option value="RETURN">คืน</mat-option>
            <mat-option value="ADJUST">ปรับปรุง</mat-option>
            <mat-option value="POOL_INIT">ตั้งงบ Pool</mat-option>
            <mat-option value="SPECIAL_BUDGET_ADD">เพิ่มงบพิเศษ</mat-option>
            <mat-option value="SPECIAL_BUDGET_ALLOCATE">จัดสรรงบพิเศษ</mat-option>
            <mat-option value="SPECIAL_BUDGET_USE">ใช้งบพิเศษ</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-36" subscriptSizing="dynamic">
          <mat-label>สถานะ</mat-label>
          <mat-select formControlName="movement_status">
            <mat-option value="">ทั้งหมด</mat-option>
            <mat-option value="approved">อนุมัติ</mat-option>
            <mat-option value="pending">รออนุมัติ</mat-option>
            <mat-option value="rejected">ปฏิเสธ</mat-option>
            <mat-option value="voided">ยกเลิก</mat-option>
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

    <!-- Budget source summary cards -->
    @if (report()) {
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        @for (src of report()!.summary.by_source; track src.source) {
          <div class="bg-white rounded-lg border border-slate-200 p-4">
            <p class="text-sm font-semibold text-slate-700 mb-3">{{ src.label }}</p>

            <!-- Progress bar -->
            <div class="w-full bg-slate-100 rounded-full h-2 mb-3">
              <div class="h-2 rounded-full transition-all"
                   [style.width.%]="src.allocated > 0 ? Math.min((src.used / src.allocated) * 100, 100) : 0"
                   [style.background-color]="'var(--color-loss)'">
              </div>
            </div>

            <div class="space-y-1.5">
              <div class="flex justify-between text-xs">
                <span class="text-slate-500">จัดสรร</span>
                <span class="font-medium text-slate-700">{{ '\u0E3F' }}{{ src.allocated | number:'1.0-0' }}</span>
              </div>
              <div class="flex justify-between text-xs">
                <span class="text-slate-500">ใช้ไปแล้ว</span>
                <span class="font-medium" style="color: #DC2626">{{ '\u0E3F' }}{{ src.used | number:'1.0-0' }}</span>
              </div>
              @if (src.returned > 0) {
                <div class="flex justify-between text-xs">
                  <span class="text-slate-500">คืนแล้ว</span>
                  <span class="font-medium" style="color: #16A34A">{{ '\u0E3F' }}{{ src.returned | number:'1.0-0' }}</span>
                </div>
              }
              <div class="flex justify-between text-xs border-t border-slate-100 pt-1.5">
                <span class="text-slate-500 font-medium">คงเหลือ</span>
                <span class="font-bold" style="color: #0284C7">{{ '\u0E3F' }}{{ src.remaining | number:'1.0-0' }}</span>
              </div>
            </div>
          </div>
        }
      </div>
    }

    <!-- Movements table -->
    <div class="bg-white rounded-lg border border-slate-200 overflow-hidden relative">
      @if (loading()) {
        <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
          <mat-spinner diameter="36" />
        </div>
      }

      @if (!loading() && movements().length === 0) {
        <div class="text-center py-16 text-slate-400">
          <app-icon name="document-text" class="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p class="text-sm">ไม่พบข้อมูลในช่วงที่เลือก</p>
        </div>
      }

      @if (movements().length > 0) {
        <div class="overflow-auto">
          <table mat-table [dataSource]="movements()" matSort (matSortChange)="onSort($event)" class="w-full min-w-[1000px]">

            <!-- เลขที่ -->
            <ng-container matColumnDef="movement_no">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">เลขที่</th>
              <td mat-cell *matCellDef="let row" class="font-medium"
                  [class.opacity-50]="row.status === 'voided'">{{ row.movement_no }}</td>
            </ng-container>

            <!-- ประเภท -->
            <ng-container matColumnDef="movement_type">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">ประเภท</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'voided'">
                <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                      [ngClass]="movementTypeClass(row.movement_type)">
                  {{ movementTypeLabel(row.movement_type) }}
                </span>
              </td>
            </ng-container>

            <!-- แหล่งงบ -->
            <ng-container matColumnDef="budget_source_type">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">แหล่งงบ</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'voided'">{{ sourceLabel(row.budget_source_type) }}</td>
            </ng-container>

            <!-- จำนวนเงิน -->
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">จำนวนเงิน</th>
              <td mat-cell *matCellDef="let row" class="text-right font-medium"
                  [class.opacity-50]="row.status === 'voided'"
                  [class.line-through]="row.status === 'voided'">
                {{ row.amount | number:'1.0-0' }}
              </td>
            </ng-container>

            <!-- ยูนิต -->
            <ng-container matColumnDef="unit_code">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">ยูนิต</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'voided'">{{ row.unit_code ?? '-' }}</td>
            </ng-container>

            <!-- เลขที่ขาย -->
            <ng-container matColumnDef="sale_no">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">เลขที่ขาย</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'voided'">{{ row.sale_no ?? '-' }}</td>
            </ng-container>

            <!-- หมายเหตุ -->
            <ng-container matColumnDef="note">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">หมายเหตุ</th>
              <td mat-cell *matCellDef="let row" class="max-w-[200px] truncate"
                  [class.opacity-50]="row.status === 'voided'">{{ row.note ?? '-' }}</td>
            </ng-container>

            <!-- สถานะ -->
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">สถานะ</th>
              <td mat-cell *matCellDef="let row">
                <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                      [ngClass]="movementStatusClass(row.status)"
                      [class.line-through]="row.status === 'voided'">
                  {{ movementStatusLabel(row.status) }}
                </span>
              </td>
            </ng-container>

            <!-- วันที่ -->
            <ng-container matColumnDef="created_at">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">วันที่</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'voided'">{{ row.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
            </ng-container>

            <!-- ผู้ทำรายการ -->
            <ng-container matColumnDef="created_by_name">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">ผู้ทำรายการ</th>
              <td mat-cell *matCellDef="let row"
                  [class.opacity-50]="row.status === 'voided'">{{ row.created_by_name ?? '-' }}</td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns" class="sticky top-0 z-10"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"
                class="hover:bg-primary-100 transition-colors"
                [class.bg-slate-50/50]="row.status === 'voided'"></tr>

          </table>
        </div>

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
export class BudgetReportTabComponent implements OnInit {
  private reportService = inject(ReportService);
  private project = inject(ProjectService);
  private fb = inject(FormBuilder);

  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));
  readonly Math = Math;

  // State
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly report = signal<BudgetReport | null>(null);
  readonly movements = computed(() => this.report()?.movements ?? []);
  readonly totalItems = computed(() => this.report()?.pagination.total ?? 0);

  // Pagination
  readonly page = signal(1);
  readonly perPage = signal(50);

  readonly displayedColumns = [
    'movement_no', 'movement_type', 'budget_source_type', 'amount',
    'unit_code', 'sale_no', 'note', 'status', 'created_at', 'created_by_name',
  ];

  readonly filterForm = this.fb.group({
    date_from: [null as Date | null],
    date_to: [null as Date | null],
    budget_source_type: [''],
    movement_type: [''],
    movement_status: [''],
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const pid = this.projectId();
    if (!pid) return;

    this.loading.set(true);
    const filters = this.buildFilters();
    this.reportService.getBudgetReport(pid, filters).subscribe({
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
    this.reportService.exportBudgetCSV(pid, filters).subscribe({
      next: blob => {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        this.reportService.downloadBlob(blob, `budget-report-${date}.csv`);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  onSort(_sort: Sort): void {
    this.page.set(1);
    this.loadData();
  }

  onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    this.loadData();
  }

  // ── Label / Class helpers ─────────────────────────────────────────

  movementTypeLabel(type: string): string {
    const map: Record<string, string> = {
      ALLOCATE: 'จัดสรร',
      USE: 'ใช้',
      RETURN: 'คืน',
      ADJUST: 'ปรับปรุง',
      POOL_INIT: 'ตั้งงบ Pool',
      SPECIAL_BUDGET_ADD: 'เพิ่มงบพิเศษ',
      SPECIAL_BUDGET_ALLOCATE: 'จัดสรรงบพิเศษ',
      SPECIAL_BUDGET_USE: 'ใช้งบพิเศษ',
      SPECIAL_BUDGET_RETURN: 'คืนงบพิเศษ',
      SPECIAL_BUDGET_TRANSFER_OUT: 'โอนงบพิเศษออก',
      SPECIAL_BUDGET_TRANSFER_IN: 'โอนงบพิเศษเข้า',
      SPECIAL_BUDGET_VOID: 'ยกเลิกงบพิเศษ',
    };
    return map[type] ?? type;
  }

  movementTypeClass(type: string): string {
    const map: Record<string, string> = {
      ALLOCATE: 'bg-blue-50 text-blue-700',
      USE: 'bg-red-50 text-red-700',
      RETURN: 'bg-green-50 text-green-700',
      ADJUST: 'bg-amber-50 text-amber-700',
      POOL_INIT: 'bg-sky-50 text-sky-700',
    };
    // All SPECIAL_* types → purple
    if (type.startsWith('SPECIAL_BUDGET')) {
      return 'bg-purple-50 text-purple-700';
    }
    return map[type] ?? 'bg-slate-100 text-slate-600';
  }

  movementStatusLabel(status: string): string {
    const map: Record<string, string> = {
      approved: 'อนุมัติ',
      pending: 'รออนุมัติ',
      rejected: 'ปฏิเสธ',
      voided: 'ยกเลิก',
    };
    return map[status] ?? status;
  }

  movementStatusClass(status: string): string {
    const map: Record<string, string> = {
      approved: 'bg-green-50 text-green-700',
      pending: 'bg-amber-50 text-amber-700',
      rejected: 'bg-red-50 text-red-700',
      voided: 'bg-slate-100 text-slate-500',
    };
    return map[status] ?? 'bg-slate-100 text-slate-600';
  }

  sourceLabel(source: string): string {
    const map: Record<string, string> = {
      UNIT_STANDARD: 'งบมาตรฐาน',
      PROJECT_POOL: 'งบ Pool',
      MANAGEMENT_SPECIAL: 'งบผู้บริหาร',
    };
    return map[source] ?? source;
  }

  private buildFilters(): BudgetReportFilter {
    const v = this.filterForm.value;
    return {
      date_from: v.date_from ? this.toISODate(v.date_from) : undefined,
      date_to: v.date_to ? this.toISODate(v.date_to) : undefined,
      budget_source_type: v.budget_source_type || undefined,
      movement_type: v.movement_type || undefined,
      movement_status: v.movement_status || undefined,
      page: this.page(),
      per_page: this.perPage(),
    };
  }

  private toISODate(d: Date): string {
    return d.toISOString().split('T')[0];
  }
}
