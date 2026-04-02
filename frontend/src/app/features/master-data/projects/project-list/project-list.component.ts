import { Component, OnInit, AfterViewInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ProjectApiService, Project } from '../project-api.service';
import { ProjectFormDialogComponent } from '../dialogs/project-form-dialog.component';
import { AuthService } from '../../../../core/services/auth.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService, ColumnDef } from '../../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../../shared/components/table-settings/table-settings-dialog.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../../shared/components/status-chip/status-chip.component';

const TABLE_ID = 'project-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'code',         label: 'รหัส',           visible: true },
  { key: 'name',         label: 'ชื่อโครงการ',     visible: true },
  { key: 'project_type', label: 'ประเภท',         visible: true },
  { key: 'status',       label: 'สถานะ',          visible: true },
  { key: 'auto_approve', label: 'อนุมัติอัตโนมัติ', visible: true },
  { key: 'pool_budget',  label: 'งบ Pool (บาท)',  visible: true },
  { key: 'unit_count',   label: 'จำนวนยูนิต',     visible: true },
  { key: 'actions',      label: 'จัดการ',          visible: true, locked: true },
];

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    StatusChipComponent,
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, DecimalPipe, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatChipsModule, MatDialogModule,
    MatSnackBarModule, MatTooltipModule, MatProgressSpinnerModule,
    SvgIconComponent,
  ],
  templateUrl: './project-list.component.html',
})
export class ProjectListComponent implements OnInit, AfterViewInit {
  private api      = inject(ProjectApiService);
  private dialog   = inject(MatDialog);
  private snack    = inject(MatSnackBar);
  private auth     = inject(AuthService);
  private fb       = inject(FormBuilder);
  private tblCfg   = inject(TableConfigService);

  @ViewChild(MatSort) set matSort(s: MatSort) { if (s) { this.dataSource.sort = s; } }
  @ViewChild(MatPaginator) set matPaginator(p: MatPaginator) { if (p) { this.dataSource.paginator = p; } }

  // ── Table config ──
  columnDefs       = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  dataSource = new MatTableDataSource<Project>([]);
  loading    = signal(false);

  isAdmin   = computed(() => this.auth.currentUser()?.role === 'admin');
  isManager = computed(() => this.auth.currentUser()?.role === 'manager');
  canWrite  = computed(() => this.isAdmin() || this.isManager());

  filterForm = this.fb.group({ search: [''], status: [''], project_type: [''] });

  ngOnInit(): void {
    // restore saved filters
    const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
    if (saved) this.filterForm.patchValue(saved, { emitEvent: false });
    this.loadProjects();
    this.filterForm.get('status')!.valueChanges.subscribe(() => this.applyFilter());
    this.filterForm.get('project_type')!.valueChanges.subscribe(() => this.applyFilter());
  }

  ngAfterViewInit(): void {
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

  loadProjects(): void {
    this.loading.set(true);
    this.api.getProjects().subscribe({
      next: projects => { this.dataSource.data = projects; this.loading.set(false); this.applyFilter(); },
      error: () => { this.snack.open('โหลดข้อมูลโครงการไม่สำเร็จ', 'ปิด', { duration: 4000 }); this.loading.set(false); },
    });
  }

  applyFilter(): void {
    const { search, status, project_type } = this.filterForm.value;
    const s = (search ?? '').toLowerCase().trim();
    this.dataSource.filterPredicate = (row: Project) => {
      const matchSearch = !s || row.code.toLowerCase().includes(s) || row.name.toLowerCase().includes(s);
      const matchStatus = !status || row.status === status;
      const matchType   = !project_type || row.project_type === project_type;
      return matchSearch && matchStatus && matchType;
    };
    this.dataSource.filter = JSON.stringify({ s, status, project_type });
    this.tblCfg.saveFilters(TABLE_ID, this.filterForm.value);
  }

  openCreate(): void {
    this.dialog.open(ProjectFormDialogComponent, {
      data: { mode: 'create' }, width: '500px', maxHeight: '90vh', disableClose: true,
    }).afterClosed().subscribe(r => { if (r) { this.snack.open('สร้างโครงการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadProjects(); } });
  }

  openEdit(project: Project): void {
    this.dialog.open(ProjectFormDialogComponent, {
      data: { mode: 'edit', project }, width: '500px', maxHeight: '90vh', disableClose: true,
    }).afterClosed().subscribe(r => { if (r) { this.snack.open('แก้ไขโครงการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadProjects(); } });
  }

  confirmDelete(project: Project): void {
    if (!confirm(`ยืนยันลบโครงการ "${project.name}"?`)) return;
    this.api.deleteProject(project.id).subscribe({
      next: () => { this.snack.open('ลบโครงการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadProjects(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 5000 }),
    });
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = { condo: 'คอนโดมิเนียม', house: 'บ้านเดี่ยว', townhouse: 'ทาวน์เฮาส์', mixed: 'มิกซ์ยูส' };
    return map[type] ?? type;
  }
}
