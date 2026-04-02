import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';

import { NumberSeriesService, NumberSeries } from '../services/number-series.service';
import { NumberSeriesEditDialogComponent } from '../dialogs/number-series-edit-dialog.component';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

// ── Document Type Labels (ภาษาไทย) ──────────────────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  SALE: 'บันทึกขาย',
  BUDGET_MOVE: 'เคลื่อนไหวงบประมาณ',
  BOTTOM_LINE: 'นำเข้าราคาต้นทุน',
  UNIT_ALLOC: 'ตั้งงบผูกยูนิต',
};

const YEAR_FORMAT_LABELS: Record<string, string> = {
  YYYY_BE: 'ปีพ.ศ.',
  YY_BE: 'ปีพ.ศ.2หลัก',
  YYYY_AD: 'ปีค.ศ.',
  YY_AD: 'ปีค.ศ.2หลัก',
  NONE: 'ไม่มี',
};

const RESET_CYCLE_LABELS: Record<string, string> = {
  YEARLY: 'รายปี',
  MONTHLY: 'รายเดือน',
  NEVER: 'ไม่ reset',
};

// ── Helper: สร้าง pattern display ภาษาไทย ───────────────────────────────────

export function formatPatternDisplay(series: NumberSeries): string {
  const parts: string[] = [];

  // Prefix
  parts.push(series.prefix);

  // Separator หลัง prefix
  if (series.separator) {
    parts.push(series.separator);
  }

  // Year part
  if (series.year_format !== 'NONE') {
    const yearLabel = YEAR_FORMAT_LABELS[series.year_format] ?? series.year_format;
    parts.push(`{${yearLabel}}`);
  }

  // Year separator
  if (series.year_format !== 'NONE' && series.year_separator) {
    parts.push(series.year_separator);
  }

  // Running digits
  const hashes = '#'.repeat(series.running_digits);
  parts.push(`{${hashes}}`);

  return parts.join('');
}

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-number-series-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule, MatButtonModule, MatDialogModule,
    MatSnackBarModule, MatTooltipModule, MatProgressSpinnerModule,
    MatChipsModule,
    SvgIconComponent,
  ],
  template: `
    <div class="p-6">

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-semibold text-slate-800">เลขที่เอกสาร</h1>
          <p class="text-sm text-slate-500 mt-0.5">
            ตั้งค่ารูปแบบเลขที่เอกสารอัตโนมัติ — โครงการ {{ projectName() }}
          </p>
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-lg border border-slate-200 overflow-hidden relative">

        @if (loading()) {
          <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
            <mat-spinner diameter="36" />
          </div>
        }

        <div class="overflow-x-auto">
          <table mat-table [dataSource]="dataSource" class="w-full">

            <!-- ประเภทเอกสาร -->
            <ng-container matColumnDef="document_type">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                ประเภทเอกสาร
              </th>
              <td mat-cell *matCellDef="let row" class="!text-sm !text-slate-700">
                <span class="font-medium">{{ getDocTypeLabel(row.document_type) }}</span>
                <span class="text-slate-400 ml-1">({{ row.document_type }})</span>
              </td>
            </ng-container>

            <!-- รูปแบบ -->
            <ng-container matColumnDef="pattern">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                รูปแบบ
              </th>
              <td mat-cell *matCellDef="let row" class="!text-sm !font-mono !text-slate-600">
                {{ getPatternDisplay(row) }}
              </td>
            </ng-container>

            <!-- ตัวอย่าง -->
            <ng-container matColumnDef="sample_output">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                ตัวอย่าง
              </th>
              <td mat-cell *matCellDef="let row" class="!text-sm !font-mono !text-blue-700 !font-medium">
                {{ row.sample_output }}
              </td>
            </ng-container>

            <!-- ลำดับถัดไป -->
            <ng-container matColumnDef="next_number">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                ลำดับถัดไป
              </th>
              <td mat-cell *matCellDef="let row" class="!text-sm !text-slate-700">
                {{ row.next_number }}
              </td>
            </ng-container>

            <!-- Reset -->
            <ng-container matColumnDef="reset_cycle">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                Reset
              </th>
              <td mat-cell *matCellDef="let row" class="!text-sm !text-slate-600">
                {{ getResetLabel(row.reset_cycle) }}
              </td>
            </ng-container>

            <!-- สถานะ -->
            <ng-container matColumnDef="is_active">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                สถานะ
              </th>
              <td mat-cell *matCellDef="let row">
                @if (row.is_active) {
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                    Active
                  </span>
                } @else {
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                    Inactive
                  </span>
                }
              </td>
            </ng-container>

            <!-- Actions -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef
                  class="!bg-slate-50 !text-center !text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide">
                จัดการ
              </th>
              <td mat-cell *matCellDef="let row" class="!text-center">
                <button mat-icon-button matTooltip="แก้ไข" (click)="openEdit(row)">
                  <app-icon name="pencil-square" class="w-4 h-4" />
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;" class="hover:bg-slate-50"></tr>
            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell text-center py-12 text-slate-400" [attr.colspan]="displayedColumns.length">
                ไม่พบข้อมูล
              </td>
            </tr>
          </table>
        </div>
      </div>

      <!-- หมายเหตุ -->
      <p class="text-xs text-slate-400 mt-3">
        เลขที่เอกสารแต่ละโครงการตั้งค่าแยกอิสระ — series สร้างอัตโนมัติเมื่อสร้างโครงการ
      </p>

    </div>
  `,
})
export class NumberSeriesListComponent implements OnInit {
  private api     = inject(NumberSeriesService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);
  private project = inject(ProjectService);

  displayedColumns = ['document_type', 'pattern', 'sample_output', 'next_number', 'reset_cycle', 'is_active', 'actions'];

  dataSource = new MatTableDataSource<NumberSeries>([]);
  loading    = signal(false);

  projectName = computed(() => this.project.selectedProject()?.name ?? '—');
  private projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const pid = this.projectId();
    if (!pid) return;

    this.loading.set(true);
    this.api.getList(pid).subscribe({
      next: list => {
        this.dataSource.data = list;
        this.loading.set(false);
      },
      error: () => {
        this.snack.open('โหลดข้อมูลเลขที่เอกสารไม่สำเร็จ', 'ปิด', { duration: 4000 });
        this.loading.set(false);
      },
    });
  }

  openEdit(series: NumberSeries): void {
    this.dialog
      .open(NumberSeriesEditDialogComponent, {
        data: { series },
        width: '680px',
        maxHeight: '90vh',
        disableClose: true,
      })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          this.snack.open('บันทึกสำเร็จ', 'ปิด', { duration: 3000 });
          this.loadData();
        }
      });
  }

  getDocTypeLabel(type: string): string {
    return DOCUMENT_TYPE_LABELS[type] ?? type;
  }

  getPatternDisplay(series: NumberSeries): string {
    return formatPatternDisplay(series);
  }

  getResetLabel(cycle: string): string {
    return RESET_CYCLE_LABELS[cycle] ?? cycle;
  }
}
