import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ApplyConfirmData {
  count: number;
}

@Component({
  selector: 'app-unit-budget-apply-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>ยืนยันบันทึกงบยูนิต</h2>
    <mat-dialog-content>
      <p style="margin: 0 0 8px">จะอัปเดต <strong>standard_budget</strong> ของ <strong>{{ data.count }}</strong> ยูนิต</p>
      <p style="margin: 0; color: var(--color-warning); font-size: 0.9em">
        ⚠️ การบันทึกจะทับค่างบเดิม ไม่สามารถย้อนกลับได้
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">ยกเลิก</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="true">บันทึก</button>
    </mat-dialog-actions>
  `,
})
export class UnitBudgetApplyConfirmDialogComponent {
  readonly data: ApplyConfirmData = inject(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<UnitBudgetApplyConfirmDialogComponent>);
}
