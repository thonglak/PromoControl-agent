import { Component, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PromotionItemApiService, PromotionItem, PromotionItemExportFile, PromotionItemJson } from '../promotion-item-api.service';
import { PromotionItemFormDialogComponent } from '../dialogs/promotion-item-form-dialog.component';
import { BrowseFreebiesDialogComponent, BrowseFreebiesDialogData } from '../dialogs/browse-freebies-dialog.component';
import { ImportJsonDialogComponent, ImportJsonDialogData } from '../dialogs/import-json-dialog.component';
import { ProjectService } from '../../../../core/services/project.service';
import { AuthService } from '../../../../core/services/auth.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService, ColumnDef } from '../../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../../shared/components/table-settings/table-settings-dialog.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../../shared/components/status-chip/status-chip.component';
import { formatThaiDate } from '../../../../shared/pipes/thai-date.pipe';
import { ThaiDatePipe } from '../../../../shared/pipes/thai-date.pipe';

const TABLE_ID = 'promotion-item-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'code',             label: 'รหัส',       visible: true },
  { key: 'name',             label: 'ชื่อ',        visible: true },
  { key: 'category',         label: 'หมวด',       visible: true },
  { key: 'value_mode',       label: 'โหมดค่า',    visible: true },
  { key: 'default_used_value', label: 'ค่าเริ่มต้นที่ใช้', visible: true },
  { key: 'max_value',        label: 'ค่าสูงสุด',   visible: true },
  { key: 'is_unit_standard', label: 'มาตรฐาน',    visible: true },
  { key: 'is_active',        label: 'สถานะ',      visible: true },
  { key: 'sort_order',       label: 'ลำดับ',       visible: true },
  { key: 'eligibility',      label: 'เงื่อนไข',    visible: true },
  { key: 'actions',          label: 'จัดการ',       visible: true, locked: true },
];

@Component({
  selector: 'app-promotion-item-list',
  standalone: true,
  imports: [
    ThaiDatePipe,
    StatusChipComponent,
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatTooltipModule, MatProgressSpinnerModule,
    MatDialogModule, MatSnackBarModule, SvgIconComponent,
  ],
  templateUrl: './promotion-item-list.component.html',
})
export class PromotionItemListComponent implements OnInit {
  private api     = inject(PromotionItemApiService);
  private project = inject(ProjectService);
  private auth    = inject(AuthService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);
  private fb      = inject(FormBuilder);
  private tblCfg  = inject(TableConfigService);

  // ── Sort / Paginator ──
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

  dataSource = new MatTableDataSource<PromotionItem>([]);
  loading    = signal(false);

  canWrite = computed(() => this.project.canEdit());
  projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  filterForm = this.fb.group({
    search:           [''],
    category:         [''],
    value_mode:       [''],
    is_unit_standard: [''],
    is_active:        [''],
  });

  ngOnInit(): void {
    const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
    if (saved) this.filterForm.patchValue(saved, { emitEvent: false });

    this.dataSource.filterPredicate = (item, filterJson) => {
      const f = JSON.parse(filterJson || '{}');
      const matchSearch = !f.search || item.code.toLowerCase().includes(f.search) || item.name.toLowerCase().includes(f.search);
      const matchCat    = !f.category || item.category === f.category;
      const matchMode   = !f.value_mode || item.value_mode === f.value_mode;
      const matchStd    = f.is_unit_standard === '' || String(item.is_unit_standard) === f.is_unit_standard;
      const matchActive = f.is_active === '' || String(item.is_active) === f.is_active;
      return matchSearch && matchCat && matchMode && matchStd && matchActive;
    };

    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.api.getList(this.projectId()).subscribe({
      next: items => { this.dataSource.data = items; this.loading.set(false); this.applyFilter(); },
      error: () => { this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 }); this.loading.set(false); },
    });
  }

  onFilterChange(): void { this.applyFilter(); }

  onSortChange(sort: Sort): void {
    const current = this.tblCfg.loadFilters<any>(TABLE_ID) ?? this.filterForm.value;
    this.tblCfg.saveFilters(TABLE_ID, { ...current, sortActive: sort.active, sortDirection: sort.direction });
    this.loadData();
  }

  private applyFilter(): void {
    const v = this.filterForm.value;
    this.dataSource.filter = JSON.stringify({
      search: (v.search ?? '').toLowerCase().trim(),
      category: v.category ?? '',
      value_mode: v.value_mode ?? '',
      is_unit_standard: v.is_unit_standard ?? '',
      is_active: v.is_active ?? '',
    });
    this.dataSource.paginator?.firstPage();
    const sortState = this.sortRef ? { sortActive: this.sortRef.active, sortDirection: this.sortRef.direction } : {};
    this.tblCfg.saveFilters(TABLE_ID, { ...v, ...sortState });
  }

  hasActiveFilters(): boolean {
    const v = this.filterForm.value;
    return !!(v.search || v.category || v.value_mode || v.is_unit_standard || v.is_active || this.sortRef?.active);
  }

  resetAll(): void {
    this.filterForm.reset({ search: '', category: '', value_mode: '', is_unit_standard: '', is_active: '' });
    if (this.sortRef) { this.sortRef.active = ''; this.sortRef.direction = ''; }
    this.tblCfg.resetFilters(TABLE_ID);
    this.loadData();
  }

  openTableSettings(): void {
    this.dialog.open(TableSettingsDialogComponent, {
      width: '400px', maxHeight: '90vh',
      data: { columns: this.columnDefs(), tableId: TABLE_ID },
    }).afterClosed().subscribe(result => {
      if (!result) return;
      if (result === 'reset') { this.tblCfg.resetConfig(TABLE_ID); this.columnDefs.set([...DEFAULT_COLUMNS]); }
      else { this.columnDefs.set(result); this.tblCfg.saveConfig(TABLE_ID, result); }
    });
  }

  openCreate(): void {
    this.dialog.open(PromotionItemFormDialogComponent, {
      width: '700px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'create' },
    }).afterClosed().subscribe(r => { if (r) { this.snack.open('สร้างรายการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); } });
  }

  /** Export รายการที่ผ่าน filter ปัจจุบัน → ไฟล์ JSON */
  exportJson(): void {
    // ใช้ filteredData เพื่อ export เฉพาะที่มองเห็นใน table หลังกรอง
    const items = this.dataSource.filteredData ?? this.dataSource.data;
    if (!items || items.length === 0) {
      this.snack.open('ไม่มีรายการให้ส่งออก', 'ปิด', { duration: 3000 });
      return;
    }

    const project = this.project.selectedProject();
    const payload: PromotionItemExportFile = {
      format:              'promotion-items.v1',
      exported_at:         new Date().toISOString(),
      source_project_id:   project ? Number(project.id) : undefined,
      source_project_name: project?.name,
      count:               items.length,
      items:               items.map(it => this.toJsonItem(it)),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safe = (project?.name ?? 'project').replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_').slice(0, 60);
    a.href     = url;
    a.download = `promotion-items_${safe}_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.snack.open(`ส่งออก ${items.length} รายการสำเร็จ`, 'ปิด', { duration: 3000 });
  }

  /** เปิด dialog เลือก/นำเข้าไฟล์ JSON */
  openImportJson(): void {
    const pid = this.projectId();
    if (pid <= 0) {
      this.snack.open('กรุณาเลือกโครงการก่อน', 'ปิด', { duration: 3000 });
      return;
    }
    this.dialog.open(ImportJsonDialogComponent, {
      width: '900px', maxWidth: '95vw', maxHeight: '90vh', disableClose: false,
      data: {
        projectId:   pid,
        projectName: this.project.selectedProject()?.name,
      } satisfies ImportJsonDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadData(); });
  }

  private toJsonItem(it: PromotionItem): PromotionItemJson {
    return {
      code:                       it.code,
      name:                       it.name,
      category:                   it.category,
      default_value:              Number(it.default_value ?? 0),
      max_value:                  it.max_value != null ? Number(it.max_value) : null,
      default_used_value:         it.default_used_value != null ? Number(it.default_used_value) : null,
      discount_convert_value:     it.discount_convert_value != null ? Number(it.discount_convert_value) : null,
      value_mode:                 it.value_mode,
      is_unit_standard:           !!Number(it.is_unit_standard),
      is_active:                  !!Number(it.is_active),
      sort_order:                 Number(it.sort_order ?? 0),
      eligible_start_date:        it.eligible_start_date,
      eligible_end_date:          it.eligible_end_date,
      eligible_house_model_names: (it.eligible_house_models ?? []).map(h => h.house_model_name).filter(Boolean),
      eligible_unit_codes:        (it.eligible_units ?? []).map(u => u.unit_code).filter(Boolean),
    };
  }

  openBrowseFreebies(): void {
    const pid = this.projectId();
    if (pid <= 0) {
      this.snack.open('กรุณาเลือกโครงการก่อน', 'ปิด', { duration: 3000 });
      return;
    }
    this.dialog.open(BrowseFreebiesDialogComponent, {
      width: '1100px', maxWidth: '95vw', maxHeight: '90vh', disableClose: true,
      data: {
        projectId: pid,
        projectName: this.project.selectedProject()?.name,
      } satisfies BrowseFreebiesDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadData(); });
  }

  openEdit(item: PromotionItem): void {
    this.dialog.open(PromotionItemFormDialogComponent, {
      width: '700px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'edit', item },
    }).afterClosed().subscribe(r => { if (r) { this.snack.open('อัปเดตรายการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); } });
  }

  confirmDelete(item: PromotionItem): void {
    if (!confirm(`ยืนยันลบรายการ "${item.name}"?`)) return;
    this.api.delete(item.id).subscribe({
      next: () => { this.snack.open('ลบรายการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 5000 }),
    });
  }

  // ── Helpers ──
  categoryLabel(c: string): string {
    return c === 'discount' ? 'ส่วนลด' : c === 'premium' ? 'ของสมนาคุณ' : 'สนับสนุนค่าใช้จ่าย';
  }
  categoryClass(c: string): string {
    return c === 'discount' ? 'bg-amber-50 text-amber-700' : c === 'premium' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700';
  }
  modeLabel(m: string): string {
    return m === 'fixed' ? 'คงที่' : m === 'actual' ? 'ตามจริง' : m === 'manual' ? 'กำหนดเอง' : 'คำนวณอัตโนมัติ';
  }
  modeClass(m: string): string {
    return m === 'fixed' ? 'bg-slate-100 text-slate-600' : m === 'actual' ? 'bg-green-50 text-green-700' : m === 'manual' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700';
  }
  formatCurrency(v: any): string {
    const n = Number(v);
    return isNaN(n) ? '—' : '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 0 });
  }
  formatDate(d: string): string {
    return formatThaiDate(d, 'auto');
  }
}
