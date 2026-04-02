import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { signal } from '@angular/core';

import { BudgetService } from '../../budget/services/budget.service';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';

export interface InlineBudgetDialogData {
  unitId: number;
  projectId: number;
  budgetSourceType: string;
  budgetSourceLabel: string;
  poolRemaining?: number;
}

const SOURCE_LABELS: Record<string, string> = {
  PROJECT_POOL: 'งบส่วนกลาง',
  MANAGEMENT_SPECIAL: 'งบผู้บริหาร',
};

@Component({
  selector: 'app-inline-budget-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatProgressSpinnerModule, CurrencyMaskDirective,
  ],
  template: `
    <h2 mat-dialog-title>ตั้งงบเพิ่มเติม</h2>
    <mat-dialog-content class="min-w-[320px]">
      <div class="flex flex-col gap-4 py-2">
        <!-- แหล่งงบ -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>แหล่งงบ</mat-label>
          <input matInput [value]="data.budgetSourceLabel" readonly>
        </mat-form-field>

        @if (data.budgetSourceType === 'PROJECT_POOL' && data.poolRemaining != null) {
          <div class="text-sm text-slate-500">
            งบส่วนกลางคงเหลือ: <strong class="text-sky-600">฿{{ data.poolRemaining | number:'1.0-0' }}</strong>
          </div>
        }

        <!-- จำนวนเงิน -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>จำนวนเงิน</mat-label>
          <input matInput currencyMask [formControl]="amountControl" placeholder="0">
          <span matTextPrefix>฿&nbsp;</span>
          @if (amountControl.hasError('required')) {
            <mat-error>กรุณากรอกจำนวนเงิน</mat-error>
          }
          @if (amountControl.hasError('min')) {
            <mat-error>จำนวนเงินต้องมากกว่า 0</mat-error>
          }
          @if (amountControl.hasError('max')) {
            <mat-error>จำนวนเงินเกินงบส่วนกลางคงเหลือ</mat-error>
          }
        </mat-form-field>

        <!-- หมายเหตุ -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>หมายเหตุ</mat-label>
          <input matInput [formControl]="noteControl" placeholder="เช่น อนุมัติโดยคุณสมชาย">
        </mat-form-field>

        @if (errorMsg()) {
          <div class="text-sm text-red-600">{{ errorMsg() }}</div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="saving()">
        @if (saving()) {
          <mat-spinner diameter="20" class="inline-block mr-2"></mat-spinner>
        }
        ยืนยัน
      </button>
    </mat-dialog-actions>
  `,
})
export class InlineBudgetDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<InlineBudgetDialogComponent>);
  private budgetSvc = inject(BudgetService);
  readonly data: InlineBudgetDialogData = inject(MAT_DIALOG_DATA);

  saving = signal(false);
  errorMsg = signal('');

  amountControl = this.fb.control<number | null>(null, [
    Validators.required,
    Validators.min(1),
    ...(this.data.budgetSourceType === 'PROJECT_POOL' && this.data.poolRemaining != null
      ? [Validators.max(this.data.poolRemaining)]
      : []),
  ]);

  noteControl = this.fb.control('');

  submit(): void {
    this.amountControl.markAsTouched();
    if (this.amountControl.invalid) return;

    this.saving.set(true);
    this.errorMsg.set('');

    this.budgetSvc.createAllocation({
      unit_id: this.data.unitId,
      project_id: this.data.projectId,
      budget_source_type: this.data.budgetSourceType,
      allocated_amount: this.amountControl.value,
      note: this.noteControl.value || '',
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.dialogRef.close(res);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(err?.error?.error || 'เกิดข้อผิดพลาดในการตั้งงบ');
      },
    });
  }
}
