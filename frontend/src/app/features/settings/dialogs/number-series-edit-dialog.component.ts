import {
  Component, inject, signal, computed, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';

import { NumberSeriesService, NumberSeries } from '../services/number-series.service';

// ── Dialog data interface ────────────────────────────────────────────────────

export interface NumberSeriesEditDialogData {
  series: NumberSeries;
}

// ── Document Type Labels ─────────────────────────────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  SALE: 'บันทึกขาย',
  BUDGET_MOVE: 'เคลื่อนไหวงบประมาณ',
  BOTTOM_LINE: 'นำเข้าราคาต้นทุน',
  UNIT_ALLOC: 'ตั้งงบผูกยูนิต',
};

// ── Year format options ──────────────────────────────────────────────────────

const YEAR_FORMAT_OPTIONS = [
  { value: 'YYYY_BE', label: 'พ.ศ. 4 หลัก (2569)' },
  { value: 'YYYY_AD', label: 'ค.ศ. 4 หลัก (2026)' },
  { value: 'YY_BE',   label: 'พ.ศ. 2 หลัก (69)' },
  { value: 'YY_AD',   label: 'ค.ศ. 2 หลัก (26)' },
  { value: 'NONE',    label: 'ไม่แสดงปี' },
];

const YEAR_FORMAT_DISPLAY: Record<string, string> = {
  YYYY_BE: 'ปีพ.ศ.4หลัก',
  YY_BE: 'ปีพ.ศ.2หลัก',
  YYYY_AD: 'ปีค.ศ.4หลัก',
  YY_AD: 'ปีค.ศ.2หลัก',
  NONE: '',
};

// ── Reset cycle options ──────────────────────────────────────────────────────

const RESET_CYCLE_OPTIONS = [
  { value: 'YEARLY',  label: 'รายปี — reset เป็น 1 ทุกต้นปี' },
  { value: 'MONTHLY', label: 'รายเดือน — reset เป็น 1 ทุกต้นเดือน' },
  { value: 'NEVER',   label: 'ไม่ reset — เลขเพิ่มตลอด' },
];

// ── Helper: form config interface ────────────────────────────────────────────

interface FormConfig {
  prefix: string;
  separator: string;
  year_format: string;
  year_separator: string;
  running_digits: number;
  reset_cycle: string;
  next_number: number;
}

// ── Helper functions (เหมือนใน docs/14) ─────────────────────────────────────

function formatYear(date: Date, format: string): string {
  const ad = date.getFullYear();
  const be = ad + 543;
  switch (format) {
    case 'YYYY_BE': return String(be);
    case 'YYYY_AD': return String(ad);
    case 'YY_BE':   return String(be).slice(-2);
    case 'YY_AD':   return String(ad).slice(-2);
    case 'NONE':    return '';
    default:        return '';
  }
}

function formatNumber(config: FormConfig, num: number, date: Date): string {
  const yearPart = formatYear(date, config.year_format);
  const monthPart = config.reset_cycle === 'MONTHLY'
    ? String(date.getMonth() + 1).padStart(2, '0')
    : '';
  const runningPart = String(num).padStart(config.running_digits, '0');

  return config.prefix
    + config.separator
    + yearPart
    + monthPart
    + (config.year_format !== 'NONE' ? config.year_separator : '')
    + runningPart;
}

function getNextResetDate(date: Date, resetCycle: string): Date {
  if (resetCycle === 'YEARLY') {
    return new Date(date.getFullYear() + 1, 0, 1);
  }
  if (resetCycle === 'MONTHLY') {
    const m = date.getMonth() + 1;
    return m >= 12
      ? new Date(date.getFullYear() + 1, 0, 1)
      : new Date(date.getFullYear(), m, 1);
  }
  return date;
}

function buildPatternDisplay(c: FormConfig): string {
  const parts: string[] = [c.prefix];

  if (c.separator) parts.push(c.separator);

  if (c.year_format !== 'NONE') {
    const yearLabel = YEAR_FORMAT_DISPLAY[c.year_format] ?? '';
    parts.push(`{${yearLabel}}`);
  }

  if (c.year_format !== 'NONE' && c.year_separator) {
    parts.push(c.year_separator);
  }

  parts.push(`{เลข${c.running_digits}หลัก}`);

  return parts.join('');
}

function buildPreviewSamples(c: FormConfig): { label: string; number: string }[] {
  const now = new Date();
  const results: { label: string; number: string }[] = [];

  for (let i = 0; i < 3; i++) {
    results.push({
      label: i === 0 ? 'เลขถัดไป' : `เลขถัดไป+${i}`,
      number: formatNumber(c, c.next_number + i, now),
    });
  }

  return results;
}

function buildResetSample(c: FormConfig): { label: string; number: string } | null {
  if (c.reset_cycle === 'NEVER') return null;

  const now = new Date();
  const resetDate = getNextResetDate(now, c.reset_cycle);
  const label = c.reset_cycle === 'YEARLY' ? 'หลัง reset (ปีถัดไป)' : 'หลัง reset (เดือนถัดไป)';

  return {
    label,
    number: formatNumber(c, 1, resetDate),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-number-series-edit-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatButtonToggleModule, MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg">
      ตั้งค่าเลขที่เอกสาร — {{ docTypeLabel }} ({{ data.series.document_type }})
    </h2>

    <mat-dialog-content class="!max-h-[70vh]">
      <form [formGroup]="form" class="space-y-5 pt-2">

        <!-- ══════════ Section: รูปแบบเลขที่ ══════════ -->
        <div>
          <h3 class="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1 mb-3">
            รูปแบบเลขที่
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">

            <!-- Prefix -->
            <mat-form-field appearance="outline" class="sm:col-span-2">
              <mat-label>Prefix</mat-label>
              <input matInput formControlName="prefix" maxlength="20">
              @if (form.get('prefix')?.hasError('required')) {
                <mat-error>กรุณากรอก Prefix</mat-error>
              }
              @if (form.get('prefix')?.hasError('maxlength')) {
                <mat-error>ไม่เกิน 20 ตัวอักษร</mat-error>
              }
            </mat-form-field>

            <!-- ตัวคั่น (หลัง prefix) -->
            <div class="sm:col-span-2">
              <label class="text-sm font-medium text-slate-600 mb-1 block">ตัวคั่น (หลัง prefix)</label>
              <mat-button-toggle-group formControlName="separator" class="!text-sm">
                <mat-button-toggle value="">ไม่มี</mat-button-toggle>
                <mat-button-toggle value="-">-</mat-button-toggle>
                <mat-button-toggle value="/">/</mat-button-toggle>
              </mat-button-toggle-group>
            </div>

            <!-- รูปแบบปี -->
            <mat-form-field appearance="outline">
              <mat-label>รูปแบบปี</mat-label>
              <mat-select formControlName="year_format">
                @for (opt of yearFormatOptions; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <!-- ตัวคั่น (หลังปี) -->
            <div>
              <label class="text-sm font-medium text-slate-600 mb-1 block">ตัวคั่น (หลังปี)</label>
              <mat-button-toggle-group formControlName="year_separator" class="!text-sm">
                <mat-button-toggle value="">ไม่มี</mat-button-toggle>
                <mat-button-toggle value="-">-</mat-button-toggle>
                <mat-button-toggle value="/">/</mat-button-toggle>
              </mat-button-toggle-group>
            </div>

            <!-- จำนวนหลักเลขลำดับ -->
            <mat-form-field appearance="outline">
              <mat-label>จำนวนหลักเลขลำดับ</mat-label>
              <mat-select formControlName="running_digits">
                <mat-option [value]="3">3 หลัก</mat-option>
                <mat-option [value]="4">4 หลัก</mat-option>
                <mat-option [value]="5">5 หลัก</mat-option>
                <mat-option [value]="6">6 หลัก</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- Reset เลขลำดับ -->
            <mat-form-field appearance="outline">
              <mat-label>Reset เลขลำดับ</mat-label>
              <mat-select formControlName="reset_cycle">
                @for (opt of resetCycleOptions; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

          </div>
        </div>

        <!-- ══════════ Section: Preview (real-time) ══════════ -->
        <div>
          <h3 class="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1 mb-3">
            Preview
          </h3>

          <div class="bg-slate-50 rounded-lg p-4 space-y-2 border border-slate-200">
            <div class="text-sm text-slate-500">
              รูปแบบ:
              <span class="font-mono font-semibold text-slate-700 ml-1">{{ patternDisplay() }}</span>
            </div>

            <div class="border-t border-slate-200 pt-2 space-y-1">
              <p class="text-xs text-slate-400 font-medium mb-1">ตัวอย่าง:</p>

              @for (sample of previewSamples(); track sample.label) {
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-slate-500 w-28 text-right">{{ sample.label }}:</span>
                  <span class="font-mono font-semibold text-blue-700">{{ sample.number }}</span>
                </div>
              }

              @if (resetSample()) {
                <div class="border-t border-dashed border-slate-300 my-1 pt-1"></div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-slate-500 w-28 text-right">{{ resetSample()!.label }}:</span>
                  <span class="font-mono font-semibold text-green-700">{{ resetSample()!.number }}</span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- ══════════ Section: ตั้งค่าเพิ่มเติม ══════════ -->
        <div>
          <h3 class="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1 mb-3">
            ตั้งค่าเพิ่มเติม
          </h3>

          <div class="space-y-3">

            <!-- ปรับเลขลำดับถัดไป -->
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>ปรับเลขลำดับถัดไป</mat-label>
              <input matInput type="number" formControlName="next_number" min="1">
              @if (form.get('next_number')?.hasError('required')) {
                <mat-error>กรุณากรอกเลขลำดับ</mat-error>
              }
              @if (form.get('next_number')?.hasError('min')) {
                <mat-error>ต้องมากกว่าหรือเท่ากับ 1</mat-error>
              }
              @if (form.get('next_number')?.hasError('max')) {
                <mat-error>เกินจำนวนสูงสุดที่ {{ maxNumber() }} ({{ currentDigits() }} หลัก)</mat-error>
              }
            </mat-form-field>

            @if (showDuplicateWarning()) {
              <div class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <span class="flex-shrink-0 mt-0.5">&#9888;&#65039;</span>
                <span>ระวัง: อาจทำให้เลขซ้ำ — เลขลำดับที่กำหนดน้อยกว่าเลขที่ออกไปแล้ว</span>
              </div>
            }

            <!-- เปิดใช้งาน -->
            <div class="flex items-center gap-3 pt-1">
              <mat-slide-toggle formControlName="is_active">เปิดใช้งาน</mat-slide-toggle>
            </div>

          </div>
        </div>

        <!-- Server error -->
        @if (serverError()) {
          <div class="text-red-600 text-sm bg-red-50 p-3 rounded">{{ serverError() }}</div>
        }

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="saving() || form.invalid" (click)="save()">
        @if (saving()) {
          <mat-spinner diameter="18" class="!inline-block mr-1" />
        }
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
})
export class NumberSeriesEditDialogComponent implements OnInit, OnDestroy {
  readonly data      = inject<NumberSeriesEditDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<NumberSeriesEditDialogComponent>);
  private api        = inject(NumberSeriesService);
  private fb         = inject(FormBuilder);
  private subs       = new Subscription();

  readonly yearFormatOptions  = YEAR_FORMAT_OPTIONS;
  readonly resetCycleOptions  = RESET_CYCLE_OPTIONS;

  saving      = signal(false);
  serverError = signal<string | null>(null);

  // จำนวน logs ที่ออกไปแล้ว (โหลดจาก API)
  logCount     = signal(0);
  maxLogNumber = signal(0);

  readonly docTypeLabel = DOCUMENT_TYPE_LABELS[this.data.series.document_type]
    ?? this.data.series.document_type;

  form = this.fb.group({
    prefix:         [this.data.series.prefix,         [Validators.required, Validators.maxLength(20)]],
    separator:      [this.data.series.separator],
    year_format:    [this.data.series.year_format,     [Validators.required]],
    year_separator: [this.data.series.year_separator],
    running_digits: [this.data.series.running_digits,  [Validators.required]],
    reset_cycle:    [this.data.series.reset_cycle,     [Validators.required]],
    next_number:    [this.data.series.next_number,     [Validators.required, Validators.min(1)]],
    is_active:      [!!Number(this.data.series.is_active)],
  });

  // ── Signal ที่เก็บค่าจาก form (bridge reactive form → signal) ──────────

  private formValues = signal<FormConfig>(this.extractFormConfig());

  // ── Computed signals (ทั้งหมด derive จาก formValues signal) ────────────

  readonly currentDigits = computed(() => this.formValues().running_digits);

  readonly maxNumber = computed(() => Math.pow(10, this.currentDigits()) - 1);

  readonly showDuplicateWarning = computed(() => {
    const nextNum = this.formValues().next_number;
    return this.maxLogNumber() > 0 && nextNum < this.maxLogNumber();
  });

  readonly patternDisplay = computed(() => buildPatternDisplay(this.formValues()));

  readonly previewSamples = computed(() => buildPreviewSamples(this.formValues()));

  readonly resetSample = computed(() => buildResetSample(this.formValues()));

  // ── Lifecycle ─────────────────────────────────────────────────────────

  ngOnInit(): void {
    // โหลด logs เพื่อใช้ตรวจ warning
    this.loadLogCount();

    // Bridge form valueChanges → signal เพื่อให้ computed ตอบสนองต่อการเปลี่ยน form
    this.subs.add(
      this.form.valueChanges.subscribe(() => {
        this.formValues.set(this.extractFormConfig());
      })
    );

    // Update max validator เมื่อ running_digits เปลี่ยน
    this.subs.add(
      this.form.get('running_digits')!.valueChanges.subscribe(digits => {
        if (digits) {
          const maxVal = Math.pow(10, digits) - 1;
          this.form.get('next_number')?.setValidators([
            Validators.required, Validators.min(1), Validators.max(maxVal),
          ]);
          this.form.get('next_number')?.updateValueAndValidity();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private extractFormConfig(): FormConfig {
    const v = this.form.getRawValue();
    return {
      prefix:         v.prefix ?? '',
      separator:      v.separator ?? '',
      year_format:    v.year_format ?? 'NONE',
      year_separator: v.year_separator ?? '',
      running_digits: v.running_digits ?? 4,
      reset_cycle:    v.reset_cycle ?? 'NEVER',
      next_number:    v.next_number ?? 1,
    };
  }

  private loadLogCount(): void {
    this.api.getLogs(this.data.series.id, 1, 1).subscribe({
      next: res => {
        this.logCount.set(res.total);
        // ประมาณเลขสูงสุดจาก next_number - 1 (เลขถูก generate ตามลำดับ)
        this.maxLogNumber.set(this.data.series.next_number - 1);
      },
      error: () => {
        // ถ้าโหลดไม่ได้ ใช้ค่า default
        this.logCount.set(0);
        this.maxLogNumber.set(0);
      },
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // ถ้า series มี logs → แสดง confirmation
    if (this.logCount() > 0) {
      const msg = `การเปลี่ยนรูปแบบจะมีผลกับเลขที่ออกใหม่เท่านั้น เลขที่ออกไปแล้ว ${this.logCount()} รายการจะไม่เปลี่ยน`;
      if (!confirm(msg)) return;
    }

    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.getRawValue();
    const payload = {
      prefix:         v.prefix as string,
      separator:      v.separator as string,
      year_format:    v.year_format as string,
      year_separator: v.year_separator as string,
      running_digits: v.running_digits as number,
      reset_cycle:    v.reset_cycle as string,
      next_number:    v.next_number as number,
      is_active:      v.is_active as boolean,
    };

    this.api.update(this.data.series.id, payload).subscribe({
      next: result => this.dialogRef.close(result),
      error: err => {
        this.serverError.set(err.error?.error ?? 'เกิดข้อผิดพลาดในการบันทึก');
        this.saving.set(false);
      },
    });
  }
}
