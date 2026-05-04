import { Component, OnInit, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { debounceTime } from 'rxjs/operators';

import { FeeFormulaApiService, FeeFormula } from '../../fee-formula-api.service';
import { PromotionItemApiService, PromotionItem } from '../../../master-data/promotion-items/promotion-item-api.service';
import { ProjectService } from '../../../../core/services/project.service';

export interface FeeFormulaFormDialogData {
  mode: 'create' | 'edit';
  formula?: FeeFormula;
}

interface FormulaTemplate {
  label: string;
  expression: string;
  hint?: string;
}

interface OperatorChip {
  label: string;
  insert: string;
  cursorBack?: number;
}

@Component({
  selector: 'app-fee-formula-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatProgressSpinnerModule, MatTooltipModule, MatExpansionModule,
  ],
  templateUrl: './fee-formula-form-dialog.component.html',
})
export class FeeFormulaFormDialogComponent implements OnInit {
  data      = inject<FeeFormulaFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<FeeFormulaFormDialogComponent>);
  private api     = inject(FeeFormulaApiService);
  private itemApi = inject(PromotionItemApiService);
  private project  = inject(ProjectService);
  get projectId(): number { return Number(this.project.selectedProject()?.id ?? 0); }
  private fb      = inject(FormBuilder);

  @ViewChild('exprInput') exprInput?: ElementRef<HTMLTextAreaElement>;

  saving         = signal(false);
  serverError    = signal<string | null>(null);
  availableItems = signal<PromotionItem[]>([]);
  variables      = signal<{ name: string; label: string; scope: string; unit: string }[]>([]);
  exprValidation = signal<{ valid: boolean; error?: string; used_variables?: string[] } | null>(null);

  /** ตัวอย่างสูตรสำเร็จรูป — คลิกเพื่อแทนค่าใน textarea */
  readonly templates: FormulaTemplate[] = [
    { label: 'ค่าโอนกรรมสิทธิ์ 2%', expression: 'contract_price * 0.02', hint: '2% ของราคาหน้าสัญญา' },
    { label: 'ค่าจดจำนอง 1%',       expression: 'contract_price * 0.01', hint: '1% ของราคาหน้าสัญญา' },
    { label: 'ค่าโอน + ค่ามิเตอร์',   expression: 'contract_price * 0.02 + electric_meter_fee + water_meter_fee', hint: '2% + ค่าติดตั้งมิเตอร์' },
    { label: 'ค่าส่วนกลาง 1 ปี',     expression: 'common_fee_rate * area_sqm * 12', hint: 'อัตรา × พื้นที่ × 12 เดือน' },
    { label: 'ภาษีธุรกิจเฉพาะ 3.3%', expression: 'contract_price * 0.033', hint: '3.3% ของราคาหน้าสัญญา' },
    { label: 'ใช้ราคาที่สูงกว่า 1%', expression: 'max(appraisal_price, contract_price) * 0.01', hint: 'ราคาสูงกว่าระหว่างประเมิน/สัญญา' },
    { label: 'ค่าโอนครึ่งเดียว 1%',  expression: 'contract_price * 0.02 * 0.5', hint: 'ผู้ขายช่วยจ่ายครึ่งของ 2%' },
  ];

  /** ตัวดำเนินการให้คลิกแทรก */
  readonly operators: OperatorChip[] = [
    { label: '+', insert: ' + ' },
    { label: '−', insert: ' - ' },
    { label: '×', insert: ' * ' },
    { label: '÷', insert: ' / ' },
    { label: '( )', insert: '()', cursorBack: 1 },
    { label: 'max( )', insert: 'max(, )', cursorBack: 3 },
    { label: 'min( )', insert: 'min(, )', cursorBack: 3 },
    { label: 'round( )', insert: 'round(, 2)', cursorBack: 4 },
  ];

  private formula = this.data.formula;

  form = this.fb.group({
    promotion_item_id:   [this.formula?.promotion_item_id ?? null as number | null, Validators.required],
    formula_expression:  [this.buildInitialExpression(), Validators.required],
    description:         [this.formula?.description ?? ''],
  });

  /** edit mode: ถ้าสูตรเดิมเป็น legacy mode → แปลงเป็น expression อัตโนมัติเป็นจุดเริ่มต้น */
  private buildInitialExpression(): string {
    if (!this.formula) return '';
    if (this.formula.formula_expression) return this.formula.formula_expression;
    if (this.formula.base_field === 'expression') return '';

    // แปลง legacy → expression
    const baseVar = this.formula.base_field === 'manual_input'
      ? this.formula.manual_input_label || 'base_price'
      : this.formula.base_field;
    const rate = this.formula.default_rate;
    const share = this.formula.buyer_share;

    if (this.formula.base_field === 'manual_input') {
      // manual_input ใน expression mode ทำได้ยาก — ใช้ base_price แทนพร้อม comment
      return `base_price * ${rate} * ${share}`;
    }
    return `${baseVar} * ${rate} * ${share}`;
  }

  /** flag ว่าเดิมเป็น legacy mode ที่ต้อง migrate */
  readonly isLegacyEdit = computed(() =>
    this.data.mode === 'edit' &&
    this.formula != null &&
    this.formula.base_field !== 'expression'
  );

  /** Group variables by scope */
  readonly groupedVariables = computed(() => {
    const grouped: Record<string, { name: string; label: string; scope: string; unit: string }[]> = {};
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
    this.itemApi.getList(this.projectId, { value_mode: 'calculated' }).subscribe({
      next: items => {
        if (this.data.mode === 'edit' && this.formula) {
          const editing = items.find(i => i.id === this.formula!.promotion_item_id);
          if (!editing) {
            items = [{ id: this.formula.promotion_item_id, code: this.formula.promotion_item_code, name: this.formula.promotion_item_name } as PromotionItem, ...items];
          }
          this.availableItems.set(items);
        } else {
          this.availableItems.set(items.filter(i => !i.has_fee_formula));
        }
      },
    });

    if (this.data.mode === 'edit') {
      this.form.get('promotion_item_id')!.disable();
      // edit mode: validate สูตรเริ่มต้นด้วย
      const initExpr = this.form.get('formula_expression')!.value;
      if (initExpr) {
        this.api.validateExpression(initExpr).subscribe(r => this.exprValidation.set(r));
      }
    }

    this.api.getVariables().subscribe(vars => this.variables.set(vars));

    this.form.get('formula_expression')!.valueChanges
      .pipe(debounceTime(400))
      .subscribe(expr => {
        if (expr && expr.trim() !== '') {
          this.api.validateExpression(expr).subscribe(r => this.exprValidation.set(r));
        } else {
          this.exprValidation.set(null);
        }
      });
  }

  /** แทรกข้อความที่ตำแหน่ง cursor (ใช้ทั้งกับตัวแปร, operator, template) */
  private insertAtCursor(text: string, cursorBack: number = 0): void {
    const ctrl = this.form.get('formula_expression')!;
    const current = (ctrl.value ?? '') as string;
    const ta = this.exprInput?.nativeElement;
    const start = ta?.selectionStart ?? current.length;
    const end = ta?.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const newValue = before + text + after;
    ctrl.setValue(newValue);
    setTimeout(() => {
      const newPos = before.length + text.length - cursorBack;
      ta?.focus();
      ta?.setSelectionRange(newPos, newPos);
    });
  }

  insertVariable(varName: string): void {
    const ctrl = this.form.get('formula_expression')!;
    const current = (ctrl.value ?? '') as string;
    const ta = this.exprInput?.nativeElement;
    const start = ta?.selectionStart ?? current.length;
    const before = current.slice(0, start);
    const needsSpaceBefore = before.length > 0 && !/\s|\(/.test(before.slice(-1));
    const text = (needsSpaceBefore ? ' ' : '') + varName + ' ';
    this.insertAtCursor(text);
  }

  insertOperator(op: OperatorChip): void {
    this.insertAtCursor(op.insert, op.cursorBack ?? 0);
  }

  applyTemplate(tpl: FormulaTemplate): void {
    this.form.get('formula_expression')!.setValue(tpl.expression);
    setTimeout(() => this.exprInput?.nativeElement.focus());
  }

  clearExpression(): void {
    this.form.get('formula_expression')!.setValue('');
    setTimeout(() => this.exprInput?.nativeElement.focus());
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const expr = (this.form.get('formula_expression')!.value ?? '').toString().trim();
    if (expr === '') {
      this.serverError.set('กรุณากรอกสูตร');
      return;
    }
    if (this.exprValidation() && !this.exprValidation()!.valid) {
      this.serverError.set('สูตรไม่ถูกต้อง: ' + (this.exprValidation()!.error ?? ''));
      return;
    }

    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.getRawValue();
    const payload: any = {
      promotion_item_id:   v.promotion_item_id,
      base_field:          'expression',
      formula_expression:  expr,
      default_rate:        0,
      buyer_share:         1,
      description:         v.description || null,
    };

    const obs = this.data.mode === 'create'
      ? this.api.createFormula(payload)
      : this.api.updateFormula(this.formula!.id, payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        this.serverError.set(err.error?.error ?? 'เกิดข้อผิดพลาด');
        this.saving.set(false);
      },
    });
  }
}
