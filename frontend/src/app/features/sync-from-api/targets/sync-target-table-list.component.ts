import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { SyncFromApiService, SyncTargetTable } from '../sync-from-api.service';
import {
  SyncTargetTableFormDialogComponent,
} from './dialogs/sync-target-table-form-dialog.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

@Component({
  selector: 'app-sync-target-table-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    SvgIconComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1200px; margin: 0 auto;">

      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-semibold text-slate-800">ตั้งค่า Target Tables</h1>
          <p class="text-sm text-slate-500 mt-0.5">จัดการตารางปลายทางสำหรับ sync ข้อมูล</p>
        </div>
        <button mat-flat-button color="primary" (click)="openCreate()" class="flex items-center gap-2">
          <app-icon name="plus" class="w-4 h-4" />
          เพิ่ม
        </button>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-lg border border-slate-200 overflow-hidden relative">

        @if (loading()) {
          <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
            <mat-spinner diameter="36" />
          </div>
        }

        <div class="overflow-x-auto">
          <table mat-table [dataSource]="dataSource" class="w-full min-w-[800px]">

            <!-- ชื่อ table -->
            <ng-container matColumnDef="table_name">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                ชื่อ Table
              </th>
              <td mat-cell *matCellDef="let row" class="!font-mono !text-sm !text-slate-700">
                {{ row.table_name }}
              </td>
            </ng-container>

            <!-- ชื่อแสดงผล -->
            <ng-container matColumnDef="label">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                ชื่อแสดงผล
              </th>
              <td mat-cell *matCellDef="let row" class="!text-sm !font-medium !text-slate-800">
                {{ row.label }}
              </td>
            </ng-container>

            <!-- upsert key -->
            <ng-container matColumnDef="default_upsert_key">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                Default Upsert Key
              </th>
              <td mat-cell *matCellDef="let row" class="!font-mono !text-sm !text-slate-600">
                {{ row.default_upsert_key }}
              </td>
            </ng-container>

            <!-- สถานะ -->
            <ng-container matColumnDef="is_active">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-center">
                สถานะ
              </th>
              <td mat-cell *matCellDef="let row" class="!text-center">
                <mat-slide-toggle
                  color="primary"
                  [checked]="!!Number(row.is_active)"
                  (change)="toggleActive(row, $event.checked)"
                />
              </td>
            </ng-container>

            <!-- จัดการ -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-center">
                จัดการ
              </th>
              <td mat-cell *matCellDef="let row" class="!text-center">
                <div class="flex justify-center gap-1">
                  <button mat-icon-button matTooltip="แก้ไข"
                          class="!text-slate-500 hover:!text-blue-600"
                          (click)="openEdit(row)">
                    <app-icon name="pencil-square" class="w-4 h-4" />
                  </button>
                  <button mat-icon-button matTooltip="ลบ"
                          class="!text-slate-500 hover:!text-red-600"
                          (click)="confirmDelete(row)">
                    <app-icon name="trash" class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"
                class="hover:bg-slate-50 transition-colors even:bg-slate-50/40"></tr>

            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell text-center py-12 text-slate-400"
                  [attr.colspan]="displayedColumns.length">
                <app-icon name="inbox" class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p>ไม่พบ Target Tables</p>
              </td>
            </tr>

          </table>
        </div>
      </div>

    </div>
  `,
})
export class SyncTargetTableListComponent implements OnInit {
  private api    = inject(SyncFromApiService);
  private dialog = inject(MatDialog);
  private snack  = inject(MatSnackBar);

  displayedColumns = ['table_name', 'label', 'default_upsert_key', 'is_active', 'actions'];
  dataSource       = new MatTableDataSource<SyncTargetTable>([]);
  loading          = signal(false);

  // ใช้ Number() เพื่อแปลง MySQL boolean ได้ถูกต้อง
  Number = Number;

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.api.getSyncTargetTables().subscribe({
      next: tables => {
        this.dataSource.data = tables;
        this.loading.set(false);
      },
      error: () => {
        this.snack.open('โหลดข้อมูล Target Tables ไม่สำเร็จ', 'ปิด', { duration: 4000 });
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.dialog
      .open(SyncTargetTableFormDialogComponent, {
        data: { mode: 'create' },
        width: '500px',
        maxHeight: '90vh',
        disableClose: true,
      })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          this.snack.open('เพิ่ม Target Table สำเร็จ', 'ปิด', { duration: 3000 });
          this.loadData();
        }
      });
  }

  openEdit(table: SyncTargetTable): void {
    this.dialog
      .open(SyncTargetTableFormDialogComponent, {
        data: { mode: 'edit', table },
        width: '500px',
        maxHeight: '90vh',
        disableClose: true,
      })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          this.snack.open('แก้ไข Target Table สำเร็จ', 'ปิด', { duration: 3000 });
          this.loadData();
        }
      });
  }

  toggleActive(table: SyncTargetTable, checked: boolean): void {
    this.api.updateSyncTargetTable(table.id, { is_active: checked }).subscribe({
      next: () => {
        this.snack.open(
          checked ? 'เปิดใช้งานสำเร็จ' : 'ปิดใช้งานสำเร็จ',
          'ปิด',
          { duration: 3000 },
        );
        this.loadData();
      },
      error: () => {
        this.snack.open('อัปเดตสถานะไม่สำเร็จ', 'ปิด', { duration: 4000 });
        this.loadData(); // reload to revert toggle UI
      },
    });
  }

  confirmDelete(table: SyncTargetTable): void {
    if (!confirm(`ยืนยันลบ Target Table "${table.label}" (${table.table_name})?`)) return;
    this.api.deleteSyncTargetTable(table.id).subscribe({
      next: () => {
        this.snack.open('ลบ Target Table สำเร็จ', 'ปิด', { duration: 3000 });
        this.loadData();
      },
      error: err => {
        this.snack.open(err.error?.error ?? 'ลบ Target Table ไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }
}
