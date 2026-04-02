import { Component, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import {
  BottomLineApiService, UploadResult, ImportResult, MappingPreset,
  MappingConfig, PreviewResult,
} from '../bottom-line-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-bottom-line-import',
  standalone: true,
  imports: [
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatStepperModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatCheckboxModule, MatTableModule,
    MatProgressSpinnerModule, MatSnackBarModule, SvgIconComponent,
  ],
  templateUrl: './bottom-line-import.component.html',
})
export class BottomLineImportComponent implements OnInit {
  @ViewChild('stepper') stepper!: MatStepper;

  private api     = inject(BottomLineApiService);
  private project = inject(ProjectService);
  private router  = inject(Router);
  private http    = inject(HttpClient);
  private snack   = inject(MatSnackBar);
  private fb      = inject(FormBuilder);

  // ── State ──
  uploading     = signal(false);
  importing     = signal(false);
  previewing    = signal(false);
  selectedFile  = signal<File | null>(null);
  uploadResult  = signal<UploadResult | null>(null);
  importResult  = signal<ImportResult | null>(null);
  importError   = signal<string | null>(null);
  presets       = signal<MappingPreset[]>([]);
  dragOver      = signal(false);

  // ── Preview data (อัปเดตจาก preview API) ──
  previewRows   = signal<PreviewResult['preview_rows']>([]);
  totalRows     = signal(0);
  columnSamples = signal<Record<string, string>>({});

  // ── Computed ──
  projectId   = computed(() => Number(this.project.selectedProject()?.id ?? 0));
  projectName = computed(() => this.project.selectedProject()?.name ?? '');
  columns     = computed(() => Object.keys(this.columnSamples()));

  // ── Table columns ──
  previewColumns = ['row', 'unit_code', 'bottom_line_price', 'appraisal_price'];
  reviewColumns  = ['row', 'unit_code', 'bottom_line_price', 'appraisal_price'];

  // ── Forms ──
  uploadForm: FormGroup = this.fb.group({
    selectedPresetId: [null as number | null],
  });

  mappingForm: FormGroup = this.fb.group({
    sheet_name:               [''],
    header_row:               [1, [Validators.required, Validators.min(1)]],
    data_start_row:           [2, [Validators.required, Validators.min(1)]],
    unit_code_column:         ['A', Validators.required],
    bottom_line_price_column: ['B', Validators.required],
    appraisal_price_column:   ['C', Validators.required],
    save_preset:              [false],
    preset_name:              [''],
    set_as_default:           [false],
  });

  noteControl = this.fb.control('');

  ngOnInit(): void {
    if (this.projectId()) this.loadPresets();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Step 1: Upload
  // ═══════════════════════════════════════════════════════════════════════

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.selectedFile.set(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      this.selectedFile.set(file);
    } else {
      this.snack.open('รองรับเฉพาะไฟล์ .xlsx หรือ .xls', 'ปิด', { duration: 3000 });
    }
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); this.dragOver.set(true); }
  onDragLeave(): void { this.dragOver.set(false); }
  clearFile(event: Event): void { event.stopPropagation(); this.selectedFile.set(null); }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  upload(): void {
    const file = this.selectedFile();
    if (!file || !this.projectId()) return;
    this.uploading.set(true);

    const presetId = this.uploadForm.value.selectedPresetId ?? undefined;

    this.api.upload(file, this.projectId(), presetId).subscribe({
      next: result => {
        this.uploadResult.set(result);
        this.uploading.set(false);

        // Set initial preview data จาก upload result
        this.previewRows.set(result.preview_rows.map(r => ({
          row: r['row'], unit_code: r['A'] ?? '', bottom_line_price: r['B'] ?? 0, appraisal_price: r['C'] ?? 0,
        })));
        this.totalRows.set(result.total_rows);
        this.columnSamples.set(result.detected_columns);

        // Auto-fill mapping
        if (result.sheets.length > 0) {
          this.mappingForm.patchValue({ sheet_name: result.sheets[0] });
        }
        if (result.mapping_used && presetId) {
          const preset = this.presets().find(p => p.id === presetId);
          if (preset?.mapping_config) {
            this.mappingForm.patchValue({
              unit_code_column:         preset.mapping_config.unit_code_column,
              bottom_line_price_column: preset.mapping_config.bottom_line_price_column,
              appraisal_price_column:   preset.mapping_config.appraisal_price_column,
              header_row:               preset.mapping_config.header_row,
              data_start_row:           preset.mapping_config.data_start_row,
              sheet_name:               preset.mapping_config.sheet_name,
            });
          }
        }

        // Refresh preview ด้วย mapping ปัจจุบัน
        this.refreshPreview();
        this.stepper.next();
      },
      error: err => {
        this.uploading.set(false);
        this.snack.open(err.error?.error ?? 'อัปโหลดไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Step 2: Preview — re-parse เมื่อเปลี่ยน mapping
  // ═══════════════════════════════════════════════════════════════════════

  refreshPreview(): void {
    const r = this.uploadResult();
    if (!r) return;
    this.previewing.set(true);

    const mv = this.mappingForm.value;
    const mapping: MappingConfig = {
      unit_code_column:         mv.unit_code_column,
      bottom_line_price_column: mv.bottom_line_price_column,
      appraisal_price_column:   mv.appraisal_price_column,
      header_row:               mv.header_row,
      data_start_row:           mv.data_start_row,
      sheet_name:               mv.sheet_name,
    };

    this.api.preview(r.temp_file, mapping).subscribe({
      next: preview => {
        this.previewRows.set(preview.preview_rows);
        this.totalRows.set(preview.total_rows);
        this.columnSamples.set(preview.detected_columns);
        this.previewing.set(false);
      },
      error: err => {
        this.previewing.set(false);
        this.snack.open(err.error?.error ?? 'อ่านข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 });
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Step 3: Confirm Import
  // ═══════════════════════════════════════════════════════════════════════

  confirmImport(): void {
    const r = this.uploadResult();
    if (!r) return;
    this.importing.set(true);
    this.importError.set(null);

    const mv = this.mappingForm.value;
    const mapping: MappingConfig = {
      unit_code_column:         mv.unit_code_column,
      bottom_line_price_column: mv.bottom_line_price_column,
      appraisal_price_column:   mv.appraisal_price_column,
      header_row:               mv.header_row,
      data_start_row:           mv.data_start_row,
      sheet_name:               mv.sheet_name,
    };

    this.api.import({
      project_id:      this.projectId(),
      temp_file:       r.temp_file,
      file_name:       r.file_name,
      mapping,
      save_mapping_as: mv.save_preset ? (mv.preset_name || undefined) : undefined,
      set_as_default:  mv.save_preset ? !!mv.set_as_default : false,
      note:            this.noteControl.value || undefined,
    }).subscribe({
      next: result => {
        this.importResult.set(result);
        this.importing.set(false);
        this.stepper.next();
      },
      error: err => {
        this.importing.set(false);
        this.importError.set(err.error?.error ?? 'Import ไม่สำเร็จ');
        this.snack.open(err.error?.error ?? 'Import ไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Step 4: Actions
  // ═══════════════════════════════════════════════════════════════════════

  goToHistory(): void { this.router.navigate(['/bottom-line/history']); }

  resetStepper(): void {
    this.selectedFile.set(null);
    this.uploadResult.set(null);
    this.importResult.set(null);
    this.importError.set(null);
    this.previewRows.set([]);
    this.totalRows.set(0);
    this.columnSamples.set({});
    this.uploadForm.reset();
    this.mappingForm.reset({
      header_row: 1, data_start_row: 2,
      unit_code_column: 'A', bottom_line_price_column: 'B', appraisal_price_column: 'C',
    });
    this.noteControl.reset();
    this.stepper.reset();
  }

  downloadSample(): void {
    this.http.get('/api/bottom-lines/sample', { responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bottom_line_sample.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('ดาวน์โหลดไม่สำเร็จ', 'ปิด', { duration: 3000 }),
    });
  }

  // ── Presets ──
  private loadPresets(): void {
    this.api.getMappings(this.projectId()).subscribe({
      next: p => this.presets.set(p),
    });
  }

  formatCurrency(v: any): string {
    const n = Number(v);
    if (isNaN(n)) return '—';
    return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 0 });
  }
}
