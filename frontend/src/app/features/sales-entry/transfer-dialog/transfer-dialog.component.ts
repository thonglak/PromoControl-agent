import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SalesEntryService } from '../services/sales-entry.service';

/** แปลง Date หรือ Moment → YYYY-MM-DD string */
function toISODateStr(d: any): string {
  if (!d) return '';
  const y = typeof d.year === 'function' ? d.year() : d.getFullYear();
  const m = String((typeof d.month === 'function' ? d.month() : d.getMonth()) + 1).padStart(2, '0');
  const dd = String(typeof d.date === 'function' ? d.date() : d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export interface TransferDialogData {
  transaction: {
    id: number;
    sale_no: string;
    unit_code: string;
    customer_name: string;
    net_price: number;
  };
}

@Component({
  selector: 'app-transfer-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatDatepickerModule, MatButtonModule, MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>โอนกรรมสิทธิ์</h2>
    <mat-dialog-content style="max-height: 90vh">
      <div style="display: grid; gap: 16px; min-width: 400px">
        <!-- ข้อมูล Transaction -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--mat-sys-surface-container); padding: 16px; border-radius: 8px">
          <div><span style="color: var(--mat-sys-on-surface-variant)">ยูนิต:</span> <strong>{{ data.transaction.unit_code }}</strong></div>
          <div><span style="color: var(--mat-sys-on-surface-variant)">เลขที่:</span> <strong>{{ data.transaction.sale_no }}</strong></div>
          <div><span style="color: var(--mat-sys-on-surface-variant)">ลูกค้า:</span> <strong>{{ data.transaction.customer_name }}</strong></div>
          <div><span style="color: var(--mat-sys-on-surface-variant)">ราคาสุทธิ:</span> <strong>{{ data.transaction.net_price | number }} บาท</strong></div>
        </div>

        <!-- วันที่โอน -->
        <mat-form-field appearance="outline" style="width: 100%">
          <mat-label>วันที่โอน</mat-label>
          <input matInput [matDatepicker]="picker"
                 [formControl]="transferDateControl"
                 [max]="today"
                 required>
          <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
          <mat-error>กรุณาระบุวันที่โอน</mat-error>
        </mat-form-field>

        @if (errorMsg()) {
          <div style="color: var(--mat-sys-error); padding: 8px; background: var(--mat-sys-error-container); border-radius: 4px">
            {{ errorMsg() }}
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="isSubmitting()">ยกเลิก</button>
      <button mat-flat-button color="primary"
              [disabled]="!transferDateControl.valid || isSubmitting()"
              (click)="submit()">
        @if (isSubmitting()) { <mat-spinner diameter="20"></mat-spinner> }
        @else { ยืนยันโอนกรรมสิทธิ์ }
      </button>
    </mat-dialog-actions>
  `,
})
export class TransferDialogComponent {
  private readonly salesSvc = inject(SalesEntryService);
  readonly dialogRef = inject(MatDialogRef<TransferDialogComponent>);
  readonly data: TransferDialogData = inject(MAT_DIALOG_DATA);

  readonly transferDateControl = new FormControl<Date | null>(null, Validators.required);
  readonly today = new Date();
  readonly isSubmitting = signal(false);
  readonly errorMsg = signal('');

  submit(): void {
    if (!this.transferDateControl.valid || !this.transferDateControl.value) return;

    this.isSubmitting.set(true);
    this.errorMsg.set('');

    // Format date เป็น YYYY-MM-DD (รองรับทั้ง Date และ Moment)
    const d: any = this.transferDateControl.value;
    const yyyy = typeof d.year === 'function' ? d.year() : d.getFullYear();
    const mm = String((typeof d.month === 'function' ? d.month() : d.getMonth()) + 1).padStart(2, '0');
    const dd = String(typeof d.date === 'function' ? d.date() : d.getDate()).padStart(2, '0');
    const transferDate = `${yyyy}-${mm}-${dd}`;

    this.salesSvc.markAsTransferred(this.data.transaction.id, transferDate).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.dialogRef.close({ success: true, data: res });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMsg.set(err.error?.error || 'เกิดข้อผิดพลาด');
      },
    });
  }
}
