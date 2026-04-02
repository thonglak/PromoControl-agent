import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  ReportService, PromotionUsageReport, PromotionUsageItem, PromotionUsageFilter, TopUsedItem,
} from '../services/report.service';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

@Component({
  selector: 'app-promotion-usage-report-tab',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, DecimalPipe,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule,
    MatTableModule, MatSortModule,
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

        <mat-form-field appearance="outline" class="w-48" subscriptSizing="dynamic">
          <mat-label>หมวดหมู่</mat-label>
          <mat-select formControlName="promotion_category">
            <mat-option value="">ทั้งหมด</mat-option>
            <mat-option value="discount">ส่วนลด</mat-option>
            <mat-option value="premium">ของแถม</mat-option>
            <mat-option value="expense_support">สนับสนุนค่าใช้จ่าย</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-flat-button color="primary" (click)="loadData()" [disabled]="loading()">
          <app-icon name="magnifying-glass" class="w-4 h-4 mr-1 inline-block" />
          ค้นหา
        </button>
      </form>
    </div>

    <!-- Summary cards -->
    @if (report()) {
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">จำนวนครั้งที่ใช้</p>
          <p class="text-xl font-bold text-slate-800">{{ report()!.summary.total_items_used | number:'1.0-0' }}</p>
        </div>
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">มูลค่าส่วนลดรวม</p>
          <p class="text-xl font-bold" style="color: var(--color-warning)">
            {{ '\u0E3F' }}{{ report()!.summary.total_discount_amount | number:'1.0-0' }}
          </p>
        </div>
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">มูลค่าของแถมรวม</p>
          <p class="text-xl font-bold" style="color: var(--color-primary)">
            {{ '\u0E3F' }}{{ report()!.summary.total_premium_amount | number:'1.0-0' }}
          </p>
        </div>
        <div class="section-card">
          <p class="text-xs text-slate-500 mb-1">มูลค่าแปลงเป็นส่วนลด</p>
          <p class="text-xl font-bold" style="color: var(--color-loss)">
            {{ '\u0E3F' }}{{ report()!.summary.total_converted_to_discount | number:'1.0-0' }}
          </p>
        </div>
      </div>

      <!-- Top Used Items - horizontal bar chart -->
      @if (topItems().length > 0) {
        <div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">
          <p class="text-sm font-semibold text-slate-700 mb-4">รายการที่ใช้บ่อยที่สุด (Top 5)</p>
          <div class="space-y-3">
            @for (item of topItems().slice(0, 5); track item.item_name) {
              <div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-sm text-slate-700">{{ item.item_name }}</span>
                  <span class="text-xs text-slate-500">{{ item.times_used }} ครั้ง | {{ '\u0E3F' }}{{ item.total_value | number:'1.0-0' }}</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-3">
                  <div class="h-3 rounded-full bg-blue-500 transition-all"
                       [style.width.%]="maxTopCount() > 0 ? (item.times_used / maxTopCount()) * 100 : 0">
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      }
    }

    <!-- Usage table -->
    <div class="bg-white rounded-lg border border-slate-200 overflow-hidden relative">
      @if (loading()) {
        <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
          <mat-spinner diameter="36" />
        </div>
      }

      @if (!loading() && usageItems().length === 0) {
        <div class="text-center py-16 text-slate-400">
          <app-icon name="document-text" class="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p class="text-sm">ไม่พบข้อมูลในช่วงที่เลือก</p>
        </div>
      }

      @if (usageItems().length > 0) {
        <div class="overflow-auto">
          <table mat-table [dataSource]="usageItems()" matSort (matSortChange)="onSort($event)" class="w-full min-w-[900px]">

            <!-- รหัส -->
            <ng-container matColumnDef="item_code">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">รหัส</th>
              <td mat-cell *matCellDef="let row" class="font-medium">{{ row.item_code }}</td>
            </ng-container>

            <!-- ชื่อรายการ -->
            <ng-container matColumnDef="item_name">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">ชื่อรายการ</th>
              <td mat-cell *matCellDef="let row">{{ row.item_name }}</td>
            </ng-container>

            <!-- หมวดหมู่ -->
            <ng-container matColumnDef="promotion_category">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">หมวดหมู่</th>
              <td mat-cell *matCellDef="let row">
                <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                      [ngClass]="categoryClass(row.promotion_category)">
                  {{ categoryLabel(row.promotion_category) }}
                </span>
              </td>
            </ng-container>

            <!-- จำนวนครั้ง -->
            <ng-container matColumnDef="times_used">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">จำนวนครั้ง</th>
              <td mat-cell *matCellDef="let row" class="text-right">{{ row.times_used | number:'1.0-0' }}</td>
            </ng-container>

            <!-- มูลค่ารวม -->
            <ng-container matColumnDef="total_used_value">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">มูลค่ารวม</th>
              <td mat-cell *matCellDef="let row" class="text-right font-medium">{{ row.total_used_value | number:'1.0-0' }}</td>
            </ng-container>

            <!-- เฉลี่ย -->
            <ng-container matColumnDef="avg_used_value">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">เฉลี่ย</th>
              <td mat-cell *matCellDef="let row" class="text-right">{{ row.avg_used_value | number:'1.0-0' }}</td>
            </ng-container>

            <!-- ต่ำสุด -->
            <ng-container matColumnDef="min_used_value">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">ต่ำสุด</th>
              <td mat-cell *matCellDef="let row" class="text-right">{{ row.min_used_value | number:'1.0-0' }}</td>
            </ng-container>

            <!-- สูงสุด -->
            <ng-container matColumnDef="max_used_value">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">สูงสุด</th>
              <td mat-cell *matCellDef="let row" class="text-right">{{ row.max_used_value | number:'1.0-0' }}</td>
            </ng-container>

            <!-- แปลงเป็นส่วนลด -->
            <ng-container matColumnDef="total_converted">
              <th mat-header-cell *matHeaderCellDef mat-sort-header
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">แปลงเป็นส่วนลด</th>
              <td mat-cell *matCellDef="let row" class="text-right">
                @if (row.total_converted > 0) {
                  <span style="color: var(--color-loss)">{{ row.total_converted | number:'1.0-0' }}</span>
                } @else {
                  <span class="text-slate-400">-</span>
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns" class="sticky top-0 z-10"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"
                class="hover:bg-primary-100 transition-colors even:bg-slate-50/40"></tr>

          </table>
        </div>
      }
    </div>
  `,
})
export class PromotionUsageReportTabComponent implements OnInit {
  private reportService = inject(ReportService);
  private project = inject(ProjectService);
  private fb = inject(FormBuilder);

  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  // State
  readonly loading = signal(false);
  readonly report = signal<PromotionUsageReport | null>(null);
  readonly usageItems = computed(() => this.report()?.items ?? []);
  readonly topItems = computed(() => this.report()?.summary.top_used_items ?? []);
  readonly maxTopCount = computed(() => {
    const items = this.topItems();
    if (items.length === 0) return 0;
    return Math.max(...items.map(i => i.times_used));
  });

  readonly displayedColumns = [
    'item_code', 'item_name', 'promotion_category', 'times_used',
    'total_used_value', 'avg_used_value', 'min_used_value', 'max_used_value',
    'total_converted',
  ];

  readonly filterForm = this.fb.group({
    date_from: [null as Date | null],
    date_to: [null as Date | null],
    promotion_category: [''],
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const pid = this.projectId();
    if (!pid) return;

    this.loading.set(true);
    const filters = this.buildFilters();
    this.reportService.getPromotionUsageReport(pid, filters).subscribe({
      next: data => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSort(_sort: Sort): void {
    // Client-side sort — backend returns data already sorted by times_used DESC
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

  private buildFilters(): PromotionUsageFilter {
    const v = this.filterForm.value;
    return {
      date_from: v.date_from ? this.toISODate(v.date_from) : undefined,
      date_to: v.date_to ? this.toISODate(v.date_to) : undefined,
      promotion_category: v.promotion_category || undefined,
    };
  }

  private toISODate(d: Date): string {
    return d.toISOString().split('T')[0];
  }
}
