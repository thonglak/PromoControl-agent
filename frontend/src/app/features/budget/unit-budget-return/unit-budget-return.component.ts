import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';

import { ProjectService } from '../../../core/services/project.service';
import {
  BudgetService, UnitWithRemaining, ReturnHistoryItem,
} from '../services/budget.service';
import { ReturnDialogComponent } from './return-dialog.component';
import { BatchReturnDialogComponent } from './batch-return-dialog.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';

type StatusFilter = 'all' | 'transferred' | 'not_transferred';

@Component({
  selector: 'app-unit-budget-return',
  standalone: true,
  imports: [
    StatCardComponent,
    StatusChipComponent,
    SectionCardComponent,
    CommonModule, FormsModule, MatTableModule, MatCheckboxModule,
    MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatDialogModule, MatPaginatorModule,
    MatChipsModule,
  ],
  template: `
    <div style="padding: 24px; max-width: 1200px; margin: 0 auto">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px">
        <h1 style="margin: 0; font-size: 1.5rem">คืนงบยูนิตเข้า Pool</h1>
        <div style="background: var(--mat-sys-primary-container); color: var(--mat-sys-on-primary-container); padding: 8px 16px; border-radius: 8px; font-weight: 500">
          Pool คงเหลือ: {{ poolBalance() | number }} บาท
        </div>
      </div>

      @if (loading()) {
        <div style="text-align: center; padding: 48px">
          <mat-spinner diameter="40" style="margin: 0 auto"></mat-spinner>
          <p style="margin-top: 16px; color: var(--mat-sys-on-surface-variant)">กำลังโหลด...</p>
        </div>
      } @else {
        <!-- Filters + Summary -->
        @if (units().length > 0) {
          <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; align-items: center">
            <mat-form-field style="width: 240px" subscriptSizing="dynamic">
              <mat-label>ค้นหายูนิต</mat-label>
              <input matInput [ngModel]="searchText()" (ngModelChange)="searchText.set($event)">
            </mat-form-field>

            <!-- Status Filter -->
            <mat-form-field style="width: 180px" subscriptSizing="dynamic">
              <mat-label>สถานะ</mat-label>
              <mat-select [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
                <mat-option value="all">ทั้งหมด</mat-option>
                <mat-option value="transferred">โอนแล้ว</mat-option>
                <mat-option value="not_transferred">ยังไม่โอน</mat-option>
              </mat-select>
            </mat-form-field>

            <span style="color: var(--mat-sys-on-surface-variant)">
              แสดง {{ filteredUnits().length }} ยูนิต
              (คืนได้ {{ returnableCount() }})
            </span>
            <span style="color: var(--mat-sys-on-surface-variant)">
              งบเหลือรวม: {{ totalRemainAll() | number }} บาท
            </span>
          </div>

          <!-- Selection summary + Batch button -->
          @if (selectedCount() > 0) {
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px 16px; background: var(--mat-sys-primary-container); border-radius: 8px">
              <span style="color: var(--mat-sys-on-primary-container); font-weight: 500">
                เลือก {{ selectedCount() }} ยูนิต, งบรวม {{ selectedTotalRemain() | number }} บาท
              </span>
              <button mat-flat-button color="primary" (click)="openBatchReturnDialog()">
                คืนงบทั้งหมดที่เลือก
              </button>
            </div>
          }
        }

        <!-- Table -->
        @if (filteredUnits().length > 0) {
          <div style="overflow-x: auto">
            <table mat-table [dataSource]="filteredUnits()" style="width: 100%">
              <ng-container matColumnDef="select">
                <th mat-header-cell *matHeaderCellDef style="width: 48px">
                  <mat-checkbox
                    [checked]="allSelected()"
                    [indeterminate]="someSelected()"
                    (change)="toggleAll()">
                  </mat-checkbox>
                </th>
                <td mat-cell *matCellDef="let row">
                  @if (row.is_returnable) {
                    <mat-checkbox
                      [checked]="selectedUnitIds().has(row.unit_id)"
                      (change)="toggleUnit(row.unit_id)">
                    </mat-checkbox>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="unit_code">
                <th mat-header-cell *matHeaderCellDef>ยูนิต</th>
                <td mat-cell *matCellDef="let row">{{ row.unit_code }}</td>
              </ng-container>

              <ng-container matColumnDef="sale_status">
                <th mat-header-cell *matHeaderCellDef>สถานะ</th>
                <td mat-cell *matCellDef="let row">
                  <span [style.color]="row.sale_status === 'transferred' ? 'var(--mat-sys-primary)' : 'var(--mat-sys-on-surface-variant)'"
                        [style.font-weight]="row.sale_status === 'transferred' ? '500' : '400'">
                    {{ saleStatusLabel(row.sale_status) }}
                  </span>
                </td>
              </ng-container>

              <ng-container matColumnDef="standard_budget">
                <th mat-header-cell *matHeaderCellDef style="text-align: right">งบยูนิต</th>
                <td mat-cell *matCellDef="let row" style="text-align: right">{{ row.standard_budget | number }}</td>
              </ng-container>

              <ng-container matColumnDef="total_used">
                <th mat-header-cell *matHeaderCellDef style="text-align: right">ใช้ไป</th>
                <td mat-cell *matCellDef="let row" style="text-align: right">{{ row.total_used | number }}</td>
              </ng-container>

              <ng-container matColumnDef="total_returned">
                <th mat-header-cell *matHeaderCellDef style="text-align: right">คืนแล้ว</th>
                <td mat-cell *matCellDef="let row" style="text-align: right">{{ row.total_returned | number }}</td>
              </ng-container>

              <ng-container matColumnDef="budget_remain">
                <th mat-header-cell *matHeaderCellDef style="text-align: right">เหลือ (ยูนิต)</th>
                <td mat-cell *matCellDef="let row" style="text-align: right; font-weight: 600; color: var(--mat-sys-primary)">
                  {{ row.budget_remain | number }}
                </td>
              </ng-container>

              <ng-container matColumnDef="other_remain">
                <th mat-header-cell *matHeaderCellDef style="text-align: right">งบอื่นๆ เหลือ</th>
                <td mat-cell *matCellDef="let row" style="text-align: right">
                  @if (row.other_remain > 0) {
                    <span style="color: var(--mat-sys-tertiary); font-weight: 500">{{ row.other_remain | number }}</span>
                  } @else {
                    <span style="color: var(--mat-sys-on-surface-variant); opacity: 0.5">—</span>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef style="width: 100px"></th>
                <td mat-cell *matCellDef="let row">
                  @if (row.is_returnable) {
                    <button mat-stroked-button color="primary" (click)="openReturnDialog(row)" style="white-space: nowrap">คืนงบ</button>
                  } @else {
                    <span style="color: var(--mat-sys-on-surface-variant); font-size: 0.85em">รอโอน</span>
                  }
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns"
                  [style.opacity]="row.is_returnable ? 1 : 0.55"></tr>
            </table>
          </div>
        } @else if (!loading()) {
          <div style="text-align: center; padding: 48px; color: var(--mat-sys-on-surface-variant)">
            ไม่มียูนิตที่มีงบเหลือ
          </div>
        }

        <!-- Return History -->
        @if (history().length > 0) {
          <h2 style="margin-top: 32px; font-size: 1.2rem">ประวัติการคืนงบ</h2>
          <table mat-table [dataSource]="history()" style="width: 100%">
            <ng-container matColumnDef="created_at">
              <th mat-header-cell *matHeaderCellDef>วันที่</th>
              <td mat-cell *matCellDef="let row">{{ row.created_at | date:'d/M/yy HH:mm' }}</td>
            </ng-container>
            <ng-container matColumnDef="unit_code">
              <th mat-header-cell *matHeaderCellDef>ยูนิต</th>
              <td mat-cell *matCellDef="let row">{{ row.unit_code }}</td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef style="text-align: right">จำนวน</th>
              <td mat-cell *matCellDef="let row" style="text-align: right; font-weight: 500">{{ row.amount | number }}</td>
            </ng-container>
            <ng-container matColumnDef="note">
              <th mat-header-cell *matHeaderCellDef>หมายเหตุ</th>
              <td mat-cell *matCellDef="let row">{{ row.note }}</td>
            </ng-container>
            <ng-container matColumnDef="created_by_name">
              <th mat-header-cell *matHeaderCellDef>ผู้ทำรายการ</th>
              <td mat-cell *matCellDef="let row">{{ row.created_by_name }}</td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="historyColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: historyColumns"></tr>
          </table>
          <mat-paginator
            [length]="historyTotal()"
            [pageSize]="20"
            [hidePageSize]="true"
            (page)="onHistoryPage($event)">
          </mat-paginator>
        }
      }
    </div>
  `,
})
export class UnitBudgetReturnComponent implements OnInit {
  private readonly budgetSvc = inject(BudgetService);
  private readonly projectSvc = inject(ProjectService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(false);
  readonly units = signal<UnitWithRemaining[]>([]);
  readonly poolBalance = signal(0);
  readonly selectedUnitIds = signal(new Set<number>());
  readonly searchText = signal('');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly history = signal<ReturnHistoryItem[]>([]);
  readonly historyTotal = signal(0);

  readonly displayedColumns = ['select', 'unit_code', 'sale_status', 'standard_budget', 'total_used', 'total_returned', 'budget_remain', 'other_remain', 'actions'];
  readonly historyColumns = ['created_at', 'unit_code', 'amount', 'note', 'created_by_name'];

  readonly filteredUnits = computed(() => {
    let list = this.units();
    const search = this.searchText().toLowerCase();
    if (search) {
      list = list.filter(u => u.unit_code.toLowerCase().includes(search));
    }
    const sf = this.statusFilter();
    if (sf === 'transferred') {
      list = list.filter(u => u.is_returnable);
    } else if (sf === 'not_transferred') {
      list = list.filter(u => !u.is_returnable);
    }
    return list;
  });

  /** จำนวนยูนิตที่คืนได้ (is_returnable) ที่แสดงอยู่ */
  readonly returnableCount = computed(() =>
    this.filteredUnits().filter(u => u.is_returnable).length
  );

  /** เฉพาะ returnable units ที่อยู่ใน filteredUnits */
  readonly returnableUnits = computed(() =>
    this.filteredUnits().filter(u => u.is_returnable)
  );

  readonly selectedCount = computed(() => this.selectedUnitIds().size);

  readonly selectedTotalRemain = computed(() =>
    this.units().filter(u => this.selectedUnitIds().has(u.unit_id))
      .reduce((sum, u) => sum + u.budget_remain + u.other_remain, 0)
  );

  readonly totalRemainAll = computed(() =>
    this.units().reduce((sum, u) => sum + u.budget_remain + u.other_remain, 0)
  );

  readonly allSelected = computed(() => {
    const returnable = this.returnableUnits();
    return returnable.length > 0 && returnable.every(u => this.selectedUnitIds().has(u.unit_id));
  });

  readonly someSelected = computed(() => {
    const returnable = this.returnableUnits();
    const selected = this.selectedUnitIds();
    const someIn = returnable.some(u => selected.has(u.unit_id));
    return someIn && !this.allSelected();
  });

  private get projectId(): number {
    return +(this.projectSvc.selectedProject()?.id ?? 0);
  }

  ngOnInit(): void {
    if (this.projectId > 0) {
      this.loadData();
    }
  }

  saleStatusLabel(status: string): string {
    switch (status) {
      case 'reserved': return 'จอง';
      case 'sold': return 'ขายแล้ว';
      case 'transferred': return 'โอนแล้ว';
      default: return status;
    }
  }

  loadData(): void {
    if (this.projectId <= 0) return;
    this.loading.set(true);
    this.selectedUnitIds.set(new Set());

    this.budgetSvc.getUnitsWithRemaining(this.projectId).subscribe({
      next: (res) => {
        this.units.set(res.units);
        this.poolBalance.set(res.project.pool_balance);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 });
      },
    });

    this.loadHistory(1);
  }

  loadHistory(page: number): void {
    this.budgetSvc.getReturnHistory(this.projectId, page).subscribe({
      next: (res) => {
        this.history.set(res.data);
        this.historyTotal.set(res.total);
      },
    });
  }

  toggleUnit(unitId: number): void {
    this.selectedUnitIds.update(s => {
      const next = new Set(s);
      next.has(unitId) ? next.delete(unitId) : next.add(unitId);
      return next;
    });
  }

  toggleAll(): void {
    const returnable = this.returnableUnits();
    if (this.allSelected()) {
      this.selectedUnitIds.set(new Set());
    } else {
      // เลือกเฉพาะยูนิตที่คืนได้ (is_returnable = true)
      this.selectedUnitIds.set(new Set(returnable.map(u => u.unit_id)));
    }
  }

  openReturnDialog(unit: UnitWithRemaining): void {
    const ref = this.dialog.open(ReturnDialogComponent, {
      data: { unit, projectId: this.projectId },
      width: '480px',
    });
    ref.afterClosed().subscribe(result => {
      if (result?.success) {
        this.snackBar.open(`คืนงบยูนิต ${unit.unit_code} สำเร็จ`, 'ปิด', { duration: 3000 });
        this.loadData();
      }
    });
  }

  openBatchReturnDialog(): void {
    const selectedUnits = this.units().filter(u =>
      this.selectedUnitIds().has(u.unit_id) && u.is_returnable
    );
    if (selectedUnits.length === 0) return;

    const ref = this.dialog.open(BatchReturnDialogComponent, {
      data: { units: selectedUnits, projectId: this.projectId },
      width: '520px',
    });
    ref.afterClosed().subscribe(result => {
      if (result?.success) {
        const total = result.data?.data?.total_returned ?? 0;
        this.snackBar.open(`คืนงบ ${selectedUnits.length} ยูนิต รวม ${total.toLocaleString()} บาท สำเร็จ`, 'ปิด', { duration: 4000 });
        this.loadData();
      }
    });
  }

  onHistoryPage(event: PageEvent): void {
    this.loadHistory(event.pageIndex + 1);
  }
}
