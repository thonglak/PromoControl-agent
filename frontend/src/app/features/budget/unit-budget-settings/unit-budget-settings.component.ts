import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';

import { ProjectService } from '../../../core/services/project.service';
import { BudgetService, UnitBudgetSettingRow } from '../services/budget.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { UnitBudgetBreakdownDialogComponent } from './unit-budget-breakdown-dialog.component';
import { UnitBudgetApplyConfirmDialogComponent } from './unit-budget-apply-confirm-dialog.component';

type DiffFilter = 'all' | 'changed' | 'increase' | 'decrease' | 'unchanged';

@Component({
  selector: 'app-unit-budget-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatCheckboxModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatDialogModule, MatChipsModule,
    PageHeaderComponent, SectionCardComponent, SvgIconComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <app-page-header
        title="ตั้งค่างบประมาณยูนิต"
        subtitle="คำนวณงบยูนิตจากผลรวมค่าสูงสุด (max_value) ของรายการโปรโมชั่นมาตรฐานที่ยูนิตมีสิทธิ์ใช้">
        <div actions class="flex items-center gap-2">
          <button mat-stroked-button (click)="refresh()" [disabled]="loading()">
            <app-icon name="arrow-path" class="w-4 h-4 mr-1" /> คำนวณใหม่
          </button>
          <button mat-flat-button color="primary"
                  (click)="confirmApply()"
                  [disabled]="loading() || saving() || selectedCount() === 0">
            @if (saving()) { <mat-spinner diameter="18" class="mr-2"></mat-spinner> }
            บันทึกงบ ({{ selectedCount() }})
          </button>
        </div>
      </app-page-header>

      @if (projectId() == null) {
        <app-section-card title="เลือกโครงการ" icon="building-office">
          <p style="color: var(--color-text-secondary); margin: 0">
            กรุณาเลือกโครงการที่แถบบนสุดเพื่อเริ่มคำนวณงบยูนิต
          </p>
        </app-section-card>
      } @else if (loading()) {
        <div style="text-align: center; padding: 48px">
          <mat-spinner diameter="40" style="margin: 0 auto"></mat-spinner>
          <p style="margin-top: 16px; color: var(--color-text-secondary)">กำลังคำนวณ...</p>
        </div>
      } @else {
        <!-- ── Summary chips ── -->
        <div class="flex flex-wrap gap-3 mb-4">
          <div class="summary-chip">
            ยูนิตว่าง <strong class="num">{{ rows().length }}</strong>
          </div>
          <div class="summary-chip" style="--chip-color: var(--color-success)">
            เพิ่มขึ้น <strong class="num">{{ countIncrease() }}</strong>
          </div>
          <div class="summary-chip" style="--chip-color: var(--color-warning)">
            ลดลง <strong class="num">{{ countDecrease() }}</strong>
          </div>
          <div class="summary-chip">
            ไม่เปลี่ยน <strong class="num">{{ countUnchanged() }}</strong>
          </div>
        </div>

        <!-- ── Filters ── -->
        <div class="flex flex-wrap gap-4 mb-3 items-center">
          <mat-form-field style="width: 240px" subscriptSizing="dynamic">
            <mat-label>ค้นหายูนิต</mat-label>
            <input matInput [ngModel]="searchText()" (ngModelChange)="searchText.set($event)">
          </mat-form-field>

          <mat-form-field style="width: 180px" subscriptSizing="dynamic">
            <mat-label>กรองส่วนต่าง</mat-label>
            <mat-select [ngModel]="diffFilter()" (ngModelChange)="diffFilter.set($event)">
              <mat-option value="all">ทั้งหมด</mat-option>
              <mat-option value="changed">เปลี่ยนเฉพาะ</mat-option>
              <mat-option value="increase">เพิ่มขึ้น</mat-option>
              <mat-option value="decrease">ลดลง</mat-option>
              <mat-option value="unchanged">ไม่เปลี่ยน</mat-option>
            </mat-select>
          </mat-form-field>

          <span style="color: var(--color-text-secondary)">
            แสดง {{ filteredRows().length }} / {{ rows().length }} ยูนิต
          </span>
        </div>

        <!-- ── Table ── -->
        @if (filteredRows().length > 0) {
          <div class="section-card" style="overflow-x: auto">
            <table mat-table [dataSource]="filteredRows()" style="width: 100%">

              <ng-container matColumnDef="select">
                <th mat-header-cell *matHeaderCellDef style="width: 56px">
                  <mat-checkbox
                    [checked]="allFilteredSelected()"
                    [indeterminate]="someFilteredSelected()"
                    (change)="toggleAllFiltered($event.checked)">
                  </mat-checkbox>
                </th>
                <td mat-cell *matCellDef="let row">
                  <mat-checkbox
                    [checked]="isSelected(row.unit_id)"
                    (change)="toggleSelect(row.unit_id, $event.checked)"
                    (click)="$event.stopPropagation()">
                  </mat-checkbox>
                </td>
              </ng-container>

              <ng-container matColumnDef="unit_code">
                <th mat-header-cell *matHeaderCellDef>ยูนิต</th>
                <td mat-cell *matCellDef="let row" class="font-mono">{{ row.unit_code }}</td>
              </ng-container>

              <ng-container matColumnDef="house_model">
                <th mat-header-cell *matHeaderCellDef>แบบบ้าน</th>
                <td mat-cell *matCellDef="let row">
                  @if (row.house_model_name) {
                    {{ row.house_model_name }}
                  } @else {
                    <span style="color: var(--color-gray-400)">—</span>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="item_count">
                <th mat-header-cell *matHeaderCellDef style="text-align: center">จำนวนรายการ</th>
                <td mat-cell *matCellDef="let row" style="text-align: center">{{ row.item_count }}</td>
              </ng-container>

              <ng-container matColumnDef="current_budget">
                <th mat-header-cell *matHeaderCellDef class="num-th">งบเดิม</th>
                <td mat-cell *matCellDef="let row" class="num">{{ row.current_budget | number }}</td>
              </ng-container>

              <ng-container matColumnDef="calculated_budget">
                <th mat-header-cell *matHeaderCellDef class="num-th">งบที่คำนวณได้</th>
                <td mat-cell *matCellDef="let row" class="num" style="font-weight: 600; color: var(--color-primary)">
                  {{ row.calculated_budget | number }}
                </td>
              </ng-container>

              <ng-container matColumnDef="diff">
                <th mat-header-cell *matHeaderCellDef class="num-th">ส่วนต่าง</th>
                <td mat-cell *matCellDef="let row" class="num">
                  @if (row.diff > 0) {
                    <span style="color: var(--color-success)">+{{ row.diff | number }}</span>
                  } @else if (row.diff < 0) {
                    <span style="color: var(--color-warning)">{{ row.diff | number }}</span>
                  } @else {
                    <span style="color: var(--color-gray-400)">—</span>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef style="width: 110px"></th>
                <td mat-cell *matCellDef="let row">
                  <button mat-stroked-button (click)="openBreakdown(row)" [disabled]="row.item_count === 0">
                    ดูรายการ
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
            </table>
          </div>
        } @else {
          <div style="text-align: center; padding: 48px; color: var(--color-text-secondary)">
            ไม่มียูนิตที่ตรงเงื่อนไข
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .summary-chip {
      background: var(--color-surface-container);
      color: var(--color-text);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.9rem;
      display: inline-flex;
      gap: 6px;
      align-items: center;
      border-left: 3px solid var(--chip-color, var(--color-primary));
    }
    .summary-chip strong { color: var(--chip-color, var(--color-primary)); }
    .num-th { text-align: right !important; }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: var(--font-mono, ui-monospace, monospace);
    }
  `],
})
export class UnitBudgetSettingsComponent implements OnInit {
  private readonly budgetSvc  = inject(BudgetService);
  private readonly projectSvc = inject(ProjectService);
  private readonly snack      = inject(MatSnackBar);
  private readonly dialog     = inject(MatDialog);

  readonly projectId = computed(() => this.projectSvc.selectedProject()?.id ?? null);
  readonly loading   = signal(false);
  readonly saving    = signal(false);
  readonly rows      = signal<UnitBudgetSettingRow[]>([]);
  readonly searchText = signal('');
  readonly diffFilter = signal<DiffFilter>('all');
  readonly selectedIds = signal<Set<number>>(new Set());

  readonly displayedColumns = [
    'select', 'unit_code', 'house_model', 'item_count',
    'current_budget', 'calculated_budget', 'diff', 'actions',
  ];

  readonly filteredRows = computed(() => {
    let list = this.rows();
    const q = this.searchText().trim().toLowerCase();
    if (q) list = list.filter(r => r.unit_code.toLowerCase().includes(q));
    const f = this.diffFilter();
    if (f === 'changed')   list = list.filter(r => r.diff !== 0);
    if (f === 'increase')  list = list.filter(r => r.diff > 0);
    if (f === 'decrease')  list = list.filter(r => r.diff < 0);
    if (f === 'unchanged') list = list.filter(r => r.diff === 0);
    return list;
  });

  readonly countIncrease  = computed(() => this.rows().filter(r => r.diff > 0).length);
  readonly countDecrease  = computed(() => this.rows().filter(r => r.diff < 0).length);
  readonly countUnchanged = computed(() => this.rows().filter(r => r.diff === 0).length);

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly allFilteredSelected = computed(() => {
    const list = this.filteredRows();
    if (list.length === 0) return false;
    const ids = this.selectedIds();
    return list.every(r => ids.has(r.unit_id));
  });

  readonly someFilteredSelected = computed(() => {
    const list = this.filteredRows();
    const ids = this.selectedIds();
    const some = list.some(r => ids.has(r.unit_id));
    return some && !this.allFilteredSelected();
  });

  constructor() {
    // เปลี่ยนโครงการ → reload
    effect(() => {
      const pid = this.projectId();
      if (pid != null) {
        this.loadData(+pid);
      } else {
        this.rows.set([]);
        this.selectedIds.set(new Set());
      }
    });
  }

  ngOnInit(): void {}

  loadData(projectId: number): void {
    this.loading.set(true);
    this.selectedIds.set(new Set());
    this.budgetSvc.previewUnitBudgetSettings(projectId).subscribe({
      next: (res) => {
        this.rows.set(res.data);
        // default: เลือก checkbox ของยูนิตที่มีส่วนต่าง
        const selected = new Set<number>();
        res.data.forEach(r => { if (r.diff !== 0) selected.add(r.unit_id); });
        this.selectedIds.set(selected);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.snack.open(err.error?.error || 'โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 });
      },
    });
  }

  refresh(): void {
    const pid = this.projectId();
    if (pid != null) this.loadData(+pid);
  }

  isSelected(unitId: number): boolean {
    return this.selectedIds().has(unitId);
  }

  toggleSelect(unitId: number, checked: boolean): void {
    const next = new Set(this.selectedIds());
    if (checked) next.add(unitId); else next.delete(unitId);
    this.selectedIds.set(next);
  }

  toggleAllFiltered(checked: boolean): void {
    const next = new Set(this.selectedIds());
    const list = this.filteredRows();
    if (checked) {
      list.forEach(r => next.add(r.unit_id));
    } else {
      list.forEach(r => next.delete(r.unit_id));
    }
    this.selectedIds.set(next);
  }

  openBreakdown(row: UnitBudgetSettingRow): void {
    this.dialog.open(UnitBudgetBreakdownDialogComponent, {
      width: '560px',
      data: row,
    });
  }

  confirmApply(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    const pid = this.projectId();
    if (pid == null) return;

    const ref = this.dialog.open(UnitBudgetApplyConfirmDialogComponent, {
      data: { count: ids.length },
      width: '440px',
    });
    ref.afterClosed().subscribe(ok => {
      if (ok) this.apply(ids, +pid);
    });
  }

  private apply(unitIds: number[], projectId: number): void {
    this.saving.set(true);
    this.budgetSvc.applyUnitBudgetSettings(projectId, unitIds).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.snack.open(res.message, 'ปิด', { duration: 3500 });
        this.loadData(projectId);
      },
      error: (err) => {
        this.saving.set(false);
        this.snack.open(err.error?.error || 'บันทึกไม่สำเร็จ', 'ปิด', { duration: 3000 });
      },
    });
  }
}
