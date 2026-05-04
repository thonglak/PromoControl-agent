import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { UnitApiService, RecalculateDto, RecalculatePreviewSample } from '../unit-api.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

export interface PriceRecalculateDialogData {
  projectId: number;
  projectName?: string;
}

type Scope = 'zero_only' | 'all';
type RuleMode = 'percent' | 'fixed';
type AppraisalSource = 'base_price' | 'unit_cost';

@Component({
  selector: 'app-price-recalculate-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatRadioModule, MatCheckboxModule, MatProgressSpinnerModule,
    MatTooltipModule, SvgIconComponent,
  ],
  templateUrl: './price-recalculate-dialog.component.html',
})
export class PriceRecalculateDialogComponent {
  private readonly fb        = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<PriceRecalculateDialogComponent>);
  private readonly api       = inject(UnitApiService);
  private readonly snack     = inject(MatSnackBar);
  readonly data: PriceRecalculateDialogData = inject(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    cost_enabled:      new FormControl<boolean>(false, { nonNullable: true }),
    cost_mode:         new FormControl<RuleMode>('percent', { nonNullable: true }),
    cost_percent:      new FormControl<number>(70, { nonNullable: true, validators: [Validators.min(0.01), Validators.max(999.99)] }),
    cost_amount:       new FormControl<number>(0,  { nonNullable: true, validators: [Validators.min(0.01), Validators.max(999_999_999.99)] }),

    appraisal_enabled: new FormControl<boolean>(true, { nonNullable: true }),
    appraisal_mode:    new FormControl<RuleMode>('percent', { nonNullable: true }),
    appraisal_source:  new FormControl<AppraisalSource>('base_price', { nonNullable: true }),
    appraisal_percent: new FormControl<number>(85, { nonNullable: true, validators: [Validators.min(0.01), Validators.max(999.99)] }),
    appraisal_amount:  new FormControl<number>(0,  { nonNullable: true, validators: [Validators.min(0.01), Validators.max(999_999_999.99)] }),

    scope:             new FormControl<Scope>('zero_only', { nonNullable: true }),
  });

  loading        = signal(false);
  saving         = signal(false);
  previewCount   = signal<number | null>(null);
  previewSamples = signal<RecalculatePreviewSample[]>([]);
  showConfirm    = signal(false);

  get atLeastOneEnabled(): boolean {
    return this.form.value.cost_enabled === true || this.form.value.appraisal_enabled === true;
  }

  get formValid(): boolean {
    if (!this.atLeastOneEnabled) return false;
    const v = this.form.value;
    if (v.cost_enabled) {
      const ctrl = v.cost_mode === 'fixed' ? this.form.controls.cost_amount : this.form.controls.cost_percent;
      if (ctrl.invalid) return false;
    }
    if (v.appraisal_enabled) {
      const ctrl = v.appraisal_mode === 'fixed' ? this.form.controls.appraisal_amount : this.form.controls.appraisal_percent;
      if (ctrl.invalid) return false;
    }
    return true;
  }

  private buildDto(): RecalculateDto {
    const v = this.form.getRawValue();
    return {
      project_id: this.data.projectId,
      scope: v.scope,
      cost_rule: v.cost_mode === 'fixed'
        ? { enabled: v.cost_enabled, mode: 'fixed', amount: Number(v.cost_amount) }
        : { enabled: v.cost_enabled, mode: 'percent', percent: Number(v.cost_percent) },
      appraisal_rule: v.appraisal_mode === 'fixed'
        ? { enabled: v.appraisal_enabled, mode: 'fixed', amount: Number(v.appraisal_amount) }
        : { enabled: v.appraisal_enabled, mode: 'percent', percent: Number(v.appraisal_percent), source: v.appraisal_source },
    };
  }

  preview(): void {
    if (!this.formValid) return;
    this.loading.set(true);
    this.previewCount.set(null);
    this.previewSamples.set([]);
    this.api.previewRecalculate(this.buildDto()).subscribe({
      next: res => {
        this.loading.set(false);
        this.previewCount.set(res.count);
        this.previewSamples.set(res.samples);
        this.showConfirm.set(true);
      },
      error: err => {
        this.loading.set(false);
        this.snack.open(err?.error?.error ?? 'เกิดข้อผิดพลาด', 'ปิด', { duration: 4000 });
      },
    });
  }

  /** ถ้า user เปลี่ยนค่าใน form หลังจากดู preview แล้ว ให้บังคับ preview ใหม่ */
  resetPreview(): void {
    if (this.showConfirm()) {
      this.previewCount.set(null);
      this.previewSamples.set([]);
      this.showConfirm.set(false);
    }
  }

  formatMoney(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return v.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  costChanged(s: RecalculatePreviewSample): boolean {
    return s.new_cost !== null && Math.abs(s.new_cost - s.current_cost) > 0.001;
  }

  appraisalChanged(s: RecalculatePreviewSample): boolean {
    if (s.new_appraisal === null) return false;
    const cur = s.current_appraisal ?? 0;
    return Math.abs(s.new_appraisal - cur) > 0.001;
  }

  submit(): void {
    if (!this.formValid || !this.showConfirm() || this.saving()) return;
    this.saving.set(true);

    this.api.bulkRecalculate(this.buildDto()).subscribe({
      next: res => {
        this.saving.set(false);
        let msg = `อัปเดต ${res.updated} ยูนิต`;
        if (res.cost_changed > 0)      msg += ` · ต้นทุน ${res.cost_changed}`;
        if (res.appraisal_changed > 0) msg += ` · ราคาประเมิน ${res.appraisal_changed}`;
        this.snack.open(msg, 'ปิด', { duration: 5000 });
        this.dialogRef.close(true);
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err?.error?.error ?? 'เกิดข้อผิดพลาด', 'ปิด', { duration: 4000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
