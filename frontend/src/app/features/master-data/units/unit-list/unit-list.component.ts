import { CommonModule } from '@angular/common';
import { Component, OnInit, AfterViewInit, ViewChild, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { UnitApiService, Unit, BulkCreateRow, BulkCreateResult } from '../unit-api.service';
import { UnitFormDialogComponent } from '../dialogs/unit-form-dialog.component';
import { HouseModelApiService, HouseModel } from '../../house-models/house-model-api.service';
import { ProjectService } from '../../../../core/services/project.service';
import { AuthService } from '../../../../core/services/auth.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService, ColumnDef } from '../../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../../shared/components/table-settings/table-settings-dialog.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../../shared/components/status-chip/status-chip.component';

const TABLE_ID = 'unit-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'unit_code',        label: 'รหัสยูนิต',    visible: true },
  { key: 'unit_number',      label: 'เลขที่ยูนิต',   visible: true },
  { key: 'house_model',      label: 'แบบบ้าน',      visible: true },
  { key: 'base_price',       label: 'ราคาขาย',      visible: true },
  { key: 'unit_cost',        label: 'ต้นทุน',        visible: true },
  { key: 'appraisal_price',  label: 'ราคาประเมิน',   visible: true },
  { key: 'standard_budget',  label: 'งบมาตรฐาน',    visible: true },
  { key: 'status',           label: 'สถานะ',         visible: true },
  { key: 'customer_name',    label: 'ลูกค้า',        visible: true },
  { key: 'actions',          label: 'จัดการ',         visible: true, locked: true },
];

@Component({
  selector: 'app-unit-list',
  standalone: true,
  imports: [
    StatusChipComponent,
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatDialogModule, MatSnackBarModule,
    MatTooltipModule, MatProgressSpinnerModule,
    SvgIconComponent,
  ],
  templateUrl: './unit-list.component.html',
})
export class UnitListComponent implements OnInit, AfterViewInit {
  private api      = inject(UnitApiService);
  private modelApi = inject(HouseModelApiService);
  private dialog   = inject(MatDialog);
  private snack    = inject(MatSnackBar);
  private auth     = inject(AuthService);
  private project  = inject(ProjectService);
  private tblCfg   = inject(TableConfigService);

  sortRef!: MatSort;
  @ViewChild(MatSort) set matSort(s: MatSort) {
    if (s) {
      this.sortRef = s;
      this.dataSource.sort = s;
      const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
      if (saved?.sortActive && saved?.sortDirection) {
        setTimeout(() => { s.active = saved.sortActive; s.direction = saved.sortDirection; });
      }
    }
  }
  @ViewChild(MatPaginator) set matPaginator(p: MatPaginator) { if (p) { this.dataSource.paginator = p; } }

  // ── Table config ──
  columnDefs       = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  dataSource       = new MatTableDataSource<Unit>([]);

  loading     = signal(false);
  houseModels = signal<HouseModel[]>([]);

  showImport   = signal(false);
  csvRows      = signal<BulkCreateRow[]>([]);
  csvPreview   = signal<BulkCreateRow[]>([]);
  csvError     = signal<string | null>(null);
  importing    = signal(false);
  importResult = signal<BulkCreateResult | null>(null);

  isAdmin  = computed(() => this.auth.currentUser()?.role === 'admin');
  canWrite = computed(() => this.project.canEdit());

  private fb = inject(FormBuilder);
  filterForm = this.fb.group({
    search:         [''],
    house_model_id: [null as number | null],
    status:         [''],
  });

  ngOnInit(): void {
    const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
    if (saved) this.filterForm.patchValue(saved, { emitEvent: false });
    this.loadHouseModels();
    this.loadUnits();
  }

  ngAfterViewInit(): void {
  }

  get projectId(): number {
    return this.project.selectedProject()?.id as number ?? 0;
  }

  // ── Table settings ──
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

  loadHouseModels(): void {
    if (!this.projectId) return;
    this.modelApi.getList(this.projectId).subscribe({
      next: models => this.houseModels.set(models),
    });
  }

  loadUnits(): void {
    if (!this.projectId) return;
    this.loading.set(true);
    const v = this.filterForm.value;
    this.api.getList(this.projectId, {
      houseModelId: v.house_model_id ?? undefined,
      status:       v.status || undefined,
      search:       v.search || undefined,
    }).subscribe({
      next: units => {
        this.dataSource.data = units;
        this.loading.set(false);
      },
      error: () => {
        this.snack.open('โหลดข้อมูลยูนิตไม่สำเร็จ', 'ปิด', { duration: 4000 });
        this.loading.set(false);
      },
    });
  }

  onFilterChange(): void {
    const sortState = this.sortRef ? { sortActive: this.sortRef.active, sortDirection: this.sortRef.direction } : {};
    this.tblCfg.saveFilters(TABLE_ID, { ...this.filterForm.value, ...sortState });
    this.loadUnits();
  }

  onSortChange(sort: Sort): void {
    const current = this.tblCfg.loadFilters<any>(TABLE_ID) ?? this.filterForm.value;
    this.tblCfg.saveFilters(TABLE_ID, { ...current, sortActive: sort.active, sortDirection: sort.direction });
    this.loadUnits();
  }

  hasActiveFilters(): boolean {
    const v = this.filterForm.value;
    return !!(v.search || v.house_model_id || v.status || this.sortRef?.active);
  }

  resetAll(): void {
    this.filterForm.reset({ search: "", house_model_id: null, status: "" });
    if (this.sortRef) {
      this.sortRef.active = "";
      this.sortRef.direction = "";
      this.sortRef.sortChange.emit({ active: "", direction: "" });
    }
    this.tblCfg.resetFilters(TABLE_ID);
    this.loadUnits();
  }

  openCreate(): void {
    this.dialog.open(UnitFormDialogComponent, {
      data: { mode: 'create', projectId: this.projectId, projectType: (this.project.selectedProject() as any)?.project_type ?? 'condo' },
      width: '640px',
      maxHeight: '90vh',
      disableClose: true,
    }).afterClosed().subscribe(result => {
      if (result) {
        this.snack.open('สร้างยูนิตสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadUnits();
      }
    });
  }

  openEdit(unit: Unit): void {
    this.dialog.open(UnitFormDialogComponent, {
      data: { mode: 'edit', projectId: this.projectId, projectType: (this.project.selectedProject() as any)?.project_type ?? 'condo', unit },
      width: '640px',
      maxHeight: '90vh',
      disableClose: true,
    }).afterClosed().subscribe(result => {
      if (result) {
        this.snack.open('แก้ไขยูนิตสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadUnits();
      }
    });
  }

  confirmDelete(unit: Unit): void {
    if (!confirm('ยืนยันลบยูนิต "' + unit.unit_code + '"?')) return;
    this.api.delete(unit.id).subscribe({
      next: () => {
        this.snack.open('ลบยูนิตสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadUnits();
      },
      error: err => {
        this.snack.open(err.error?.error ?? 'ลบยูนิตไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  toggleImport(): void {
    this.showImport.update(v => !v);
    if (!this.showImport()) this.resetImport();
  }

  resetImport(): void {
    this.csvRows.set([]);
    this.csvPreview.set([]);
    this.csvError.set(null);
    this.importResult.set(null);
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.csvError.set(null);
    this.importResult.set(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      this.parseCsv(text);
    };
    reader.readAsText(file, 'UTF-8');
  }

  parseCsv(text: string): void {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      this.csvError.set('ไฟล์ CSV ไม่มีข้อมูล');
      return;
    }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    if (!headers.includes('unit_code')) {
      this.csvError.set('ไม่พบคอลัมน์ unit_code');
      return;
    }
    const rows: BulkCreateRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => row[h] = cells[idx] ?? '');
      if (!row['unit_code']) continue;
      rows.push({
        unit_code:       row['unit_code'],
        unit_number:     row['unit_number'] || undefined,
        floor:           row['floor'] ? Number(row['floor']) : undefined,
        building:        row['building'] || undefined,
        base_price:      row['base_price'] ? Number(row['base_price']) : undefined,
        unit_cost:       row['unit_cost'] ? Number(row['unit_cost']) : undefined,
        standard_budget: row['standard_budget'] ? Number(row['standard_budget']) : undefined,
        house_model_id:  row['house_model_id'] ? Number(row['house_model_id']) : undefined,
      });
    }
    this.csvRows.set(rows);
    this.csvPreview.set(rows.slice(0, 5));
  }

  confirmImport(): void {
    const rows = this.csvRows();
    if (!rows.length) return;
    this.importing.set(true);
    this.api.bulkCreate(this.projectId, rows).subscribe({
      next: result => {
        this.importResult.set(result);
        this.importing.set(false);
        if (result.created > 0) this.loadUnits();
      },
      error: err => {
        this.csvError.set(err.error?.error ?? 'นำเข้าไม่สำเร็จ');
        this.importing.set(false);
      },
    });
  }

  formatCurrency(value: number | null | undefined): string {
    if (value == null) return '—';
    return '฿' + Number(value).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      available:   'ว่าง',
      reserved:    'จอง',
      sold:        'ขายแล้ว',
      transferred: 'โอนแล้ว',
    };
    return map[status] ?? status;
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      available:   'bg-green-100 text-green-800',
      reserved:    'bg-amber-100 text-amber-800',
      sold:        'bg-blue-100 text-blue-800',
      transferred: 'bg-purple-100 text-purple-800',
    };
    return map[status] ?? 'bg-slate-100 text-slate-600';
  }
}
