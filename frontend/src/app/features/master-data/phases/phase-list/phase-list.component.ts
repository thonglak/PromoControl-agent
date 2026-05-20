import { Component, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PhaseApiService, Phase } from '../phase-api.service';
import { PhaseFormDialogComponent, PhaseFormDialogData } from '../dialogs/phase-form-dialog.component';
import { ProjectService } from '../../../../core/services/project.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../../shared/components/section-card/section-card.component';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService, ColumnDef } from '../../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../../shared/components/table-settings/table-settings-dialog.component';

const TABLE_ID = 'phase-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'sort_order', label: 'ลำดับ',      visible: true },
  { key: 'name',       label: 'ชื่อ Phase', visible: true },
  { key: 'unit_count', label: 'จำนวนยูนิต', visible: true },
  { key: 'actions',    label: 'จัดการ',      visible: true, locked: true },
];

@Component({
  selector: 'app-phase-list',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatTooltipModule, MatProgressSpinnerModule,
    PageHeaderComponent, SectionCardComponent, SvgIconComponent,
  ],
  templateUrl: './phase-list.component.html',
})
export class PhaseListComponent implements OnInit {
  private api     = inject(PhaseApiService);
  private project = inject(ProjectService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);
  private tblCfg  = inject(TableConfigService);
  private fb      = inject(FormBuilder);

  loading = signal(false);

  /** ข้อมูลดิบทั้งหมดจาก API — ใช้กรองฝั่ง client */
  private allPhases = signal<Phase[]>([]);
  /** รายการที่ผ่านตัวกรองแล้ว — ใช้ render การ์ดบนมือถือ */
  rows       = signal<Phase[]>([]);
  dataSource = new MatTableDataSource<Phase>([]);

  // ── สรุปยอด (คิดตามตัวกรองที่ใช้อยู่) ──
  summary = signal({ count: 0, unitTotal: 0 });

  // ── Table config ──
  columnDefs       = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  filterForm = this.fb.group({
    search: [''],
  });

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

  get projectId(): number {
    return Number(this.project.selectedProject()?.id ?? 0);
  }

  get canEdit(): boolean {
    return this.project.canEdit();
  }

  ngOnInit(): void {
    const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
    if (saved) this.filterForm.patchValue(saved, { emitEvent: false });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getAll(this.projectId).subscribe({
      next: data => {
        this.allPhases.set(data);
        this.applyFilters();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** กรองฝั่ง client ตามคำค้นหา แล้วอัปเดตตาราง + การ์ด + สรุปยอด */
  private applyFilters(): void {
    const q = (this.filterForm.value.search ?? '').trim().toLowerCase();
    let list = this.allPhases();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));

    this.dataSource.data = list;
    this.rows.set(list);
    this.summary.set(this.computeSummary(list));
  }

  /** สรุปยอดจากรายการที่แสดงอยู่ (ผ่านตัวกรองแล้ว) */
  private computeSummary(list: Phase[]) {
    let unitTotal = 0;
    for (const p of list) unitTotal += Number(p.unit_count) || 0;
    return { count: list.length, unitTotal };
  }

  onFilterChange(): void {
    const sortState = this.sortRef ? { sortActive: this.sortRef.active, sortDirection: this.sortRef.direction } : {};
    this.tblCfg.saveFilters(TABLE_ID, { ...this.filterForm.value, ...sortState });
    this.applyFilters();
  }

  onSortChange(sort: Sort): void {
    const current = this.tblCfg.loadFilters<any>(TABLE_ID) ?? this.filterForm.value;
    this.tblCfg.saveFilters(TABLE_ID, { ...current, sortActive: sort.active, sortDirection: sort.direction });
  }

  hasActiveFilters(): boolean {
    return !!(this.filterForm.value.search || this.sortRef?.active);
  }

  resetAll(): void {
    this.filterForm.reset({ search: '' });
    if (this.sortRef) {
      this.sortRef.active = '';
      this.sortRef.direction = '';
      this.sortRef.sortChange.emit({ active: '', direction: '' });
    }
    this.tblCfg.resetFilters(TABLE_ID);
    this.applyFilters();
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

  openCreate(): void {
    this.dialog.open(PhaseFormDialogComponent, {
      data: { mode: 'create', projectId: this.projectId } as PhaseFormDialogData,
      width: '480px',
      disableClose: true,
    }).afterClosed().subscribe(result => {
      if (result) { this.snack.open('สร้าง Phase สำเร็จ', 'ปิด', { duration: 3000 }); this.load(); }
    });
  }

  openEdit(phase: Phase): void {
    this.dialog.open(PhaseFormDialogComponent, {
      data: { mode: 'edit', projectId: this.projectId, phase } as PhaseFormDialogData,
      width: '480px',
      disableClose: true,
    }).afterClosed().subscribe(result => {
      if (result) { this.snack.open('อัปเดต Phase สำเร็จ', 'ปิด', { duration: 3000 }); this.load(); }
    });
  }

  confirmDelete(phase: Phase): void {
    if (!confirm(`ยืนยันลบ "${phase.name}"?`)) return;
    this.api.delete(phase.id).subscribe({
      next: () => { this.snack.open('ลบ Phase สำเร็จ', 'ปิด', { duration: 2000 }); this.load(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 4000 }),
    });
  }
}
