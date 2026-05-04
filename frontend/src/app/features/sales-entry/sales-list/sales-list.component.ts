import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';

import { CancelSaleDialogComponent } from '../cancel-sale-dialog/cancel-sale-dialog.component';
import { SalesEntryService, SalesTransaction } from '../services/sales-entry.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { TableConfigService, ColumnDef } from '../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../shared/components/table-settings/table-settings-dialog.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';

const TABLE_ID = 'sales-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'sale_no',       label: 'เลขที่ขาย',  visible: true },
  { key: 'unit_code',     label: 'ยูนิต',      visible: true },
  { key: 'sale_date',     label: 'วันที่ขาย',  visible: true },
  { key: 'contract_price', label: 'ราคาหน้าสัญญา', visible: true },
  { key: 'net_price',     label: 'ราคาสุทธิ',  visible: true },
  { key: 'profit',        label: 'กำไร',       visible: true },
  { key: 'status',        label: 'สถานะ',      visible: true },
  { key: 'transfer_status',       label: 'สถานะโอน',        visible: true },
  { key: 'total_budget_remaining', label: 'งบคงเหลือรวม',    visible: true },
  { key: 'net_extra_budget_used',  label: 'งบนอกสุทธิที่ใช้', visible: true },
  { key: 'actions',                label: 'จัดการ',           visible: true },
];

@Component({
  selector: 'app-sales-list',
  standalone: true,
  imports: [
    ThaiDatePipe,
    EmptyStateComponent,
    StatusChipComponent,
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule,
    MatButtonModule, MatTooltipModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatDialogModule, MatSelectModule,
    SvgIconComponent,
    TableSettingsDialogComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">

      <!-- Page Header -->
      <app-page-header title="รายการขาย" subtitle="ดูและจัดการรายการขายทั้งหมด">
        <div actions class="flex items-center gap-2">
          <button mat-icon-button matTooltip="ตั้งค่าคอลัมน์" (click)="openTableSettings()" class="!text-slate-500 hover:!text-slate-700">
            <app-icon name="adjustments-horizontal" class="w-5 h-5" />
          </button>
          @if (canCreate()) {
            <button mat-flat-button color="primary" (click)="goToCreate()" class="flex items-center gap-2">
              <app-icon name="plus" class="w-4 h-4" /> บันทึกรายการขาย
            </button>
          }
        </div>
      </app-page-header>

      <!-- Summary cards -->
      @if (summary()) {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <!-- งบยูนิต -->
          <div class="bg-white rounded-lg border border-slate-200 p-4">
            <p class="text-xs font-semibold text-slate-600 mb-2">งบยูนิต</p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <p class="text-[11px] text-slate-400 mb-0.5">ใช้แล้ว</p>
                <p class="text-base font-bold text-amber-600 tabular-nums">฿{{ summary()!.unit_budget_used | number:'1.0-0' }}</p>
              </div>
              <div>
                <p class="text-[11px] text-slate-400 mb-0.5">คงเหลือ</p>
                <p class="text-base font-bold tabular-nums"
                   [class.text-primary-700]="summary()!.unit_budget_remaining >= 0"
                   [class.text-loss]="summary()!.unit_budget_remaining < 0">
                  ฿{{ summary()!.unit_budget_remaining | number:'1.0-0' }}
                </p>
              </div>
            </div>
            <p class="text-xs text-slate-400 mt-2">ทั้งโครงการ</p>
          </div>

          <!-- งบคงเหลือรวม — sum ทุกยูนิต (ไม่รวมยกเลิก) + Pool คงเหลือ -->
          <div class="bg-white rounded-lg border border-slate-200 p-4">
            <p class="text-xs font-semibold text-slate-600 mb-2">งบคงเหลือรวม</p>
            <p class="text-2xl font-bold tabular-nums"
               [class.text-primary-700]="totalRemaining() >= 0"
               [class.text-loss]="totalRemaining() < 0">
              ฿{{ totalRemaining() | number:'1.0-0' }}
            </p>
            <p class="text-xs text-slate-400 mt-2">
              + Pool คงเหลือ: ฿{{ summary()!.pool_budget_remaining | number:'1.0-0' }}
            </p>
          </div>

          <!-- งบผู้บริหาร -->
          <div class="bg-white rounded-lg border border-slate-200 p-4">
            <p class="text-xs font-semibold text-slate-600 mb-2">งบผู้บริหาร</p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <p class="text-[11px] text-slate-400 mb-0.5">ใช้แล้ว</p>
                <p class="text-base font-bold text-amber-600 tabular-nums">฿{{ summary()!.management_budget_used | number:'1.0-0' }}</p>
              </div>
              <div>
                <p class="text-[11px] text-slate-400 mb-0.5">คงเหลือ</p>
                <p class="text-base font-bold tabular-nums"
                   [class.text-primary-700]="summary()!.management_budget_remaining >= 0"
                   [class.text-loss]="summary()!.management_budget_remaining < 0">
                  ฿{{ summary()!.management_budget_remaining | number:'1.0-0' }}
                </p>
              </div>
            </div>
            <p class="text-xs text-slate-400 mt-2">ทั้งโครงการ</p>
          </div>

        </div>
      }

      <!-- Filter bar -->
      <div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div class="flex flex-wrap gap-3 items-end">
          <mat-form-field appearance="outline" class="flex-1 min-w-[200px]">
            <mat-label>ค้นหา</mat-label>
            <input matInput [formControl]="searchControl" placeholder="เลขที่ขาย / ยูนิต / ลูกค้า" (input)="loadData()" />
            <app-icon matSuffix name="magnifying-glass" class="w-4 h-4 text-slate-400 mr-2" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-40">
            <mat-label>สถานะ</mat-label>
            <mat-select [value]="statusFilter()" (selectionChange)="statusFilter.set($event.value); loadData()">
              <mat-option value="">ทั้งหมด</mat-option>
              <mat-option value="active">ปกติ</mat-option>
              <mat-option value="cancelled">ยกเลิก</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </div>

      <!-- Active filter chips -->
      @if (hasActiveFilters()) {
        <div class="flex items-center flex-wrap gap-2 mb-4 ml-1">
          <span class="text-xs text-slate-400">ตัวกรองที่ใช้:</span>
          @if (searchControl.value) {
            <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
              ค้นหา: {{ searchControl.value }}
            </span>
          }
          @if (statusFilter()) {
            <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
              สถานะ: {{ statusFilter() === 'active' ? 'ปกติ' : 'ยกเลิก' }}
            </span>
          }
          <button type="button" (click)="resetFilters()"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors cursor-pointer">
            <app-icon name="x-mark" class="w-3 h-3" /> ล้างทั้งหมด
          </button>
        </div>
      }

      <!-- Table -->
      <app-section-card [noPadding]="true">
        <div class="relative">
          @if (loading()) {
            <div class="absolute inset-0 bg-white/70 flex items-center justify-center z-10"><mat-spinner diameter="36" /></div>
          }

          <div class="overflow-x-auto">
            <table mat-table [dataSource]="transactions()" matSort
              (matSortChange)="onSort($event)" class="w-full min-w-[900px]">

              <!-- เลขที่ขาย -->
              <ng-container matColumnDef="sale_no">
                <th mat-header-cell *matHeaderCellDef mat-sort-header class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">เลขที่ขาย</th>
                <td mat-cell *matCellDef="let row" class="!font-mono !text-sm !font-medium !text-slate-700">{{ row.sale_no || '—' }}</td>
              </ng-container>

              <!-- ยูนิต -->
              <ng-container matColumnDef="unit_code">
                <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">ยูนิต</th>
                <td mat-cell *matCellDef="let row" class="!text-sm !font-medium !text-slate-800">{{ row.unit_code }}</td>
              </ng-container>

              <!-- วันที่ขาย -->
              <ng-container matColumnDef="sale_date">
                <th mat-header-cell *matHeaderCellDef mat-sort-header class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">วันที่ขาย</th>
                <td mat-cell *matCellDef="let row" class="!text-sm !text-slate-500 whitespace-nowrap">{{ row.sale_date | thaiDate }}</td>
              </ng-container>

              <!-- ราคาหน้าสัญญา -->
              <ng-container matColumnDef="contract_price">
                <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">ราคาหน้าสัญญา</th>
                <td mat-cell *matCellDef="let row" class="!text-right !text-sm !text-slate-700 tabular-nums">
                  @if (row.contract_price != null) {
                    ฿{{ row.contract_price | number:'1.0-0' }}
                  } @else {
                    <span class="text-slate-400">—</span>
                  }
                </td>
              </ng-container>

              <!-- ราคาสุทธิ -->
              <ng-container matColumnDef="net_price">
                <th mat-header-cell *matHeaderCellDef mat-sort-header class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">ราคาสุทธิ</th>
                <td mat-cell *matCellDef="let row" class="!text-right !text-sm !text-slate-700 tabular-nums">฿{{ row.net_price | number:'1.0-0' }}</td>
              </ng-container>

              <!-- กำไร -->
              <ng-container matColumnDef="profit">
                <th mat-header-cell *matHeaderCellDef mat-sort-header class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">กำไร</th>
                <td mat-cell *matCellDef="let row" class="!text-right !text-sm tabular-nums !font-medium"
                  [class.text-profit]="row.profit >= 0"
                  [class.text-loss]="row.profit < 0">
                  ฿{{ row.profit | number:'1.0-0' }}
                </td>
              </ng-container>

              <!-- สถานะ -->
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">สถานะ</th>
                <td mat-cell *matCellDef="let row">
                  <app-status-chip type="transaction_status" [value]="row.status" />
                </td>
              </ng-container>

              <!-- สถานะโอน -->
              <ng-container matColumnDef="transfer_status">
                <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">สถานะโอน</th>
                <td mat-cell *matCellDef="let row">
                  @if (row.transfer_date) {
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">โอนแล้ว</span>
                  } @else if (row.status === 'active') {
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">ยังไม่โอน</span>
                  } @else {
                    <span class="text-slate-400 text-xs">—</span>
                  }
                </td>
              </ng-container>

              <!-- งบคงเหลือรวม -->
              <ng-container matColumnDef="total_budget_remaining">
                <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">งบคงเหลือรวม</th>
                <td mat-cell *matCellDef="let row" class="!text-right !text-sm tabular-nums !text-slate-700">
                  @if (row.total_budget_remaining != null) {
                    ฿{{ row.total_budget_remaining | number:'1.0-0' }}
                  } @else {
                    <span class="text-slate-400">—</span>
                  }
                </td>
              </ng-container>

              <!-- งบนอกสุทธิที่ใช้ -->
              <ng-container matColumnDef="net_extra_budget_used">
                <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-right">งบนอกสุทธิที่ใช้</th>
                <td mat-cell *matCellDef="let row" class="!text-right !text-sm tabular-nums"
                  [class.!text-amber-600]="row.net_extra_budget_used > 0"
                  [class.!text-slate-400]="!row.net_extra_budget_used || row.net_extra_budget_used === 0">
                  @if (row.net_extra_budget_used > 0) {
                    ฿{{ row.net_extra_budget_used | number:'1.0-0' }}
                  } @else {
                    <span>—</span>
                  }
                </td>
              </ng-container>

              <!-- Actions -->
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-center">จัดการ</th>
                <td mat-cell *matCellDef="let row" class="!text-center">
                  <div class="flex justify-center gap-1">
                    <button mat-icon-button matTooltip="ดูรายละเอียด" class="!text-slate-500 hover:!text-blue-600"
                      (click)="goToDetail(row.id); $event.stopPropagation()">
                      <app-icon name="eye" class="w-4 h-4" />
                    </button>
                    @if (canEdit()) {
                      <button mat-icon-button matTooltip="แก้ไข" class="!text-slate-500 hover:!text-blue-600"
                        (click)="goToEdit(row.id); $event.stopPropagation()">
                        <app-icon name="pencil-square" class="w-4 h-4" />
                      </button>
                    }
                    @if (row.status === 'active') {
                      <button mat-icon-button matTooltip="ยกเลิกขาย" class="!text-slate-500 hover:!text-red-600"
                        (click)="openCancelDialog(row); $event.stopPropagation()">
                        <app-icon name="x-circle" class="w-4 h-4" />
                      </button>
                    }
                  </div>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns(); sticky: true"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns();"
                class="hover:bg-primary-100 transition-colors even:bg-slate-50/40 cursor-pointer"
                [class.opacity-60]="row.status === 'cancelled'"
                (click)="goToDetail(row.id)"></tr>

              <tr class="mat-row" *matNoDataRow>
                <td class="mat-cell text-center py-12 text-slate-400" [attr.colspan]="displayedColumns().length">
                  <app-icon name="inbox" class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p>ไม่พบรายการขาย</p>
                </td>
              </tr>
            </table>
          </div>

          <mat-paginator
            [length]="total()"
            [pageSize]="perPage()"
            [pageIndex]="page() - 1"
            [pageSizeOptions]="[10, 25, 50]"
            (page)="onPage($event)"
            showFirstLastButtons
            class="border-t border-slate-200" />
        </div>
      </app-section-card>
    </div>
  `,
})

export class SalesListComponent implements OnInit {
  private salesSvc = inject(SalesEntryService);
  private project = inject(ProjectService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private tblCfg = inject(TableConfigService);

  // State
  readonly transactions = signal<SalesTransaction[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly perPage = signal(25);
  readonly loading = signal(false);
  readonly sortField = signal('st.sale_date');
  readonly sortDir = signal<'ASC' | 'DESC'>('DESC');
  readonly statusFilter = signal('');
  readonly summary = signal<{ unit_budget_used: number; unit_budget_remaining: number; pool_budget_used: number; pool_budget_remaining: number; management_budget_used: number; management_budget_remaining: number; management_budget_returned: number; total_budget_remaining_all_units: number } | null>(null);

  searchControl = this.fb.control('');

  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));
  readonly canEdit = computed(() => {
    const role = this.auth.currentUser()?.role;
    return (role === 'admin' || role === 'manager') && this.project.canEdit();
  });
  readonly canCreate = computed(() => {
    const role = this.auth.currentUser()?.role;
    return ['admin', 'manager', 'sales'].includes(role ?? '') && this.project.canEdit();
  });

  columnDefs = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  /** งบคงเหลือรวม = sum คอลัมน์ (ไม่รวมรายการยกเลิก) + Pool คงเหลือ */
  readonly totalRemaining = computed(() => {
    const s = this.summary();
    if (!s) return 0;
    return (s.total_budget_remaining_all_units ?? 0) + (s.pool_budget_remaining ?? 0);
  });

  ngOnInit(): void {
    // Restore saved filters
    const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
    if (saved) {
      if (saved.search) this.searchControl.setValue(saved.search, { emitEvent: false });
      if (saved.status) this.statusFilter.set(saved.status);
      if (saved.sortField) this.sortField.set(saved.sortField);
      if (saved.sortDir) this.sortDir.set(saved.sortDir);
    }
    this.loadData();
  }

  loadData(): void {
    const pid = this.projectId();
    if (pid <= 0) return;

    // Save current filters
    this.tblCfg.saveFilters(TABLE_ID, {
      search: this.searchControl.value || '',
      status: this.statusFilter(),
      sortField: this.sortField(),
      sortDir: this.sortDir(),
    });

    this.loading.set(true);
    this.salesSvc.getTransactions({
      project_id: pid,
      page: this.page(),
      per_page: this.perPage(),
      search: this.searchControl.value || '',
      sort: this.sortField(),
      dir: this.sortDir(),
      status: this.statusFilter(),
    }).subscribe({
      next: res => {
        this.transactions.set(res.data);
        this.total.set(res.total);
        this.summary.set(res.summary ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('ไม่สามารถโหลดรายการขายได้', 'ปิด', { duration: 4000 });
      },
    });
  }

  onSort(sort: Sort): void {
    const fieldMap: Record<string, string> = {
      sale_date: 'st.sale_date',
      net_price: 'st.net_price',
      profit: 'st.profit',
    };
    this.sortField.set(fieldMap[sort.active] ?? 'st.sale_date');
    this.sortDir.set(sort.direction === 'asc' ? 'ASC' : 'DESC');
    this.page.set(1);
    this.loadData();
  }

  onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.perPage.set(event.pageSize);
    this.loadData();
  }

  goToCreate(): void { this.router.navigate(['/sales']); }
  goToDetail(id: number): void { this.router.navigate(['/sales', id]); }
  goToEdit(id: number): void { this.router.navigate(['/sales', id, 'edit']); }

  statusClass(status: string): string {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'active': return 'ปกติ';
      
      case 'cancelled': return 'ยกเลิก';
      default: return status;
    }
  }

  openTableSettings(): void {
    const ref = this.dialog.open(TableSettingsDialogComponent, {
      data: { columns: this.columnDefs(), tableId: TABLE_ID },
      width: '400px', maxHeight: '90vh',
    });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      if (result === 'reset') { this.tblCfg.resetConfig(TABLE_ID); this.columnDefs.set([...DEFAULT_COLUMNS]); }
      else { this.columnDefs.set(result); this.tblCfg.saveConfig(TABLE_ID, result); }
    });
  }

  hasActiveFilters(): boolean {
    return !!(this.searchControl.value || this.statusFilter());
  }

  resetFilters(): void {
    this.searchControl.reset();
    this.statusFilter.set('');
    this.tblCfg.saveFilters(TABLE_ID, {});
    this.loadData();
  }

  openCancelDialog(row: SalesTransaction): void {
    const ref = this.dialog.open(CancelSaleDialogComponent, {
      data: {
        id: row.id,
        sale_no: row.sale_no,
        unit_code: row.unit_code,
        net_price: row.net_price,
        sale_date: row.sale_date,
      },
      width: '520px',
    });
    ref.afterClosed().subscribe(result => {
      if (result?.success) {
        this.snack.open(`ยกเลิกรายการขายยูนิต ${row.unit_code} สำเร็จ`, 'ปิด', { duration: 4000 });
        this.loadData();
      }
    });
  }
}
