import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { FeeFormulaApiService, FeeFormula, FeeRatePolicy } from '../../fee-formula-api.service';
import { CurrencyMaskDirective } from '../../../../shared/directives/currency-mask.directive';

/** แปลง Date หรือ Moment → YYYY-MM-DD string */
function toISODateStr(d: any): string {
  if (!d) return '';
  const y = typeof d.year === 'function' ? d.year() : d.getFullYear();
  const m = String((typeof d.month === 'function' ? d.month() : d.getMonth()) + 1).padStart(2, '0');
  const dd = String(typeof d.date === 'function' ? d.date() : d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export interface FeeRatePolicyFormDialogData {
  mode: 'create' | 'edit';
  formulaId: number;
  formula?: FeeFormula | null;
  policy?: FeeRatePolicy;
}

@Component({
  selector: 'app-fee-rate-policy-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatCheckboxModule, MatSlideToggleModule,
    MatDatepickerModule,
    MatProgressSpinnerModule, CurrencyMaskDirective,
  ],
  templateUrl: './fee-rate-policy-form-dialog.component.html',
})
export class FeeRatePolicyFormDialogComponent implements OnInit {
  data      = inject<FeeRatePolicyFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<FeeRatePolicyFormDialogComponent>);
  private api = inject(FeeFormulaApiService);
  private fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);

  private policy = this.data.policy;
  private cond   = this.policy?.conditions ?? {};

  form = this.fb.group({
    policy_name:            [this.policy?.policy_name ?? '', Validators.required],
    override_rate_pct:      [this.policy ? this.policy.override_rate * 100 : (this.data.formula ? this.data.formula.default_rate * 100 : 0), [Validators.required, Validators.min(0)]],
    override_buyer_share_pct: [this.policy?.override_buyer_share != null ? this.policy.override_buyer_share * 100 : null as number | null, [Validators.min(0), Validators.max(100)]],
    priority:               [this.policy?.priority ?? 0, Validators.required],
    effective_from:         [this.policy?.effective_from ? new Date(this.policy.effective_from) : null as Date | null, Validators.required],
    effective_to:           [this.policy?.effective_to ? new Date(this.policy.effective_to) : null as Date | null, Validators.required],
    is_active:              [this.policy?.is_active ?? true],
    // Conditions builder
    has_max_price:          [!!this.cond.max_base_price],
    max_base_price:         [this.cond.max_base_price ?? null as number | null],
    has_project_types:      [!!(this.cond.project_types && this.cond.project_types.length > 0)],
    project_types:          [this.cond.project_types ?? [] as string[]],
  });

  projectTypeOptions = [
    { value: 'condo', label: 'คอนโด' },
    { value: 'house', label: 'บ้านเดี่ยว' },
    { value: 'townhouse', label: 'ทาวน์เฮาส์' },
    { value: 'mixed', label: 'ผสม' },
  ];

  ngOnInit(): void {}

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;

    // Build conditions
    const conditions: any = {};
    if (v.has_max_price && v.max_base_price) {
      conditions.max_base_price = v.max_base_price;
    }
    if (v.has_project_types && v.project_types && v.project_types.length > 0) {
      conditions.project_types = v.project_types;
    }

    const payload: any = {
      fee_formula_id:       this.data.formulaId,
      policy_name:          v.policy_name,
      override_rate:        (v.override_rate_pct ?? 0) / 100,
      override_buyer_share: v.override_buyer_share_pct != null ? (v.override_buyer_share_pct) / 100 : null,
      conditions:           Object.keys(conditions).length > 0 ? conditions : null,
      effective_from:       v.effective_from ? this.toDateStr(v.effective_from) : null,
      effective_to:         v.effective_to ? this.toDateStr(v.effective_to) : null,
      is_active:            v.is_active ?? true,
      priority:             v.priority ?? 0,
    };

    const obs = this.data.mode === 'create'
      ? this.api.createPolicy(payload)
      : this.api.updatePolicy(this.policy!.id, payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        this.serverError.set(err.error?.error ?? 'เกิดข้อผิดพลาด');
        this.saving.set(false);
      },
    });
  }

  private toDateStr(d: any): string {
    return toISODateStr(d);
  }
}
