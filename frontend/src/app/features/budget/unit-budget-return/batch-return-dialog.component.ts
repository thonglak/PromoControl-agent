import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { BudgetService, UnitWithRemaining } from '../services/budget.service';

@Component({
  selector: 'app-batch-return-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>คืนงบยูนิตเข้า Pool ({{ data.units.length }} ยูนิต)</h2>
    <mat-dialog-content style="max-height: 90vh">
      <div style="display: grid; gap: 16px; min-width: 400px">
        <div style="background: var(--mat-sys-surface-container); padding: 16px; border-radius: 8px">
          @for (unit of data.units; track unit.unit_id) {
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--mat-sys-outline-variant)">
              <span>{{ unit.unit_code }}</span>
              <span>
                <strong>{{ unit.budget_remain + unit.other_remain | number }} บาท</strong>
                @if (unit.other_remain > 0) {
                  <span style="font-size: 0.8em; color: var(--mat-sys-on-surface-variant); margin-left: 4px">(ยูนิต {{ unit.budget_remain | number }} + อื่นๆ {{ unit.other_remain | number }})</span>
                }
              </span>
            </div>
          }
          <div style="display: flex; justify-content: space-between; padding: 8px 0 0; font-weight: bold; font-size: 1.1em; color: var(--mat-sys-primary)">
            <span>รวม</span>
            <span>{{ totalAmount() | number }} บาท → เข้า Pool</span>
          </div>
        </div>

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
      <button mat-flat-button color="primary" (click)="onConfirm()" [disabled]="saving()">
        @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
        @else { ยืนยันคืนงบ {{ data.units.length }} ยูนิต }
      </button>
    </mat-dialog-actions>
  `,
})
export class BatchReturnDialogComponent {
  private readonly budgetSvc = inject(BudgetService);
  readonly dialogRef = inject(MatDialogRef<BatchReturnDialogComponent>);
  readonly data: { units: UnitWithRemaining[]; projectId: number } = inject(MAT_DIALOG_DATA);

  remark = '';
  readonly saving = signal(false);
  readonly errorMsg = signal('');

  /** รวมงบยูนิต + งบอื่นๆ ของทุกยูนิตที่เลือก */
  readonly totalAmount = computed(() =>
    this.data.units.reduce((sum, u) => sum + u.budget_remain + u.other_remain, 0)
  );

  onConfirm(): void {
    this.saving.set(true);
    this.errorMsg.set('');

    const unitIds = this.data.units.map(u => u.unit_id);

    this.budgetSvc.batchReturnUnitBudgetToPool(
      this.data.projectId,
      unitIds,
      this.remark,
    ).subscribe({
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
