import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { BudgetService, UnitWithRemaining } from '../services/budget.service';

@Component({
  selector: 'app-return-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressSpinnerModule, CurrencyMaskDirective],
  template: `
    <h2 mat-dialog-title>คืนงบยูนิตเข้า Pool</h2>
    <mat-dialog-content style="max-height: 90vh">
      <div style="display: grid; gap: 16px; min-width: 360px">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--mat-sys-surface-container); padding: 16px; border-radius: 8px">
          <div><span style="color: var(--mat-sys-on-surface-variant)">ยูนิต:</span> <strong>{{ data.unit.unit_code }}</strong></div>
          <div><span style="color: var(--mat-sys-on-surface-variant)">งบยูนิตเหลือ:</span> <strong>{{ data.unit.budget_remain | number }} บาท</strong></div>
          @if (data.unit.other_remain > 0) {
            <div><span style="color: var(--mat-sys-on-surface-variant)">งบอื่นๆ เหลือ:</span> <strong>{{ data.unit.other_remain | number }} บาท</strong></div>
            <div><span style="color: var(--mat-sys-on-surface-variant)">รวมคืนได้:</span> <strong style="color: var(--mat-sys-primary)">{{ maxAmount | number }} บาท</strong></div>
          }
        </div>

        <mat-form-field>
          <mat-label>จำนวนที่ต้องการคืน</mat-label>
          <input matInput currencyMask [(ngModel)]="amount" required>
          @if (amount > maxAmount) {
            <mat-error>ไม่เกิน {{ maxAmount | number }} บาท</mat-error>
          }
          @if (data.unit.other_remain > 0) {
            <mat-hint>หักจากงบยูนิตก่อน ที่เหลือหักจากงบอื่นๆ</mat-hint>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput [(ngModel)]="remark" rows="2"></textarea>
        </mat-form-field>

        @if (errorMsg()) {
          <div style="color: var(--mat-sys-error); padding: 8px; background: var(--mat-sys-error-container); border-radius: 4px">
            {{ errorMsg() }}
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button mat-flat-button color="primary" (click)="onConfirm()" [disabled]="saving() || !isValid()">
        @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
        @else { ยืนยันคืนงบ }
      </button>
    </mat-dialog-actions>
  `,
})
export class ReturnDialogComponent {
  private readonly budgetSvc = inject(BudgetService);
  readonly dialogRef = inject(MatDialogRef<ReturnDialogComponent>);
  readonly data: { unit: UnitWithRemaining; projectId: number } = inject(MAT_DIALOG_DATA);

  /** งบรวมที่คืนได้ (ยูนิต + งบอื่นๆ) */
  readonly maxAmount = this.data.unit.budget_remain + this.data.unit.other_remain;
  amount = this.maxAmount;
  remark = '';
  readonly saving = signal(false);
  readonly errorMsg = signal('');

  isValid(): boolean {
    return this.amount > 0 && this.amount <= this.maxAmount;
  }

  onConfirm(): void {
    if (!this.isValid()) return;
    this.saving.set(true);
    this.errorMsg.set('');

    this.budgetSvc.returnUnitBudgetToPool({
      project_id: this.data.projectId,
      unit_id: this.data.unit.unit_id,
      amount: this.amount,
      remark: this.remark,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.dialogRef.close({ success: true, data: res });
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(err.error?.error || 'เกิดข้อผิดพลาด');
      },
    });
  }
}
