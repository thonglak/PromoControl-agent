import { CommonModule } from '@angular/common';
import { Component, OnInit, AfterViewInit, ViewChild, inject, signal, computed, effect } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HouseModelApiService, HouseModel } from '../house-model-api.service';
import { HouseModelFormDialogComponent } from '../dialogs/house-model-form-dialog.component';
import { ProjectService } from '../../../../core/services/project.service';
import { AuthService } from '../../../../core/services/auth.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService, ColumnDef } from '../../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../../shared/components/table-settings/table-settings-dialog.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../../shared/components/section-card/section-card.component';

const TABLE_ID = 'house-model-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'code',               label: 'รหัส',         visible: true },
  { key: 'name',               label: 'ชื่อแบบบ้าน',   visible: true },
  { key: 'area_sqm',           label: 'พื้นที่',        visible: true },
  { key: 'unit_count',         label: 'ยูนิต',         visible: true },
  { key: 'actions',            label: 'จัดการ',         visible: true, locked: true },
];

@Component({
  selector: 'app-house-model-list',
  standalone: true,
  imports: [
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatDialogModule, MatSnackBarModule, MatTooltipModule, MatProgressSpinnerModule,
    SvgIconComponent,
  ],
  templateUrl: './house-model-list.component.html',
})
export class HouseModelListComponent implements OnInit, AfterViewInit {
  private api     = inject(HouseModelApiService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);
  private auth    = inject(AuthService);
  private project = inject(ProjectService);
  private tblCfg  = inject(TableConfigService);

  @ViewChild(MatSort) set matSort(s: MatSort) { if (s) { this.dataSource.sort = s; } }
  @ViewChild(MatPaginator) set matPaginator(p: MatPaginator) { if (p) { this.dataSource.paginator = p; } }

  // ── Table config ──
  columnDefs       = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  dataSource       = new MatTableDataSource<HouseModel>([]);
  loading          = signal(false);

  isAdmin   = computed(() => this.auth.currentUser()?.role === 'admin');
  isManager = computed(() => this.auth.currentUser()?.role === 'manager');
  canWrite  = computed(() => this.project.canEdit());

  private fb = inject(FormBuilder);
  filterForm = this.fb.group({ search: [''] });

  ngOnInit(): void {
    const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
    if (saved) this.filterForm.patchValue(saved, { emitEvent: false });
    this.loadModels();
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

  loadModels(): void {
    if (!this.projectId) return;
    this.loading.set(true);
    this.api.getList(this.projectId, this.filterForm.value.search ?? '').subscribe({
      next: models => {
        this.dataSource.data = models;
        this.loading.set(false);
      },
      error: () => {
        this.snack.open('โหลดข้อมูลแบบบ้านไม่สำเร็จ', 'ปิด', { duration: 4000 });
        this.loading.set(false);
      },
    });
  }

  onSearchChange(): void {
    this.tblCfg.saveFilters(TABLE_ID, this.filterForm.value);
    this.loadModels();
  }

  openCreate(): void {
    this.dialog.open(HouseModelFormDialogComponent, {
      data: { mode: 'create', projectId: this.projectId },
      width: '600px',
      maxHeight: '90vh',
      disableClose: true,
    }).afterClosed().subscribe(result => {
      if (result) {
        this.snack.open('สร้างแบบบ้านสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadModels();
      }
    });
  }

  openEdit(model: HouseModel): void {
    this.dialog.open(HouseModelFormDialogComponent, {
      data: { mode: 'edit', projectId: this.projectId, model },
      width: '600px',
      maxHeight: '90vh',
      disableClose: true,
    }).afterClosed().subscribe(result => {
      if (result) {
        this.snack.open('แก้ไขแบบบ้านสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadModels();
      }
    });
  }

  confirmDelete(model: HouseModel): void {
    if (!confirm(`ยืนยันลบแบบบ้าน "${model.name}"?`)) return;
    this.api.delete(model.id).subscribe({
      next: () => {
        this.snack.open('ลบแบบบ้านสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadModels();
      },
      error: err => {
        this.snack.open(err.error?.error ?? 'ลบแบบบ้านไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  formatCurrency(value: number): string {
    return '฿' + Number(value).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
