import { Component, OnInit, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { debounceTime } from 'rxjs/operators';

import { FeeFormulaApiService, FeeFormula, FeeRatePolicy } from '../../fee-formula-api.service';

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

interface OverrideTemplate {
  label: string;
  expression: string;
  hint: string;
  useCase: string;
}

interface ConditionTemplate {
  label: string;
  expression: string;
  hint: string;
  useCase: string;
}

@Component({
  selector: 'app-fee-rate-policy-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatSlideToggleModule,
    MatDatepickerModule, MatProgressSpinnerModule,
    MatTooltipModule, MatExpansionModule,
  ],
  templateUrl: './fee-rate-policy-form-dialog.component.html',
})
export class FeeRatePolicyFormDialogComponent implements OnInit {
  data      = inject<FeeRatePolicyFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<FeeRatePolicyFormDialogComponent>);
  private api = inject(FeeFormulaApiService);
  private fb  = inject(FormBuilder);

  @ViewChild('overrideInput') overrideInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('conditionInput') conditionInput?: ElementRef<HTMLTextAreaElement>;

  saving      = signal(false);
  serverError = signal<string | null>(null);
  variables   = signal<{ name: string; label: string; scope: string; unit: string; type?: string }[]>([]);

  overrideValidation  = signal<{ valid: boolean; error?: string; used_variables?: string[] } | null>(null);
  conditionValidation = signal<{ valid: boolean; error?: string; used_variables?: string[] } | null>(null);

  /** Use case จริงสำหรับ override expression (สูตรที่ใช้แทนเมื่อเงื่อนไขตรง) */
  readonly overrideTemplates: OverrideTemplate[] = [
    {
      label: 'ลด 25% ของอัตราเดิม',
      expression: 'contract_price * 0.015',
      hint: 'ปกติ 2% → ลดเหลือ 1.5%',
      useCase: 'ลูกค้า premium / ส่วนลดพิเศษ',
    },
    {
      label: 'ฟรี (ไม่คิดค่า)',
      expression: '0',
      hint: 'ค่า = 0 บาท',
      useCase: 'โปรโมชั่น "ฟรีค่าโอน"',
    },
    {
      label: 'ผู้ขายช่วยจ่ายครึ่ง',
      expression: 'contract_price * 0.02 * 0.5',
      hint: '2% × 50%',
      useCase: 'สัญญาระบุผู้ขายช่วย 50%',
    },
    {
      label: 'อัตราพิเศษ premium 1.2%',
      expression: 'contract_price * 0.012',
      hint: '1.2% ของราคาสัญญา',
      useCase: 'ราคาสูง / ลูกค้า VIP',
    },
    {
      label: 'จำกัดเพดาน 50,000',
      expression: 'min(contract_price * 0.02, 50000)',
      hint: '2% แต่ไม่เกิน 50,000',
      useCase: 'มียอดสูงสุดที่จะคืนได้',
    },
  ];

  /** Use case จริงสำหรับ boolean condition */
  readonly conditionTemplates: ConditionTemplate[] = [
    {
      label: 'ราคาเกิน 5 ล้าน',
      expression: 'contract_price > 5000000',
      hint: 'contract_price > 5,000,000',
      useCase: 'ลูกค้า premium',
    },
    {
      label: 'ราคา 5-10 ล้าน',
      expression: 'contract_price >= 5000000 and contract_price <= 10000000',
      hint: 'ระหว่าง 5-10 ล้าน',
      useCase: 'ลูกค้ากลุ่มกลาง',
    },
    {
      label: 'คอนโดเท่านั้น',
      expression: 'project_type == "condo"',
      hint: 'project_type เท่ากับ "condo"',
      useCase: 'แยกตามประเภทโครงการ',
    },
    {
      label: 'บ้านเดี่ยวขนาดใหญ่',
      expression: 'project_type == "house" and area_sqm > 200',
      hint: 'บ้าน + พื้นที่ > 200 ตร.ม.',
      useCase: 'บ้านหรู',
    },
    {
      label: 'ที่ดิน > 100 ตร.ว.',
      expression: 'land_area_sqw > 100',
      hint: 'ขนาดที่ดิน > 100 ตร.ว.',
      useCase: 'แปลงใหญ่',
    },
    {
      label: 'ราคาประเมินสูงกว่าสัญญา',
      expression: 'appraisal_price > contract_price',
      hint: 'ราคาประเมิน > ราคาหน้าสัญญา',
      useCase: 'กรณีราคาประเมินสูงกว่า',
    },
  ];

  /** ตัวดำเนินการสำหรับ override (ตัวเลข) */
  readonly numericOps = [
    { label: '+', insert: ' + ' },
    { label: '−', insert: ' - ' },
    { label: '×', insert: ' * ' },
    { label: '÷', insert: ' / ' },
    { label: '( )', insert: '()', cursorBack: 1 },
    { label: 'min( )', insert: 'min(, )', cursorBack: 3 },
    { label: 'max( )', insert: 'max(, )', cursorBack: 3 },
  ];

  /** ตัวดำเนินการสำหรับ condition (เปรียบเทียบ + ตรรกะ) */
  readonly booleanOps = [
    { label: '>', insert: ' > ' },
    { label: '<', insert: ' < ' },
    { label: '≥', insert: ' >= ' },
    { label: '≤', insert: ' <= ' },
    { label: '=', insert: ' == ' },
    { label: '≠', insert: ' != ' },
    { label: 'and', insert: ' and ' },
    { label: 'or', insert: ' or ' },
    { label: 'not', insert: 'not ' },
    { label: '( )', insert: '()', cursorBack: 1 },
    { label: '"..."', insert: '""', cursorBack: 1 },
  ];

  private policy = this.data.policy;
  private cond   = this.policy?.conditions ?? {};

  form = this.fb.group({
    policy_name:           [this.policy?.policy_name ?? '', Validators.required],
    note:                  [this.policy?.note ?? ''],
    override_expression:   [this.policy?.override_expression ?? this.buildLegacyOverride(), Validators.required],
    condition_expression:  [this.policy?.condition_expression ?? this.buildLegacyCondition()],
    priority:              [this.policy?.priority ?? 0, Validators.required],
    effective_from:        [this.policy?.effective_from ? new Date(this.policy.effective_from) : null as Date | null, Validators.required],
    effective_to:          [this.policy?.effective_to ? new Date(this.policy.effective_to) : null as Date | null, Validators.required],
    is_active:             [this.policy ? !!Number(this.policy.is_active) : true],
  });

  /** edit mode + legacy (ไม่มี override_expression) → แปลง rate × share เป็นจุดเริ่มต้น */
  private buildLegacyOverride(): string {
    if (!this.policy || this.policy.override_expression) return '';
    const rate = this.policy.override_rate;
    const share = this.policy.override_buyer_share ?? 1;
    if (rate === 0) return '';
    return share !== 1
      ? `contract_price * ${rate} * ${share}`
      : `contract_price * ${rate}`;
  }

  /** edit mode + legacy → แปลง JSON conditions เป็น boolean expression */
  private buildLegacyCondition(): string {
    if (!this.policy || this.policy.condition_expression) return '';
    if (!this.cond || (typeof this.cond === 'object' && Object.keys(this.cond).length === 0)) return '';

    const parts: string[] = [];
    if (this.cond.max_base_price) {
      parts.push(`base_price <= ${this.cond.max_base_price}`);
    }
    if (this.cond.project_types && Array.isArray(this.cond.project_types) && this.cond.project_types.length > 0) {
      const types = this.cond.project_types.map((t: string) => `project_type == "${t}"`).join(' or ');
      parts.push(this.cond.project_types.length > 1 ? `(${types})` : types);
    }
    return parts.join(' and ');
  }

  readonly isLegacyEdit = computed(() =>
    this.data.mode === 'edit' &&
    this.policy != null &&
    !this.policy.override_expression &&
    !this.policy.condition_expression
  );

  readonly groupedVariables = computed(() => {
    const grouped: Record<string, any[]> = {};
    for (const v of this.variables()) {
      grouped[v.scope] = grouped[v.scope] ?? [];
      grouped[v.scope].push(v);
    }
    return grouped;
  });

  scopeLabel(scope: string): string {
    return scope === 'project' ? 'ระดับโครงการ'
         : scope === 'unit' ? 'ระดับยูนิต'
         : scope === 'transaction' ? 'ระดับการขาย'
         : scope;
  }

  ngOnInit(): void {
    this.api.getVariables().subscribe(vars => this.variables.set(vars));

    // Validate override (numeric)
    this.form.get('override_expression')!.valueChanges
      .pipe(debounceTime(400))
      .subscribe(expr => {
        if (expr && expr.trim() !== '') {
          this.api.validateExpression(expr).subscribe(r => this.overrideValidation.set(r));
        } else {
          this.overrideValidation.set(null);
        }
      });

    // Validate condition (boolean)
    this.form.get('condition_expression')!.valueChanges
      .pipe(debounceTime(400))
      .subscribe(expr => {
        if (expr && expr.trim() !== '') {
          this.api.validateBooleanExpression(expr).subscribe(r => this.conditionValidation.set(r));
        } else {
          this.conditionValidation.set(null);
        }
      });

    // Validate ค่าเริ่มต้นถ้ามี (edit mode)
    const initOverride = this.form.get('override_expression')!.value;
    if (initOverride) this.api.validateExpression(initOverride).subscribe(r => this.overrideValidation.set(r));
    const initCond = this.form.get('condition_expression')!.value;
    if (initCond) this.api.validateBooleanExpression(initCond).subscribe(r => this.conditionValidation.set(r));
  }

  /** generic insert ที่ตำแหน่ง cursor ของ textarea */
  private insertInto(target: 'override' | 'condition', text: string, cursorBack = 0): void {
    const ctrlName = target === 'override' ? 'override_expression' : 'condition_expression';
    const ctrl = this.form.get(ctrlName)!;
    const ta = target === 'override' ? this.overrideInput?.nativeElement : this.conditionInput?.nativeElement;
    const current = (ctrl.value ?? '') as string;
    const start = ta?.selectionStart ?? current.length;
    const end = ta?.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    ctrl.setValue(before + text + after);
    setTimeout(() => {
      const newPos = before.length + text.length - cursorBack;
      ta?.focus();
      ta?.setSelectionRange(newPos, newPos);
    });
  }

  insertVariable(target: 'override' | 'condition', varName: string): void {
    const ctrlName = target === 'override' ? 'override_expression' : 'condition_expression';
    const ctrl = this.form.get(ctrlName)!;
    const current = (ctrl.value ?? '') as string;
    const ta = target === 'override' ? this.overrideInput?.nativeElement : this.conditionInput?.nativeElement;
    const start = ta?.selectionStart ?? current.length;
    const before = current.slice(0, start);
    const needsSpaceBefore = before.length > 0 && !/\s|\(/.test(before.slice(-1));
    const text = (needsSpaceBefore ? ' ' : '') + varName + ' ';
    this.insertInto(target, text);
  }

  insertOp(target: 'override' | 'condition', op: { insert: string; cursorBack?: number }): void {
    this.insertInto(target, op.insert, op.cursorBack ?? 0);
  }

  applyOverrideTemplate(tpl: OverrideTemplate): void {
    this.form.get('override_expression')!.setValue(tpl.expression);
    setTimeout(() => this.overrideInput?.nativeElement.focus());
  }

  applyConditionTemplate(tpl: ConditionTemplate): void {
    this.form.get('condition_expression')!.setValue(tpl.expression);
    setTimeout(() => this.conditionInput?.nativeElement.focus());
  }

  clearCondition(): void {
    this.form.get('condition_expression')!.setValue('');
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const overrideExpr = (this.form.get('override_expression')!.value ?? '').toString().trim();
    if (overrideExpr === '') {
      this.serverError.set('กรุณากรอกสูตร override');
      return;
    }
    if (this.overrideValidation() && !this.overrideValidation()!.valid) {
      this.serverError.set('สูตร override ไม่ถูกต้อง: ' + (this.overrideValidation()!.error ?? ''));
      return;
    }
    const condExpr = (this.form.get('condition_expression')!.value ?? '').toString().trim();
    if (condExpr !== '' && this.conditionValidation() && !this.conditionValidation()!.valid) {
      this.serverError.set('เงื่อนไขไม่ถูกต้อง: ' + (this.conditionValidation()!.error ?? ''));
      return;
    }

    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;
    const noteVal = (v.note ?? '').toString().trim();
    const payload: any = {
      fee_formula_id:        this.data.formulaId,
      policy_name:           v.policy_name,
      note:                  noteVal !== '' ? noteVal : null,
      override_expression:   overrideExpr,
      condition_expression:  condExpr || null,
      override_rate:         0,    // legacy fields — ไม่ใช้แล้วในโหมด expression
      override_buyer_share:  null,
      conditions:            null,
      effective_from:        v.effective_from ? toISODateStr(v.effective_from) : null,
      effective_to:          v.effective_to ? toISODateStr(v.effective_to) : null,
      is_active:             v.is_active ?? true,
      priority:              v.priority ?? 0,
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
}
