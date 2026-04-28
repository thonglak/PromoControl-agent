import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  SyncFromApiService,
  ExternalApiConfig,
  ExternalApiConfigCreatePayload,
  ExternalApiConfigUpdatePayload,
} from '../../sync-from-api.service';

export interface ExternalApiConfigFormDialogData {
  mode: 'create' | 'edit';
  projectId: number;
  config?: ExternalApiConfig;
}

@Component({
  selector: 'app-external-api-config-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      {{ data.mode === 'create' ? 'เพิ่ม API Config' : 'แก้ไข API Config' }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2 min-w-[380px]">

        <!-- Name -->
        <mat-form-field appearance="outline">
          <mat-label>ชื่อ Config</mat-label>
          <input matInput formControlName="name" placeholder="เช่น Narai Connect - โครงการ A">
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>กรุณากรอกชื่อ Config</mat-error>
          }
        </mat-form-field>

        <!-- API URL -->
        <mat-form-field appearance="outline">
          <mat-label>API URL</mat-label>
          <input matInput formControlName="api_url" placeholder="https://api.example.com/units">
          @if (form.get('api_url')?.hasError('required') && form.get('api_url')?.touched) {
            <mat-error>กรุณากรอก API URL</mat-error>
          }
          @if (form.get('api_url')?.hasError('pattern') && form.get('api_url')?.touched) {
            <mat-error>URL ต้องเริ่มต้นด้วย http:// หรือ https://</mat-error>
          }
        </mat-form-field>

        <!-- Active toggle -->
        <div class="flex items-center gap-3 py-1">
          <mat-slide-toggle formControlName="is_active" color="primary">
            เปิดใช้งาน
          </mat-slide-toggle>
          <span class="text-sm text-slate-500">
            @if (form.get('is_active')?.value) { เปิดใช้งาน } @else { ปิดใช้งาน }
          </span>
        </div>

        <!-- Server error -->
        @if (serverError()) {
          <div class="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-200">
            {{ serverError() }}
          </div>
        }

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
        @if (saving()) {
          <mat-spinner diameter="18" class="!inline-block mr-1" />
        }
        {{ data.mode === 'create' ? 'เพิ่ม Config' : 'บันทึก' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ExternalApiConfigFormDialogComponent {
  data      = inject<ExternalApiConfigFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ExternalApiConfigFormDialogComponent>);
  private api = inject(SyncFromApiService);
  private fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);

  form = this.fb.group({
    name:      [this.data.config?.name ?? '', Validators.required],
    api_url:   [this.data.config?.api_url ?? '', [
      Validators.required,
      Validators.pattern(/^https?:\/\/.+/),
    ]],
    is_active: [!!Number(this.data.config?.is_active ?? 1)],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.serverError.set(null);

    const val = this.form.value;

    const obs = this.data.mode === 'create'
      ? this.api.createConfig({
          project_id: this.data.projectId,
          name:       val.name!,
          api_url:    val.api_url!,
          is_active:  !!val.is_active,
        } satisfies ExternalApiConfigCreatePayload)
      : this.api.updateConfig(this.data.config!.id, {
          name:      val.name!,
          api_url:   val.api_url!,
          is_active: !!val.is_active,
        } satisfies ExternalApiConfigUpdatePayload);

    obs.subscribe({
      next:  result => this.dialogRef.close(result),
      error: err => {
        const body = err.error;
        if (body?.errors) {
          const msgs = Object.values(body.errors as Record<string, string>).join(', ');
          this.serverError.set(msgs);
        } else {
          this.serverError.set(body?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
        this.saving.set(false);
      },
    });
  }
}
