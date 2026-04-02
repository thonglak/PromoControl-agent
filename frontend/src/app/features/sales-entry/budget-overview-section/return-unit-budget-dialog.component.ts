import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { BudgetService } from '../../budget/services/budget.service';

export interface ReturnUnitBudgetDialogData {
  unitId: number;
  unitCode: string;
  projectId: number;
  budgetUnitRemaining: number;
}

@Component({
  selector: 'app-return-unit-budget-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSnackBarModule, MatProgressSpinnerModule, CurrencyMaskDirective,
  ],
  template: `
    <h2 mat-dialog-title>คืนงบยูนิตเข้า Pool</h2>
    <mat-dialog-content>
      <div class="py-2 space-y-4 text-sm">
        <div class="bg-slate-50 rounded-lg p-3 space-y-1">
          <div class="flex justify-between">
            <span class="text-slate-500">ยูนิต:</span>
            <span class="font-medium">{{ data.unitCode }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">งบยูนิตเหลือ:</span>
            <span class="font-medium text-sky-600 tabular-nums">{{ data.budgetUnitRemaining | number:'1.0-0' }} บาท</span>
          </div>
        </div>

        <form [formGroup]="form" class="space-y-3">
          <mat-form-field class="w-full">
            <mat-label>จำนวนเงินที่ต้องการคืน</mat-label>
            <input matInput currencyMask formControlName="amount">
            @if (form.get('amount')?.hasError('required')) {
              <mat-error>กรุณาระบุจำนวนเงิน</mat-error>
            }
            @if (form.get('amount')?.hasError('min')) {
              <mat-error>จำนวนต้องมากกว่า 0</mat-error>
            }
            @if (form.get('amount')?.hasError('max')) {
              <mat-error>จำนวนเกินงบเหลือ ({{ data.budgetUnitRemaining | number:'1.0-0' }})</mat-error>
            }
          </mat-form-field>

          <mat-form-field class="w-full">
            <mat-label>หมายเหตุ</mat-label>
            <textarea matInput formControlName="remark" rows="2"></textarea>
          </mat-form-field>
        </form>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false" [disabled]="saving">ยกเลิก</button>
      <button mat-flat-button color="primary"
        [disabled]="form.invalid || saving"
        (click)="onConfirm()">
        @if (saving) {
          <mat-spinner diameter="18" class="inline-block mr-1"></mat-spinner>
        }
        ยืนยันคืนงบ
      </button>
    </mat-dialog-actions>
  `,
})
export class ReturnUnitBudgetDialogComponent {
  readonly data: ReturnUnitBudgetDialogData = inject(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<ReturnUnitBudgetDialogComponent>);
  private budgetSvc = inject(BudgetService);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  saving = false;

  form = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(1), Validators.max(this.data.budgetUnitRemaining)]],
    remark: [''],
  });

  onConfirm(): void {
    if (this.form.invalid) return;

    this.saving = true;
    this.budgetSvc.returnUnitBudgetToPool({
      project_id: this.data.projectId,
      unit_id: this.data.unitId,
      amount: this.form.value.amount!,
      remark: this.form.value.remark || '',
    }).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.snack.open(err?.error?.error || 'เกิดข้อผิดพลาด', 'ปิด', { duration: 5000 });
      },
    });
  }
}
