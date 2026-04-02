import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CurrencyMaskDirective } from '../../../../shared/directives/currency-mask.directive';
import { FeeFormulaApiService, FeeFormula } from '../../fee-formula-api.service';
import { PromotionItemApiService, PromotionItem } from '../../../master-data/promotion-items/promotion-item-api.service';
import { ProjectService } from '../../../../core/services/project.service';

export interface FeeFormulaFormDialogData {
  mode: 'create' | 'edit';
  formula?: FeeFormula;
}

@Component({
  selector: 'app-fee-formula-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatProgressSpinnerModule, CurrencyMaskDirective,
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

  saving        = signal(false);
  serverError   = signal<string | null>(null);
  availableItems = signal<PromotionItem[]>([]);

  private formula = this.data.formula;

  form = this.fb.group({
    promotion_item_id:  [this.formula?.promotion_item_id ?? null as number | null, Validators.required],
    base_field:         [this.formula?.base_field ?? 'base_price' as string, Validators.required],
    manual_input_label: [this.formula?.manual_input_label ?? ''],
    default_rate_pct:   [this.formula ? this.formula.default_rate * 100 : 0, [Validators.required, Validators.min(0)]],
    buyer_share_pct:    [this.formula ? this.formula.buyer_share * 100 : 50, [Validators.required, Validators.min(0), Validators.max(100)]],
    description:        [this.formula?.description ?? ''],
  });

  ngOnInit(): void {
    // โหลดรายการ calculated ที่ยังไม่มีสูตร
    this.itemApi.getList(this.projectId, { value_mode: 'calculated' }).subscribe({
      next: items => {
        if (this.data.mode === 'edit' && this.formula) {
          // เพิ่มตัวที่กำลังแก้ไขเข้าไปด้วย
          const editing = items.find(i => i.id === this.formula!.promotion_item_id);
          if (!editing) {
            items = [{ id: this.formula.promotion_item_id, code: this.formula.promotion_item_code, name: this.formula.promotion_item_name } as PromotionItem, ...items];
          }
          this.availableItems.set(items);
        } else {
          // Create mode: แสดงเฉพาะที่ยังไม่มีสูตร
          this.availableItems.set(items.filter(i => !i.has_fee_formula));
        }
      },
    });

    if (this.data.mode === 'edit') {
      this.form.get('promotion_item_id')!.disable();
    }
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.getRawValue();
    const payload: any = {
      promotion_item_id:  v.promotion_item_id,
      base_field:         v.base_field,
      manual_input_label: v.base_field === 'manual_input' ? v.manual_input_label : null,
      default_rate:       (v.default_rate_pct ?? 0) / 100,
      buyer_share:        (v.buyer_share_pct ?? 0) / 100,
      description:        v.description || null,
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
