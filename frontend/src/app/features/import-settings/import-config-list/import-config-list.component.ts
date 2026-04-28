import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';

import { ImportConfigApiService, ImportConfig } from '../import-config-api.service';
import { ImportConfigFormDialogComponent } from '../dialogs/import-config-form-dialog.component';
import { ProjectService, Project } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';

const IMPORT_TYPE_LABELS: Record<string, string> = {
  bottom_line: 'Bottom Line',
  unit: 'ยูนิต',
  promotion: 'โปรโมชั่น',
  custom: 'อื่นๆ',
};

@Component({
  selector: 'app-import-config-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatButtonModule, MatSelectModule, MatFormFieldModule,
    MatPaginatorModule, MatTooltipModule, MatSnackBarModule, MatDialogModule,
    MatProgressSpinnerModule,
    SvgIconComponent, PageHeaderComponent, SectionCardComponent,
  ],
  templateUrl: './import-config-list.component.html',
})
export class ImportConfigListComponent implements OnInit {
  private api     = inject(ImportConfigApiService);
  private project = inject(ProjectService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);
  private http    = inject(HttpClient);

  loading     = signal(false);
  configs     = signal<ImportConfig[]>([]);
  projects    = signal<Project[]>([]);

  filterProjectId: number | null = null;
  filterImportType: string = '';

  pageIndex = signal(0);
  pageSize  = signal(10);

  displayedColumns = ['config_name', 'import_type', 'project_name', 'target_table', 'is_default', 'created_at', 'actions'];

  importTypeOptions = [
    { value: 'bottom_line', label: 'Bottom Line' },
    { value: 'unit', label: 'ยูนิต' },
    { value: 'promotion', label: 'โปรโมชั่น' },
    { value: 'custom', label: 'อื่นๆ' },
  ];

  pagedConfigs = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.configs().slice(start, start + this.pageSize());
  });

  ngOnInit(): void {
    this.loadProjects();
    this.loadConfigs();
  }

  loadProjects(): void {
    this.http.get<{ data: Project[] }>('/api/projects').pipe(map(r => r.data)).subscribe({
      next: list => this.projects.set(list),
      error: () => {},
    });
  }

  loadConfigs(): void {
    this.loading.set(true);
    const pid  = this.filterProjectId;
    const type = this.filterImportType;
    this.api.getList(pid ?? (Number(this.project.selectedProject()?.id) || 0), type || undefined).subscribe({
      next: list => { this.configs.set(list); this.loading.set(false); this.pageIndex.set(0); },
      error: () => { this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 }); this.loading.set(false); },
    });
  }

  openCreate(): void {
    this.dialog.open(ImportConfigFormDialogComponent, {
      width: '90vw', maxWidth: '90vw', maxHeight: '90vh', disableClose: true,
      data: { mode: 'create', projectId: Number(this.project.selectedProject()?.id ?? 0) },
    }).afterClosed().subscribe(saved => { if (saved) { this.snack.open('สร้าง Config สำเร็จ', 'ปิด', { duration: 3000 }); this.loadConfigs(); } });
  }

  openEdit(config: ImportConfig): void {
    this.dialog.open(ImportConfigFormDialogComponent, {
      width: '90vw', maxWidth: '90vw', maxHeight: '90vh', disableClose: true,
      data: { mode: 'edit', projectId: config.project_id, config },
    }).afterClosed().subscribe(saved => { if (saved) { this.snack.open('บันทึกสำเร็จ', 'ปิด', { duration: 3000 }); this.loadConfigs(); } });
  }

  confirmDelete(config: ImportConfig): void {
    if (!confirm(`ยืนยันลบ Config "${config.config_name}"?`)) return;
    this.api.delete(config.id).subscribe({
      next: () => { this.snack.open('ลบสำเร็จ', 'ปิด', { duration: 3000 }); this.loadConfigs(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 3000 }),
    });
  }

  setDefault(config: ImportConfig): void {
    this.api.setDefault(config.id).subscribe({
      next: () => { this.snack.open(`ตั้ง "${config.config_name}" เป็น Default แล้ว`, 'ปิด', { duration: 3000 }); this.loadConfigs(); },
      error: err => this.snack.open(err.error?.error ?? 'เกิดข้อผิดพลาด', 'ปิด', { duration: 3000 }),
    });
  }

  onPage(e: PageEvent): void {
    this.pageIndex.set(e.pageIndex);
    this.pageSize.set(e.pageSize);
  }

  getTypeLabel(type: string): string {
    return IMPORT_TYPE_LABELS[type] ?? type;
  }
}
