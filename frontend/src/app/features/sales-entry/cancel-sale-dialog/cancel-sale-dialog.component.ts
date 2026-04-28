import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SalesEntryService } from '../services/sales-entry.service';

export interface CancelSaleDialogData {
  id: number;
  sale_no: string;
  unit_code: string;
  customer_name: string;
  net_price: number;
  sale_date: string;
}

@Component({
  selector: 'app-cancel-sale-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>ยกเลิกรายการขาย</h2>
    <mat-dialog-content style="max-height: 90vh">
      <div style="display: grid; gap: 16px; min-width: 400px">
        <!-- ข้อมูล Transaction -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--mat-sys-surface-container); padding: 16px; border-radius: 8px">
          <div><span style="color: var(--mat-sys-on-surface-variant)">ยูนิต:</span> <strong>{{ data.unit_code }}</strong></div>
          <div><span style="color: var(--mat-sys-on-surface-variant)">เลขที่:</span> <strong>{{ data.sale_no }}</strong></div>
          <div><span style="color: var(--mat-sys-on-surface-variant)">ลูกค้า:</span> <strong>{{ data.customer_name }}</strong></div>
          <div><span style="color: var(--mat-sys-on-surface-variant)">ราคาสุทธิ:</span> <strong>{{ data.net_price | number }} บาท</strong></div>
          <div><span style="color: var(--mat-sys-on-surface-variant)">วันที่ขาย:</span> <strong>{{ data.sale_date | date:'d/M/yy' }}</strong></div>
        </div>

        <!-- Warning -->
        <div style="background: var(--color-warning-subtle); border-left: 4px solid #FF9800; padding: 12px 16px; border-radius: 0 4px 4px 0; font-size: 0.9em">
          <strong style="color: var(--color-warning)">การยกเลิกจะ:</strong>
          <ul style="margin: 4px 0 0; padding-left: 20px; color: var(--color-warning)">
            <li>คืนงบทั้งหมดกลับไปยังแหล่งเดิม</li>
            <li>เปลี่ยนสถานะยูนิตเป็น "ว่าง"</li>
            <li>ไม่สามารถย้อนกลับได้</li>
          </ul>
        </div>

        <!-- เหตุผล -->
        <mat-form-field>
          <mat-label>เหตุผลการยกเลิก *</mat-label>
          <textarea matInput [(ngModel)]="reason" rows="3" maxlength="500" required></textarea>
          <mat-hint align="end">{{ reason.length }}/500</mat-hint>
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
      <button mat-flat-button color="warn" (click)="onConfirm()" [disabled]="saving() || !reason.trim()">
        @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
        @else { ยืนยันยกเลิกขาย }
      </button>
    </mat-dialog-actions>
  `,
})
export class CancelSaleDialogComponent {
  private readonly salesSvc = inject(SalesEntryService);
  readonly dialogRef = inject(MatDialogRef<CancelSaleDialogComponent>);
  readonly data: CancelSaleDialogData = inject(MAT_DIALOG_DATA);

  reason = '';
  readonly saving = signal(false);
  readonly errorMsg = signal('');

  onConfirm(): void {
    if (!this.reason.trim()) return;
    this.saving.set(true);
    this.errorMsg.set('');

    this.salesSvc.cancelSale(this.data.id, this.reason.trim()).subscribe({
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
