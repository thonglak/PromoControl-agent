import { Component, OnInit, AfterViewInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';

import { BottomLineApiService, BottomLineRecord } from '../bottom-line-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService, ColumnDef } from '../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../shared/components/table-settings/table-settings-dialog.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';

const TABLE_ID = 'bl-history';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'import_key',       label: 'Import Key', visible: true },
  { key: 'file_name',        label: 'ชื่อไฟล์',     visible: true },
  { key: 'total_rows',       label: 'ทั้งหมด',      visible: true },
  { key: 'matched_rows',     label: 'Match',        visible: true },
  { key: 'unmatched_rows',   label: 'ไม่ Match',    visible: true },
  { key: 'updated_rows',     label: 'อัปเดต',       visible: true },
  { key: 'imported_by_name', label: 'ผู้ Import',   visible: true },
  { key: 'imported_at',      label: 'วันที่',        visible: true },
  { key: 'status',           label: 'สถานะ',        visible: true },
  { key: 'actions',          label: 'จัดการ',        visible: true, locked: true },
];

@Component({
  selector: 'app-bottom-line-history',
  standalone: true,
  imports: [
    ThaiDatePipe,
    SectionCardComponent,
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatSelectModule, MatInputModule,
    MatButtonModule, MatTooltipModule, MatSnackBarModule,
    MatProgressSpinnerModule, MatDialogModule,
    SvgIconComponent,
  ],
  templateUrl: './bottom-line-history.component.html',
})
export class BottomLineHistoryComponent implements OnInit, AfterViewInit {
  private api     = inject(BottomLineApiService);
  private project = inject(ProjectService);
  private auth    = inject(AuthService);
  private router  = inject(Router);
  private snack   = inject(MatSnackBar);
  private fb      = inject(FormBuilder);
  private dialog  = inject(MatDialog);
  private tblCfg  = inject(TableConfigService);

  @ViewChild(MatSort) set matSort(s: MatSort) { if (s) { this.dataSource.sort = s; } }
  @ViewChild(MatPaginator) set matPaginator(p: MatPaginator) { if (p) { this.dataSource.paginator = p; } }

  columnDefs       = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  dataSource = new MatTableDataSource<BottomLineRecord>([]);
  loading    = signal(false);

  isAdmin   = computed(() => this.auth.currentUser()?.role === 'admin');
  projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  filterForm = this.fb.group({ status: [''] });

  ngOnInit(): void {
    const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
    if (saved) this.filterForm.patchValue(saved, { emitEvent: false });
    this.loadData();
  }

  ngAfterViewInit(): void {}

  openTableSettings(): void {
    this.dialog.open(TableSettingsDialogComponent, {
      width: '400px', maxHeight: '90vh',
      data: { columns: this.columnDefs(), tableId: TABLE_ID },
    }).afterClosed().subscribe(result => {
      if (!result) return;
      if (result === 'reset') {
        this.tblCfg.resetConfig(TABLE_ID);
        this.columnDefs.set([...DEFAULT_COLUMNS]);
      } else {
        this.columnDefs.set(result);
        this.tblCfg.saveConfig(TABLE_ID, result);
      }
    });
  }

  loadData(): void {
    if (!this.projectId()) return;
    this.loading.set(true);
    const status = this.filterForm.value.status || undefined;
    this.api.getHistory(this.projectId(), { status, per_page: 200 }).subscribe({
      next: r => { this.dataSource.data = r.items; this.loading.set(false); },
      error: () => { this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 }); this.loading.set(false); },
    });
  }

  onFilterChange(): void {
    this.tblCfg.saveFilters(TABLE_ID, this.filterForm.value);
    this.loadData();
  }

  viewDetail(record: BottomLineRecord): void {
    this.router.navigate(['/bottom-line/history', record.import_key]);
  }

  confirmRollback(record: BottomLineRecord): void {
    if (!confirm('คุณต้องการย้อนกลับข้อมูลไปก่อนการ import ครั้งนี้หรือไม่?\n\nการดำเนินการนี้จะคืนค่า unit_cost และ appraisal_price เป็นค่าเดิม')) return;
    this.api.rollback(record.import_key).subscribe({
      next: r => { this.snack.open(r.message, 'ปิด', { duration: 4000 }); this.loadData(); },
      error: err => this.snack.open(err.error?.error ?? 'Rollback ไม่สำเร็จ', 'ปิด', { duration: 4000 }),
    });
  }

  statusLabel(s: string): string {
    return s === 'completed' ? 'สำเร็จ' : s === 'failed' ? 'ล้มเหลว' : 'ย้อนกลับแล้ว';
  }

  statusClass(s: string): string {
    return s === 'completed' ? 'bg-green-50 text-green-700' : s === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
  }

  formatDate(d: string): string {
    return formatThaiDate(d, 'auto-datetime');
  }
}
