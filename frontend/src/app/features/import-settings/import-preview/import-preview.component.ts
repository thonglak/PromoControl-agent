import { Component, OnInit, inject, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';

import { ImportConfigApiService, ImportConfig, PreviewResponse } from '../import-config-api.service';
import { ProjectService, Project } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ImportConfigFormDialogComponent } from '../dialogs/import-config-form-dialog.component';

@Component({
  selector: 'app-import-preview',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatButtonModule, MatSelectModule, MatFormFieldModule,
    MatPaginatorModule, MatSortModule, MatSnackBarModule, MatProgressSpinnerModule,
    MatDialogModule,
    SvgIconComponent, PageHeaderComponent, SectionCardComponent,
  ],
  templateUrl: './import-preview.component.html',
})
export class ImportPreviewComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private api     = inject(ImportConfigApiService);
  private project = inject(ProjectService);
  private snack   = inject(MatSnackBar);
  private http    = inject(HttpClient);
  private dialog  = inject(MatDialog);

  // state
  configs       = signal<ImportConfig[]>([]);
  projects      = signal<Project[]>([]);
  selectedConfigId: number | null = null;
  selectedFile  = signal<File | null>(null);
  isDragging    = signal(false);
  loading       = signal(false);

  previewResult = signal<PreviewResponse | null>(null);

  // pagination
  pageIndex = signal(0);
  pageSize  = signal(20);

  // derived
  projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  detectedColumnKeys = computed(() => {
    const r = this.previewResult();
    return r ? Object.keys(r.detected_columns) : [];
  });

  previewColumns = computed(() => {
    const r = this.previewResult();
    if (!r || r.preview_rows.length === 0) return [];
    return Object.keys(r.preview_rows[0]).filter(k => k !== 'row_number');
  });

  pagedRows = computed(() => {
    const r = this.previewResult();
    if (!r) return [];
    const start = this.pageIndex() * this.pageSize();
    return r.preview_rows.slice(start, start + this.pageSize());
  });

  numericColumns = computed(() => {
    const totals = this.previewResult()?.column_totals ?? {};
    return Object.keys(totals);
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
    const pid = this.projectId();
    if (!pid) return;
    this.api.getList(pid).subscribe({
      next: list => this.configs.set(list),
      error: () => {},
    });
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(): void { this.isDragging.set(false); }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) this.selectedFile.set(file);
  }

  onFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.selectedFile.set(file);
  }

  triggerFileInput(): void { this.fileInputRef.nativeElement.click(); }

  doPreview(): void {
    const file = this.selectedFile();
    if (!file) { this.snack.open('กรุณาเลือกไฟล์ก่อน', 'ปิด', { duration: 3000 }); return; }
    const pid = this.projectId();
    if (!pid) { this.snack.open('กรุณาเลือกโครงการก่อน', 'ปิด', { duration: 3000 }); return; }

    this.loading.set(true);
    const cfgId = this.selectedConfigId ?? undefined;
    this.api.preview(file, pid, cfgId).subscribe({
      next: result => { this.previewResult.set(result); this.loading.set(false); this.pageIndex.set(0); },
      error: err => {
        this.snack.open(err.error?.error ?? 'อ่านไฟล์ไม่สำเร็จ', 'ปิด', { duration: 4000 });
        this.loading.set(false);
      },
    });
  }

  saveAsConfig(): void {
    this.dialog.open(ImportConfigFormDialogComponent, {
      width: '90vw', maxWidth: '90vw', maxHeight: '90vh', disableClose: true,
      data: { mode: 'create', projectId: this.projectId() },
    }).afterClosed().subscribe(saved => {
      if (saved) { this.snack.open('บันทึก Config สำเร็จ', 'ปิด', { duration: 3000 }); this.loadConfigs(); }
    });
  }

  onPage(e: PageEvent): void {
    this.pageIndex.set(e.pageIndex);
    this.pageSize.set(e.pageSize);
  }

  getTotal(col: string): number { return this.previewResult()?.column_totals?.[col]?.sum ?? 0; }
  getCount(col: string): number { return this.previewResult()?.column_totals?.[col]?.count ?? 0; }
  getMin(col: string): number   { return this.previewResult()?.column_totals?.[col]?.min ?? 0; }
  getMax(col: string): number   { return this.previewResult()?.column_totals?.[col]?.max ?? 0; }
  isNumericCol(col: string): boolean { return !!this.previewResult()?.column_totals?.[col]; }
  getCellValue(row: Record<string, string | number>, col: string): string | number { return row[col] ?? ''; }
  getSamples(key: string): string {
    const dc = this.previewResult()?.detected_columns?.[key];
    return dc?.samples?.slice(0, 3).join(', ') ?? '';
  }

  get totalRows(): number { return this.previewResult()?.file_info.total_rows ?? 0; }
  get validRows(): number { return this.previewResult()?.preview_rows.length ?? 0; }
  get errorRows(): number { return this.totalRows - this.validRows; }
}
