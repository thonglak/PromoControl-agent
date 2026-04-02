import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { BudgetService } from '../services/budget.service';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';

export interface ReturnSpecialBudgetDialogData {
  project_id: number;
  unit_id: number;
  unit_code: string;
  budget_source_type: string;
  budget_source_label: string;
  allocated: number;
  used: number;
  remaining: number;
  approval_required?: boolean;
}

@Component({
  selector: 'app-return-special-budget-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule, CurrencyMaskDirective, MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">คืนงบพิเศษ</h2>

    <mat-dialog-content class="!max-h-[75vh]">
      <div class="flex flex-col gap-4 py-2 min-w-[360px]">

        <!-- ข้อมูลยูนิต + แหล่งงบ -->
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-slate-500">ยูนิต:</span>
            <span class="ml-2 font-medium text-slate-800">{{ data.unit_code }}</span>
          </div>
          <div>
            <span class="text-slate-500">แหล่งงบ:</span>
            <span class="ml-2 font-medium text-slate-800">{{ data.budget_source_label }}</span>
          </div>
        </div>

        <!-- สรุปงบปัจจุบัน -->
        <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p class="text-xs font-semibold text-slate-500 mb-2">สรุปงบปัจจุบัน</p>
          <div class="grid grid-cols-3 gap-3 text-sm">
            <div>
              <span class="text-slate-500 block">ตั้งงบ</span>
              <span class="font-medium text-sky-700">{{ fmtCurrency(data.allocated) }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">ใช้ไป</span>
              <span class="font-medium text-red-600">{{ fmtCurrency(data.used) }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">คงเหลือ</span>
              <span class="font-bold text-green-700">{{ fmtCurrency(data.remaining) }}</span>
            </div>
          </div>
        </div>

        <!-- จำนวนเงินที่ต้องการคืน -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>จำนวนเงินที่ต้องการคืน</mat-label>
          <span matTextPrefix class="pl-1 text-slate-500">฿&nbsp;</span>
          <input matInput currencyMask [formControl]="amountControl">
          <mat-hint>สูงสุด {{ fmtCurrency(data.remaining) }}</mat-hint>
          @if (amountControl.hasError('required')) {
            <mat-error>กรุณากรอกจำนวนเงิน</mat-error>
          }
          @if (amountControl.hasError('min')) {
            <mat-error>จำนวนเงินต้องมากกว่า 0</mat-error>
          }
          @if (amountControl.hasError('max')) {
            <mat-error>จำนวนเงินเกินงบคงเหลือ (สูงสุด {{ fmtCurrency(data.remaining) }})</mat-error>
          }
        </mat-form-field>

        <!-- Checkbox คืนทั้งจำนวน -->
        <mat-checkbox color="primary" [checked]="returnAll()" (change)="toggleReturnAll($event.checked)">
          คืนทั้งจำนวน ({{ fmtCurrency(data.remaining) }})
        </mat-checkbox>

        <!-- หมายเหตุ -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput [formControl]="noteControl" rows="3"
                    placeholder="ระบุเหตุผลในการคืนงบ..."></textarea>
          @if (noteControl.hasError('required')) {
            <mat-error>กรุณาระบุเหตุผลการคืน</mat-error>
          }
        </mat-form-field>

        <!-- Server error -->
        @if (errorMsg()) {
          <div class="text-sm text-red-600 bg-red-50 p-3 rounded">{{ errorMsg() }}</div>
        }

        <!-- Approval note -->
        @if (data.approval_required) {
          <div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded">
            หมายเหตุ: รายการคืนงบจะต้องรอการอนุมัติก่อนมีผล
          </div>
        }
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button mat-flat-button color="warn" (click)="submit()" [disabled]="saving() || amountControl.invalid || noteControl.invalid">
        @if (saving()) {
          <mat-spinner diameter="18" class="!inline-block mr-1"></mat-spinner>
        }
        ยืนยันคืนงบ
      </button>
    </mat-dialog-actions>
  `,
})
export class ReturnSpecialBudgetDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ReturnSpecialBudgetDialogComponent>);
  private budgetSvc = inject(BudgetService);
  private snackBar = inject(MatSnackBar);
  readonly data: ReturnSpecialBudgetDialogData = inject(MAT_DIALOG_DATA);

  saving = signal(false);
  errorMsg = signal('');
  returnAll = signal(false);

  amountControl = this.fb.control<number | null>(null, [
    Validators.required,
    Validators.min(1),
    Validators.max(this.data.remaining),
  ]);

  noteControl = this.fb.control('', Validators.required);

  fmtCurrency(v: number): string {
    return '฿' + (v ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  toggleReturnAll(checked: boolean): void {
    this.returnAll.set(checked);
    if (checked) {
      this.amountControl.setValue(this.data.remaining);
    } else {
      this.amountControl.setValue(null);
    }
  }

  submit(): void {
    this.amountControl.markAsTouched();
    this.noteControl.markAsTouched();
    if (this.amountControl.invalid || this.noteControl.invalid) return;

    const amount = this.amountControl.value!;
    const amtStr = amount.toLocaleString('th-TH');

    const ok = confirm(
      `ต้องการคืน${this.data.budget_source_label} จำนวน ฿${amtStr} ของยูนิต ${this.data.unit_code} ?`
    );
    if (!ok) return;

    this.saving.set(true);
    this.errorMsg.set('');

    this.budgetSvc.returnSpecialBudget({
      project_id: this.data.project_id,
      unit_id: this.data.unit_id,
      budget_source_type: this.data.budget_source_type as any,
      amount,
      note: this.noteControl.value!,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        const msg = res.data.status === 'approved'
          ? 'คืนงบสำเร็จ'
          : 'ส่งคำขอคืนงบสำเร็จ รอการอนุมัติ';
        this.snackBar.open(msg, 'ปิด', { duration: 3000 });
        this.dialogRef.close(res.data);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(err?.error?.error || 'เกิดข้อผิดพลาดในการคืนงบ');
      },
    });
  }
}
