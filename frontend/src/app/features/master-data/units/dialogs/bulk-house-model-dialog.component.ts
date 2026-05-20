import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { HouseModel } from '../../house-models/house-model-api.service';

export interface BulkHouseModelDialogData {
  /** จำนวนยูนิตที่เลือก */
  count: number;
  /** รายการแบบบ้านของโครงการ */
  houseModels: HouseModel[];
}

export interface BulkHouseModelDialogResult {
  /** id ของแบบบ้านที่เลือก — null = ล้างแบบบ้าน */
  houseModelId: number | null;
}

@Component({
  selector: 'app-bulk-house-model-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>อัปเดตแบบบ้าน</h2>

    <mat-dialog-content>
      <p class="text-sm text-slate-600 mb-4">
        กำหนดแบบบ้านให้กับยูนิตที่เลือก
        <strong class="text-primary-700">{{ data.count }}</strong> รายการ
      </p>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>แบบบ้าน</mat-label>
        <mat-select [formControl]="houseModelCtrl">
          <mat-option [value]="null">— ไม่ระบุแบบบ้าน (ล้างแบบบ้าน) —</mat-option>
          @for (m of data.houseModels; track m.id) {
            <mat-option [value]="m.id">{{ m.code }} — {{ m.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <p class="text-xs text-slate-400">
        เลือก "— ไม่ระบุแบบบ้าน —" เพื่อล้างแบบบ้านออกจากยูนิตที่เลือก ·
        ยูนิตที่เป็นแบบบ้านนี้อยู่แล้วจะถูกข้าม
      </p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="cancel()">ยกเลิก</button>
      <button mat-flat-button color="primary" (click)="confirm()">
        อัปเดต {{ data.count }} ยูนิต
      </button>
    </mat-dialog-actions>
  `,
})
export class BulkHouseModelDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<BulkHouseModelDialogComponent>);
  readonly data: BulkHouseModelDialogData = inject(MAT_DIALOG_DATA);

  readonly houseModelCtrl = new FormControl<number | null>(null);

  confirm(): void {
    this.dialogRef.close({ houseModelId: this.houseModelCtrl.value ?? null } satisfies BulkHouseModelDialogResult);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
