import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SyncFromApiService, SyncTargetTable } from '../../sync-from-api.service';

export interface SyncTargetTableFormDialogData {
  mode: 'create' | 'edit';
  table?: SyncTargetTable;
}

@Component({
  selector: 'app-sync-target-table-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      {{ data.mode === 'create' ? 'เพิ่ม Target Table' : 'แก้ไข Target Table' }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="flex flex-col gap-3 pt-2 min-w-[400px]">

        <!-- ชื่อ table (เฉพาะสร้างใหม่) -->
        <mat-form-field appearance="outline">
          <mat-label>ชื่อ Table</mat-label>
          <input
            matInput
            formControlName="table_name"
            placeholder="เช่น project_units"
            [readonly]="data.mode === 'edit'"
          />
          @if (form.get('table_name')?.hasError('required')) {
            <mat-error>กรุณากรอกชื่อ table</mat-error>
          }
        </mat-form-field>

        <!-- ชื่อแสดงผล -->
        <mat-form-field appearance="outline">
          <mat-label>ชื่อแสดงผล</mat-label>
          <input matInput formControlName="label" placeholder="เช่น ยูนิตโครงการ" />
          @if (form.get('label')?.hasError('required')) {
            <mat-error>กรุณากรอกชื่อแสดงผล</mat-error>
          }
        </mat-form-field>

        <!-- key สำหรับ upsert -->
        <mat-form-field appearance="outline">
          <mat-label>Default Upsert Key</mat-label>
          <input matInput formControlName="default_upsert_key" placeholder="เช่น unit_code" />
          @if (form.get('default_upsert_key')?.hasError('required')) {
            <mat-error>กรุณากรอก upsert key</mat-error>
          }
        </mat-form-field>

        <!-- สถานะ -->
        <div class="flex items-center gap-3 py-1">
          <mat-slide-toggle formControlName="is_active" color="primary">
            เปิดใช้งาน
          </mat-slide-toggle>
        </div>

        <!-- Server error -->
        @if (serverError()) {
          <div class="text-red-600 text-sm bg-red-50 p-3 rounded">{{ serverError() }}</div>
        }

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
        @if (saving()) { <mat-spinner diameter="18" class="!inline-block mr-1" /> }
        {{ data.mode === 'create' ? 'เพิ่ม' : 'บันทึก' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class SyncTargetTableFormDialogComponent {
  data      = inject<SyncTargetTableFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<SyncTargetTableFormDialogComponent>);
  private api = inject(SyncFromApiService);
  private fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);

  form = this.fb.group({
    table_name:         [this.data.table?.table_name ?? '', Validators.required],
    label:              [this.data.table?.label ?? '', Validators.required],
    default_upsert_key: [this.data.table?.default_upsert_key ?? '', Validators.required],
    is_active:          [!!Number(this.data.table?.is_active ?? 1)],
  });

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;

    const obs = this.data.mode === 'create'
      ? this.api.createSyncTargetTable({
          table_name:         v.table_name!,
          label:              v.label!,
          default_upsert_key: v.default_upsert_key!,
          is_active:          v.is_active ?? true,
        })
      : this.api.updateSyncTargetTable(this.data.table!.id, {
          label:              v.label!,
          default_upsert_key: v.default_upsert_key!,
          is_active:          v.is_active ?? true,
        });

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
