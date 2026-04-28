import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

export interface RenameSnapshotDialogData {
  snapshotId: number;
  currentName: string;
}

@Component({
  selector: 'app-rename-snapshot-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      แก้ไขชื่อ Snapshot
    </h2>

    <mat-dialog-content class="!px-6 !pt-4 !pb-2">
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>ชื่อ Snapshot</mat-label>
        <input matInput [formControl]="codeCtrl" (keydown.enter)="save()" />
        @if (codeCtrl.hasError('required')) {
          <mat-error>กรุณาระบุชื่อ</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button type="button" (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" type="button"
              [disabled]="codeCtrl.invalid"
              (click)="save()">
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
})
export class RenameSnapshotDialogComponent {
  readonly data      = inject<RenameSnapshotDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<RenameSnapshotDialogComponent>);
  private fb         = inject(FormBuilder);

  codeCtrl = this.fb.control(this.data.currentName, [Validators.required]);

  save(): void {
    if (this.codeCtrl.invalid) return;
    const trimmed = this.codeCtrl.value!.trim();
    if (!trimmed || trimmed === this.data.currentName) {
      this.dialogRef.close();
      return;
    }
    this.dialogRef.close(trimmed);
  }
}
