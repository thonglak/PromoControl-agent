import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { PhaseApiService, Phase } from '../phase-api.service';

export interface PhaseFormDialogData {
  mode: 'create' | 'edit';
  projectId: number;
  phase?: Phase;
}

@Component({
  selector: 'app-phase-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      {{ data.mode === 'create' ? 'เพิ่ม Phase' : 'แก้ไข Phase' }}
    </h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <mat-form-field appearance="outline">
          <mat-label>ชื่อ Phase</mat-label>
          <input matInput formControlName="name" placeholder="เช่น Phase 1" />
          @if (form.controls.name.hasError('required') && form.controls.name.touched) {
            <mat-error>กรุณาระบุชื่อ Phase</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-32">
          <mat-label>ลำดับ</mat-label>
          <input matInput type="number" formControlName="sort_order" />
        </mat-form-field>
        @if (serverError()) {
          <p class="text-sm text-loss">{{ serverError() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2">
      <button mat-stroked-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
        {{ data.mode === 'create' ? 'สร้าง' : 'บันทึก' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class PhaseFormDialogComponent {
  data      = inject<PhaseFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<PhaseFormDialogComponent>);
  private api = inject(PhaseApiService);
  private fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);

  form = this.fb.group({
    name:       [this.data.phase?.name ?? '', Validators.required],
    sort_order: [this.data.phase?.sort_order ?? 0],
  });

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const payload = { project_id: this.data.projectId, ...this.form.value } as any;

    const obs = this.data.mode === 'create'
      ? this.api.create(payload)
      : this.api.update(this.data.phase!.id, payload);

    obs.subscribe({
      next: result => this.dialogRef.close(result),
      error: err => {
        this.serverError.set(err.error?.error ?? 'เกิดข้อผิดพลาด');
        this.saving.set(false);
      },
    });
  }
}
