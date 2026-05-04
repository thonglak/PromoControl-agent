import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ProjectService } from '../../../core/services/project.service';
import { BudgetService, UnitBudgetSettingRow } from '../services/budget.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { UnitBudgetBreakdownDialogComponent } from './unit-budget-breakdown-dialog.component';
import { UnitBudgetApplyConfirmDialogComponent } from './unit-budget-apply-confirm-dialog.component';

type DiffFilter = 'all' | 'changed' | 'increase' | 'decrease' | 'unchanged';

@Component({
  selector: 'app-unit-budget-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatCheckboxModule, MatButtonModule, MatButtonToggleModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatDialogModule, MatTooltipModule,
    PageHeaderComponent, SvgIconComponent,
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
        <div class="section-card text-center py-12">
          <app-icon name="building-office" class="w-12 h-12 mx-auto mb-3 opacity-60"
                    style="color: var(--color-text-secondary)" />
          <p class="text-base m-0" style="color: var(--color-text-secondary)">
            กรุณาเลือกโครงการที่แถบบนสุดเพื่อเริ่มคำนวณงบยูนิต
          </p>
        </div>
      } @else if (loading()) {
        <div class="text-center py-12">
          <mat-spinner diameter="40" class="!mx-auto"></mat-spinner>
          <p class="mt-4" style="color: var(--color-text-secondary)">กำลังคำนวณ...</p>
        </div>
      } @else {

        <!-- ── Summary cards (เรียบง่าย) ── -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          <div class="summary-card">
            <div class="summary-card__label">ยูนิตว่าง</div>
            <div class="summary-card__value">{{ rows().length | number }}</div>
          </div>

          <div class="summary-card">
            <div class="summary-card__label">เพิ่มขึ้น</div>
            <div class="summary-card__value" style="color: var(--color-success)">{{ countIncrease() | number }}</div>
            @if (netIncrease() > 0) {
              <div class="summary-card__hint">+{{ netIncrease() | number }} บาท</div>
            }
          </div>

          <div class="summary-card">
            <div class="summary-card__label">ลดลง</div>
            <div class="summary-card__value" style="color: var(--color-warning)">{{ countDecrease() | number }}</div>
            @if (netDecrease() < 0) {
              <div class="summary-card__hint">{{ netDecrease() | number }} บาท</div>
            }
          </div>

          <div class="summary-card">
            <div class="summary-card__label">ไม่เปลี่ยน</div>
            <div class="summary-card__value">{{ countUnchanged() | number }}</div>
          </div>

          <div class="summary-card">
            <div class="summary-card__label">ผลกระทบที่เลือก</div>
            <div class="summary-card__value num"
                 [style.color]="selectedImpact() > 0 ? 'var(--color-success)'
                              : selectedImpact() < 0 ? 'var(--color-warning)'
                              : 'var(--color-text-primary)'">
              {{ selectedImpact() > 0 ? '+' : '' }}{{ selectedImpact() | number }}
            </div>
            <div class="summary-card__hint">
              {{ selectedCount() > 0 ? 'จาก ' + selectedCount() + ' ยูนิต' : 'ยังไม่ได้เลือก' }}
            </div>
          </div>
        </div>

        <!-- ── Filter bar ── -->
        <div class="section-card !py-3 mb-3 flex flex-wrap items-center gap-3">
          <div class="relative">
            <app-icon name="magnifying-glass" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                      style="color: var(--color-text-secondary); pointer-events: none" />
            <input type="text"
                   placeholder="ค้นหารหัสยูนิต..."
                   class="rounded-md border pl-9 pr-3 py-2 text-sm w-64 focus:outline-none focus:ring-2"
                   style="border-color: var(--color-border); background: var(--color-surface); color: var(--color-text-primary); --tw-ring-color: var(--color-primary)"
                   [ngModel]="searchText()" (ngModelChange)="searchText.set($event)" />
          </div>

          <mat-button-toggle-group
            [value]="diffFilter()"
            (change)="diffFilter.set($event.value)"
            hideSingleSelectionIndicator
            class="!text-sm">
            <mat-button-toggle value="all">ทั้งหมด</mat-button-toggle>
            <mat-button-toggle value="changed">เปลี่ยน</mat-button-toggle>
            <mat-button-toggle value="increase">เพิ่ม</mat-button-toggle>
            <mat-button-toggle value="decrease">ลด</mat-button-toggle>
            <mat-button-toggle value="unchanged">ไม่เปลี่ยน</mat-button-toggle>
          </mat-button-toggle-group>

          <span class="ml-auto text-sm" style="color: var(--color-text-secondary)">
            แสดง <strong style="color: var(--color-text-primary)">{{ filteredRows().length }}</strong>
            จาก {{ rows().length }} ยูนิต
          </span>
        </div>

        <!-- ── Table ── -->
        @if (filteredRows().length > 0) {
          <div class="section-card !p-0 overflow-x-auto">
            <table mat-table [dataSource]="filteredRows()" class="w-full">

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
                <td mat-cell *matCellDef="let row" class="font-mono font-medium">{{ row.unit_code }}</td>
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
                <th mat-header-cell *matHeaderCellDef class="!text-center">รายการ</th>
                <td mat-cell *matCellDef="let row" class="!text-center">
                  <span class="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs"
                        style="background: var(--color-section); color: var(--color-text-secondary)">
                    {{ row.item_count }}
                  </span>
                </td>
              </ng-container>

              <ng-container matColumnDef="current_budget">
                <th mat-header-cell *matHeaderCellDef class="num-th">งบเดิม</th>
                <td mat-cell *matCellDef="let row" class="num">{{ row.current_budget | number }}</td>
              </ng-container>

              <ng-container matColumnDef="calculated_budget">
                <th mat-header-cell *matHeaderCellDef class="num-th">งบที่คำนวณได้</th>
                <td mat-cell *matCellDef="let row" class="num font-semibold" style="color: var(--color-primary)">
                  {{ row.calculated_budget | number }}
                </td>
              </ng-container>

              <ng-container matColumnDef="diff">
                <th mat-header-cell *matHeaderCellDef class="num-th">ส่วนต่าง</th>
                <td mat-cell *matCellDef="let row">
                  @if (row.diff !== 0) {
                    <div class="flex items-center justify-end gap-2">
                      <div class="diff-bar" [class.diff-bar--negative]="row.diff < 0">
                        <div class="diff-bar__fill" [style.width.%]="diffBarPct(row)"></div>
                      </div>
                      <span class="num font-semibold w-24 inline-block"
                            [style.color]="row.diff > 0 ? 'var(--color-success)' : 'var(--color-warning)'">
                        {{ row.diff > 0 ? '+' : '' }}{{ row.diff | number }}
                      </span>
                    </div>
                  } @else {
                    <div class="text-right" style="color: var(--color-gray-400)">—</div>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef style="width: 64px"></th>
                <td mat-cell *matCellDef="let row" class="!text-right">
                  <button mat-icon-button
                          (click)="openBreakdown(row)"
                          [disabled]="row.item_count === 0"
                          matTooltip="ดูรายการที่ใช้คำนวณ">
                    <app-icon name="eye" class="w-5 h-5" />
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns"
                  [class.row-selected]="isSelected(row.unit_id)"></tr>
            </table>
          </div>
        } @else {
          <div class="section-card text-center py-12" style="color: var(--color-text-secondary)">
            <app-icon name="inbox" class="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p class="m-0">ไม่มียูนิตที่ตรงเงื่อนไข</p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .num-th { text-align: right !important; }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: var(--font-mono, ui-monospace, monospace);
    }

    /* Summary card — เรียบ ไม่มี icon, เน้นตัวเลขเป็นหลัก */
    .summary-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .summary-card__label {
      font-size: 12px;
      color: var(--color-text-secondary);
      margin-bottom: 6px;
      letter-spacing: 0.02em;
    }
    .summary-card__value {
      font-size: 26px;
      font-weight: 700;
      line-height: 1.15;
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    }
    .summary-card__hint {
      font-size: 11px;
      color: var(--color-text-secondary);
      margin-top: 4px;
      font-variant-numeric: tabular-nums;
    }

    /* Diff bar — visual indicator of magnitude relative to max diff in dataset */
    .diff-bar {
      width: 64px;
      height: 6px;
      border-radius: 999px;
      background: var(--color-success-subtle, #E8F5E9);
      overflow: hidden;
      flex-shrink: 0;
    }
    .diff-bar--negative { background: var(--color-warning-subtle, #FFF3E0); }
    .diff-bar__fill {
      height: 100%;
      background: var(--color-success);
      transition: width .25s ease;
    }
    .diff-bar--negative .diff-bar__fill { background: var(--color-warning); }

    /* Highlight selected row */
    :host ::ng-deep .row-selected td.mat-mdc-cell {
      background: var(--color-primary-100) !important;
    }

    /* Style mat-button-toggle as a compact filter pill */
    :host ::ng-deep .mat-button-toggle-group {
      border-radius: 8px;
      overflow: hidden;
      border-color: var(--color-border);
    }
    :host ::ng-deep .mat-button-toggle-group .mat-button-toggle .mat-button-toggle-label-content {
      line-height: 36px;
      padding: 0 14px;
      font-size: 13px;
    }
    :host ::ng-deep .mat-button-toggle-checked {
      background: var(--color-primary) !important;
    }
    :host ::ng-deep .mat-button-toggle-checked .mat-button-toggle-label-content {
      color: #ffffff !important;
      font-weight: 500;
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

  readonly netIncrease = computed(() =>
    this.rows().reduce((s, r) => s + (r.diff > 0 ? r.diff : 0), 0)
  );
  readonly netDecrease = computed(() =>
    this.rows().reduce((s, r) => s + (r.diff < 0 ? r.diff : 0), 0)
  );

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly selectedImpact = computed(() => {
    const ids = this.selectedIds();
    return this.rows().reduce((s, r) => s + (ids.has(r.unit_id) ? r.diff : 0), 0);
  });

  /** สำหรับ scale ความกว้าง diff-bar ให้สัมพัทธ์กับค่าสูงสุดในชุดข้อมูล */
  readonly maxAbsDiff = computed(() => {
    let m = 0;
    for (const r of this.rows()) m = Math.max(m, Math.abs(r.diff));
    return m;
  });

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

  diffBarPct(row: UnitBudgetSettingRow): number {
    const m = this.maxAbsDiff();
    if (m === 0) return 0;
    // ขั้นต่ำ 8% เพื่อให้แท่งที่เล็กมากยังมองเห็นได้
    return Math.max(8, Math.min(100, (Math.abs(row.diff) / m) * 100));
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
