import { Component, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';

import {
  PremiumImportApiService, PremiumUploadResult, PremiumImportResult,
  PremiumValidateResult, PremiumSyncResult, PremiumPlanItem,
} from '../premium-import-api.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-premium-import',
  standalone: true,
  imports: [
    CommonModule, FormsModule, PageHeaderComponent, SvgIconComponent,
    MatStepperModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatTooltipModule,
  ],
  templateUrl: './premium-import.component.html',
})
export class PremiumImportComponent {
  @ViewChild('stepper') stepper!: MatStepper;

  private api   = inject(PremiumImportApiService);
  private snack = inject(MatSnackBar);

  // ── State ──
  uploading    = signal(false);
  importing    = signal(false);
  validating   = signal(false);
  syncing      = signal(false);
  dragOver     = signal(false);

  selectedFile  = signal<File | null>(null);
  uploadResult  = signal<PremiumUploadResult | null>(null);
  selectedNames = signal<Set<string>>(new Set());
  importResult  = signal<PremiumImportResult | null>(null);
  validateResults = signal<PremiumValidateResult[]>([]);
  syncResults     = signal<PremiumSyncResult[]>([]);
  // ชื่อรายการของแถมที่ผู้ใช้แก้ — key (จาก plan) → ชื่อใหม่
  nameEdits     = signal<Record<string, string>>({});

  // ── Computed ──
  selectedCount  = computed(() => this.selectedNames().size);
  batches        = computed(() => this.importResult()?.batches ?? []);
  totalMatched   = computed(() => this.validateResults().reduce((s, v) => s + v.matched_rows, 0));
  totalUnmatched = computed(() => this.validateResults().reduce((s, v) => s + v.unmatched_rows + v.ambiguous_rows, 0));
  totalSynced    = computed(() => this.syncResults().reduce((s, r) => s + r.synced_units, 0));
  totalCreated   = computed(() => this.syncResults().reduce((s, r) => s + r.created_items.length, 0));

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
    if (!file) return;
    this.uploading.set(true);

    this.api.upload(file).subscribe({
      next: result => {
        this.uploadResult.set(result);
        // เลือกชีตที่นำเข้าได้ทั้งหมดไว้ก่อน
        this.selectedNames.set(new Set(result.sheets.filter(s => s.importable).map(s => s.sheet_name)));
        this.uploading.set(false);
        this.stepper.next();
      },
      error: err => {
        this.uploading.set(false);
        this.snack.open(err.error?.error ?? 'อัปโหลดไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Step 2: เลือกชีต → import ลง staging
  // ═══════════════════════════════════════════════════════════════════════

  toggleSheet(name: string): void {
    const next = new Set(this.selectedNames());
    next.has(name) ? next.delete(name) : next.add(name);
    this.selectedNames.set(next);
  }

  confirmImport(): void {
    const r = this.uploadResult();
    if (!r || this.selectedCount() === 0) return;
    this.importing.set(true);

    this.api.import(r.temp_file, r.file_name, [...this.selectedNames()]).subscribe({
      next: result => {
        this.importResult.set(result);
        this.importing.set(false);
        this.stepper.next();
        this.validateAll();
      },
      error: err => {
        this.importing.set(false);
        this.snack.open(err.error?.error ?? 'นำเข้าไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Step 3: Validate (รันอัตโนมัติหลัง import)
  // ═══════════════════════════════════════════════════════════════════════

  validateAll(): void {
    const batches = this.batches();
    if (batches.length === 0) return;
    this.validating.set(true);

    forkJoin(batches.map(b => this.api.validate(b.batch_id))).subscribe({
      next: results => {
        this.validateResults.set(results);
        // ตั้งชื่อเริ่มต้นของรายการที่จะสร้างใหม่ (ยังไม่มีในระบบ)
        const edits: Record<string, string> = {};
        for (const v of results) {
          for (const p of v.plan) {
            if (p.existing_item_id === null) edits[p.key] = p.proposed_name;
          }
        }
        this.nameEdits.set(edits);
        this.validating.set(false);
      },
      error: err => {
        this.validating.set(false);
        this.snack.open(err.error?.error ?? 'ตรวจสอบไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Step 4: Sync
  // ═══════════════════════════════════════════════════════════════════════

  confirmSync(): void {
    const batches = this.batches();
    if (batches.length === 0) return;
    this.syncing.set(true);

    forkJoin(batches.map(b => this.api.sync(b.batch_id, this.overridesFor(b.batch_id)))).subscribe({
      next: results => {
        this.syncResults.set(results);
        this.syncing.set(false);
        this.stepper.next();
      },
      error: err => {
        this.syncing.set(false);
        this.snack.open(err.error?.error ?? 'Sync ไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  reset(): void {
    this.selectedFile.set(null);
    this.uploadResult.set(null);
    this.selectedNames.set(new Set());
    this.importResult.set(null);
    this.validateResults.set([]);
    this.syncResults.set([]);
    this.stepper.reset();
  }

  // ── Helpers ──
  validateOf(batchId: number): PremiumValidateResult | undefined {
    return this.validateResults().find(v => v.batch_id === batchId);
  }
  syncOf(batchId: number): PremiumSyncResult | undefined {
    return this.syncResults().find(r => r.batch_id === batchId);
  }
  batchName(batchId: number): string {
    return this.batches().find(b => b.batch_id === batchId)?.sheet_name ?? '-';
  }

  // ── Plan / name editing ──
  planOf(batchId: number): PremiumPlanItem[] {
    return this.validateOf(batchId)?.plan ?? [];
  }
  setName(key: string, value: string): void {
    this.nameEdits.set({ ...this.nameEdits(), [key]: value });
  }
  /** name_overrides ของ batch หนึ่ง (เฉพาะรายการที่จะสร้างใหม่) */
  overridesFor(batchId: number): Record<string, string> {
    const out: Record<string, string> = {};
    for (const p of this.planOf(batchId)) {
      if (p.existing_item_id === null) {
        out[p.key] = (this.nameEdits()[p.key] ?? p.proposed_name).trim() || p.proposed_name;
      }
    }
    return out;
  }
  /** ข้อความสรุปเงื่อนไขการใช้งาน */
  eligText(p: PremiumPlanItem): string {
    const e = p.eligibility;
    if (e.scope === 'house_model') return 'เฉพาะแบบบ้าน ' + e.house_models.join(', ');
    if (e.scope === 'unit')        return 'เฉพาะ ' + this.formatNumber(e.unit_count) + ' ยูนิต';
    return 'ใช้ได้ทุกยูนิต';
  }
  strategyLabel(s: string): string {
    return s === 'group' ? 'ค่าคงที่' : 'ดึงค่ารายยูนิต';
  }

  categoryLabel(c: string): string {
    return c === 'discount' ? 'ส่วนลด' : c === 'premium' ? 'ของแถม' : 'ค่าใช้จ่าย';
  }
  categoryClass(c: string): string {
    return c === 'discount' ? 'bg-amber-50 text-amber-700'
      : c === 'premium' ? 'bg-blue-50 text-blue-700'
      : 'bg-purple-50 text-purple-700';
  }

  formatNumber(v: any): string {
    const n = Number(v);
    return isNaN(n) ? '—' : n.toLocaleString('th-TH');
  }
}
