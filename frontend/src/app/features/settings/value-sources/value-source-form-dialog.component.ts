import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ValueSourceApiService, ValueSource } from './value-source-api.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

export interface ValueSourceDialogData {
  mode: 'create' | 'edit';
  source?: ValueSource;
}

@Component({
  selector: 'app-value-source-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule, SvgIconComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'create' ? 'เพิ่มแหล่งข้อมูล' : 'แก้ไขแหล่งข้อมูล' }}</h2>

    <mat-dialog-content [formGroup]="form">
      <!-- ── ข้อมูลทั่วไป ── -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0 mt-1">
        <mat-form-field appearance="outline">
          <mat-label>รหัสแหล่งข้อมูล (key)</mat-label>
          <input matInput formControlName="source_key" placeholder="เช่น unit_appraisal_value" />
          <mat-hint>ภาษาอังกฤษพิมพ์เล็ก/ตัวเลข/_ — แก้ภายหลังไม่ได้</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>ชื่อแหล่งข้อมูล</mat-label>
          <input matInput formControlName="label" />
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>คำอธิบาย (ไม่บังคับ)</mat-label>
        <textarea matInput formControlName="description" rows="2"></textarea>
      </mat-form-field>

      <!-- ── การเชื่อมต่อตาราง ── -->
      <div class="p-3 rounded-lg mt-1 mb-3" style="background: var(--color-gray-50); border: 1px solid var(--color-border)">
        <p class="text-sm font-semibold mb-1" style="color: var(--color-primary-700)">การเชื่อมต่อตาราง</p>
        <p class="text-xs text-slate-500 mb-3">
          ระบบจะดึง <span class="font-mono">amount</span> จากตาราง โดย match promotion_item_id และ unit_id
          — ต้องเป็นตาราง/คอลัมน์ที่มีจริงในฐานข้อมูล
        </p>

        @if (isSystem) {
          <div class="flex items-start gap-2 p-2.5 rounded-lg mb-3 text-sm"
               style="background: var(--color-warning-subtle); color: var(--color-warning)">
            <app-icon name="lock-closed" class="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>แหล่งข้อมูลของระบบ — แก้การเชื่อมต่อตารางไม่ได้</span>
          </div>
        }

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>ชื่อตาราง</mat-label>
          <input matInput formControlName="source_table" placeholder="เช่น promotion_item_unit_values" />
        </mat-form-field>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0">
          <mat-form-field appearance="outline">
            <mat-label>คอลัมน์ promotion item</mat-label>
            <input matInput formControlName="item_column" placeholder="promotion_item_id" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>คอลัมน์ unit</mat-label>
            <input matInput formControlName="unit_column" placeholder="unit_id" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>คอลัมน์จำนวนเงิน</mat-label>
            <input matInput formControlName="amount_column" placeholder="amount" />
          </mat-form-field>
        </div>
      </div>

      <mat-slide-toggle formControlName="is_active" color="primary">เปิดใช้งาน</mat-slide-toggle>

      @if (serverError()) {
        <div class="flex items-start gap-2 p-3 rounded-lg mt-3 text-sm"
             style="background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C">
          <app-icon name="x-circle" class="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{{ serverError() }}</span>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="save()">
        @if (saving()) { <mat-spinner diameter="18" class="!inline-block mr-2" /> }
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
})
export class ValueSourceFormDialogComponent {
  data      = inject<ValueSourceDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ValueSourceFormDialogComponent>);
  private api = inject(ValueSourceApiService);
  private fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);

  private src   = this.data.source;
  isSystem      = !!Number(this.src?.is_system);

  form = this.fb.group({
    source_key:    [{ value: this.src?.source_key ?? '', disabled: this.data.mode === 'edit' }, Validators.required],
    label:         [this.src?.label ?? '', Validators.required],
    description:   [this.src?.description ?? ''],
    source_table:  [{ value: this.src?.source_table ?? '', disabled: this.isSystem }, Validators.required],
    item_column:   [{ value: this.src?.item_column ?? '', disabled: this.isSystem }, Validators.required],
    unit_column:   [{ value: this.src?.unit_column ?? '', disabled: this.isSystem }, Validators.required],
    amount_column: [{ value: this.src?.amount_column ?? '', disabled: this.isSystem }, Validators.required],
    is_active:     [this.src ? !!Number(this.src.is_active) : true],
  });

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.getRawValue();
    const payload = {
      source_key:    v.source_key ?? '',
      label:         v.label ?? '',
      description:   v.description || null,
      source_table:  v.source_table ?? '',
      item_column:   v.item_column ?? '',
      unit_column:   v.unit_column ?? '',
      amount_column: v.amount_column ?? '',
      is_active:     v.is_active ?? true,
    };

    const obs = this.data.mode === 'create'
      ? this.api.create(payload)
      : this.api.update(this.src!.id, payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        this.serverError.set(err.error?.error ?? 'เกิดข้อผิดพลาด');
        this.saving.set(false);
      },
    });
  }
}
