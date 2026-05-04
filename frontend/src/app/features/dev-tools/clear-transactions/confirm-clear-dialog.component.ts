import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

export type ClearMode = 'sales_only' | 'full_reset';

export interface ConfirmClearDialogData {
  projectName: string;
  mode: ClearMode;
}

export interface ConfirmClearDialogResult {
  projectNameConfirm: string;
  reason: string;
}

@Component({
  selector: 'app-confirm-clear-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, FormsModule, MatFormFieldModule, MatInputModule, SvgIconComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <app-icon name="exclamation-triangle" class="w-5 h-5 text-red-600" />
        </div>
        <h2 class="text-lg font-semibold text-slate-800">ยืนยันการล้างข้อมูล</h2>
      </div>

      <p class="text-sm text-slate-600 mb-2">
        กำลังจะล้างข้อมูลของโครงการ
        <strong class="text-slate-800">{{ data.projectName }}</strong>
      </p>
      <p class="text-sm text-slate-600 mb-3">
        Mode:
        @if (data.mode === 'sales_only') {
          <span class="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">เฉพาะข้อมูลการขาย</span>
        } @else {
          <span class="inline-flex items-center px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">รีเซ็ตทั้งหมด</span>
        }
      </p>

      <p class="text-sm text-red-600 font-medium mb-4">
        การดำเนินการนี้ไม่สามารถย้อนกลับได้!
      </p>

      <mat-form-field class="w-full" appearance="outline">
        <mat-label>พิมพ์ชื่อโครงการเพื่อยืนยัน</mat-label>
        <input matInput [(ngModel)]="confirmText" autocomplete="off" placeholder="{{ data.projectName }}" />
      </mat-form-field>

      <mat-form-field class="w-full" appearance="outline">
        <mat-label>เหตุผล (ไม่บังคับ)</mat-label>
        <textarea matInput [(ngModel)]="reason" rows="2"></textarea>
      </mat-form-field>

      <div class="flex justify-end gap-2 mt-2">
        <button mat-stroked-button (click)="dialogRef.close(null)" class="!rounded-lg">ยกเลิก</button>
        <button mat-flat-button
                color="warn"
                [disabled]="confirmText !== data.projectName"
                (click)="confirm()"
                class="!rounded-lg">
          ล้างข้อมูล
        </button>
      </div>
    </div>
  `,
})
export class ConfirmClearDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmClearDialogComponent, ConfirmClearDialogResult | null>);
  readonly data = inject<ConfirmClearDialogData>(MAT_DIALOG_DATA);
  confirmText = '';
  reason = '';

  confirm(): void {
    this.dialogRef.close({
      projectNameConfirm: this.confirmText,
      reason: this.reason,
    });
  }
}
