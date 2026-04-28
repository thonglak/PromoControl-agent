import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CurrencyMaskDirective } from '../../../../shared/directives/currency-mask.directive';
import { HouseModelApiService, HouseModel } from '../house-model-api.service';

export interface HouseModelFormDialogData {
  mode: 'create' | 'edit';
  projectId: number;
  model?: HouseModel;
}

@Component({
  selector: 'app-house-model-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressSpinnerModule, CurrencyMaskDirective,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      {{ data.mode === 'create' ? 'สร้างแบบบ้านใหม่' : 'แก้ไขแบบบ้าน' }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0 pt-2">

        <!-- รหัส -->
        <mat-form-field appearance="outline">
          <mat-label>รหัสแบบบ้าน</mat-label>
          <input matInput formControlName="code" [readonly]="data.mode === 'edit'">
          @if (form.get('code')?.hasError('required')) {
            <mat-error>กรุณากรอกรหัสแบบบ้าน</mat-error>
          }
        </mat-form-field>

        <!-- ชื่อ -->
        <mat-form-field appearance="outline">
          <mat-label>ชื่อแบบบ้าน</mat-label>
          <input matInput formControlName="name">
          @if (form.get('name')?.hasError('required')) {
            <mat-error>กรุณากรอกชื่อแบบบ้าน</mat-error>
          }
        </mat-form-field>

        <!-- พื้นที่ -->
        <mat-form-field appearance="outline">
          <mat-label>พื้นที่ใช้สอย (ตร.ม.)</mat-label>
          <input matInput currencyMask [options]="{ precision: 2, align: 'left' }" formControlName="area_sqm">
          <span matSuffix class="text-slate-400 text-sm mr-2">ตร.ม.</span>
          @if (form.get('area_sqm')?.hasError('required')) {
            <mat-error>กรุณากรอกพื้นที่ใช้สอย</mat-error>
          }
          @if (form.get('area_sqm')?.hasError('min')) {
            <mat-error>พื้นที่ต้องมากกว่า 0</mat-error>
          }
        </mat-form-field>



        <!-- Server error -->
        @if (serverError()) {
          <div class="sm:col-span-2 text-red-600 text-sm bg-red-50 p-3 rounded">{{ serverError() }}</div>
        }

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
        @if (saving()) { <mat-spinner diameter="18" class="!inline-block mr-1" /> }
        {{ data.mode === 'create' ? 'สร้างแบบบ้าน' : 'บันทึก' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class HouseModelFormDialogComponent {
  data      = inject<HouseModelFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<HouseModelFormDialogComponent>);
  private api = inject(HouseModelApiService);
  private fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);

  form = this.fb.group({
    code:     [this.data.model?.code ?? '', Validators.required],
    name:     [this.data.model?.name ?? '', Validators.required],
    area_sqm: [this.data.model?.area_sqm ?? null, [Validators.required, Validators.min(0.01)]],
  });

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;
    const payload = {
      project_id: this.data.projectId,
      code:       v.code!,
      name:       v.name!,
      area_sqm:   v.area_sqm!,
    };

    const obs = this.data.mode === 'create'
      ? this.api.create(payload)
      : this.api.update(this.data.model!.id, payload);

    obs.subscribe({
      next: result => this.dialogRef.close(result),
      error: err => {
        const body = err.error;
        if (body?.errors) {
          this.serverError.set(Object.values(body.errors as Record<string, string>).join(', '));
        } else {
          this.serverError.set(body?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
        this.saving.set(false);
      },
    });
  }
}
