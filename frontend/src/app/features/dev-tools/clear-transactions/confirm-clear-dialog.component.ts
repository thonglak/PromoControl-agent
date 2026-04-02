import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

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
        <h2 class="text-lg font-semibold text-slate-800">ยืนยันล้างข้อมูล</h2>
      </div>

      <p class="text-sm text-slate-600 mb-4">
        คุณกำลังจะล้างข้อมูลการขาย, งบประมาณ และข้อมูลที่เกี่ยวข้องทั้งหมดของโครงการ
        <strong>{{ data.projectName }}</strong>
      </p>

      <p class="text-sm text-red-600 font-medium mb-4">
        การดำเนินการนี้ไม่สามารถย้อนกลับได้!
      </p>

      <mat-form-field class="w-full" appearance="outline">
        <mat-label>พิมพ์ "ยืนยัน" เพื่อดำเนินการ</mat-label>
        <input matInput [(ngModel)]="confirmText" autocomplete="off" />
      </mat-form-field>

      <div class="flex justify-end gap-2 mt-2">
        <button mat-stroked-button (click)="dialogRef.close(false)" class="!rounded-lg">ยกเลิก</button>
        <button mat-flat-button
                color="warn"
                [disabled]="confirmText !== 'ยืนยัน'"
                (click)="dialogRef.close(true)"
                class="!rounded-lg">
          ล้างข้อมูล
        </button>
      </div>
    </div>
  `,
})
export class ConfirmClearDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmClearDialogComponent>);
  readonly data = inject<{ projectName: string }>(MAT_DIALOG_DATA);
  confirmText = '';
}
