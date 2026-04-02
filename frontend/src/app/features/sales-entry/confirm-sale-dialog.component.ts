import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmSaleDialogData {
  unitCode: string;
  netPrice: number;
  netAfterPromo: number;
  profit: number;
  totalUsed: number;
}

@Component({
  selector: 'app-confirm-sale-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>ยืนยันบันทึกรายการขาย</h2>
    <mat-dialog-content>
      <div class="py-2 space-y-3 text-sm">
        <p class="text-slate-700">
          ยืนยันบันทึกรายการขายยูนิต <strong>{{ data.unitCode }}</strong>?
        </p>
        <div class="bg-slate-50 rounded-lg p-3 space-y-1">
          <div class="flex justify-between">
            <span class="text-slate-500">ราคาสุทธิ:</span>
            <span class="font-medium tabular-nums">{{ data.netPrice | number:'1.0-0' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">สุทธิ:</span>
            <span class="font-medium tabular-nums">{{ data.netAfterPromo | number:'1.0-0' }}</span>
          </div>
          <div class="flex justify-between"
            [class.text-green-600]="data.profit >= 0"
            [class.text-red-600]="data.profit < 0">
            <span>กำไร:</span>
            <span class="font-bold tabular-nums">{{ data.profit | number:'1.0-0' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">งบใช้ไป:</span>
            <span class="font-medium tabular-nums">{{ data.totalUsed | number:'1.0-0' }}</span>
          </div>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">ยกเลิก</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="true">ยืนยันบันทึก</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmSaleDialogComponent {
  readonly data: ConfirmSaleDialogData = inject(MAT_DIALOG_DATA);
}
