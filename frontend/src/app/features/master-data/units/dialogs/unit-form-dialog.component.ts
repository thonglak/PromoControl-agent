import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CurrencyMaskDirective } from '../../../../shared/directives/currency-mask.directive';
import { UnitApiService, Unit, UnitPayload } from '../unit-api.service';
import { HouseModelApiService, HouseModel } from '../../house-models/house-model-api.service';
import { UnitTypeApiService, UnitType } from '../unit-type-api.service';
import { UnitTypeDialogComponent } from '../unit-type-dialog/unit-type-dialog.component';

export interface UnitFormDialogData {
  mode: 'create' | 'edit';
  projectId: number;
  projectType: string;
  unit?: Unit;
}

@Component({
  selector: 'app-unit-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatProgressSpinnerModule, CurrencyMaskDirective,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      {{ data.mode === 'create' ? 'สร้างยูนิตใหม่' : 'แก้ไขยูนิต' }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0 pt-2">

        <mat-form-field appearance="outline">
          <mat-label>รหัสยูนิต</mat-label>
          <input matInput formControlName="unit_code" [readonly]="data.mode === 'edit'">
          @if (form.get('unit_code')?.hasError('required')) {
            <mat-error>กรุณากรอกรหัสยูนิต</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>เลขที่ยูนิต</mat-label>
          <input matInput formControlName="unit_number">
        </mat-form-field>

        <mat-form-field appearance="outline" class="sm:col-span-2">
          <mat-label>แบบบ้าน (ไม่บังคับ)</mat-label>
          <mat-select formControlName="house_model_id" (selectionChange)="onModelChange($event.value)">
            <mat-option [value]="null">— ไม่ระบุ —</mat-option>
            @for (m of houseModels(); track m.id) {
              <mat-option [value]="m.id">{{ m.code }} — {{ m.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>อาคาร</mat-label>
          <input matInput formControlName="building">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>ชั้น</mat-label>
          <input matInput type="number" formControlName="floor" min="1">
        </mat-form-field>

        @if (projectType === "mixed") {
          <mat-form-field appearance="outline">
            <mat-label>ประเภทยูนิต</mat-label>
            <mat-select formControlName="unit_type_id">
              @for (t of unitTypes(); track t.id) {
                <mat-option [value]="t.id">{{ t.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <div class="px-3 py-2 bg-slate-50 rounded-lg">
            <p class="text-xs text-slate-500">ประเภทยูนิต</p>
            <p class="text-sm font-medium text-slate-700">{{ projectType === "condo" ? "คอนโด" : projectType === "house" ? "บ้านเดี่ยว" : "ทาวน์โฮม" }}</p>
          </div>
        }

        <mat-form-field appearance="outline">
          <mat-label>ขนาดที่ดิน (ตร.ว.)</mat-label>
          <input matInput currencyMask [options]="{ precision: 2, align: 'left' }" formControlName="land_area_sqw">
          <span matSuffix class="text-slate-400 text-sm mr-2">ตร.ว.</span>
        </mat-form-field>

        <mat-form-field appearance="outline" class="sm:col-span-2">
          <mat-label>ราคาขาย (บาท)</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput currencyMask formControlName="base_price">
          @if (form.get('base_price')?.hasError('required')) {
            <mat-error>กรุณากรอกราคาขาย</mat-error>
          }
          @if (form.get('base_price')?.hasError('min')) {
            <mat-error>ราคาขายต้องมากกว่า 0</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>ต้นทุน (บาท)</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput currencyMask formControlName="unit_cost">
          @if (form.get('unit_cost')?.hasError('required')) {
            <mat-error>กรุณากรอกต้นทุน</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>ราคาประเมิน (บาท)</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput currencyMask formControlName="appraisal_price">
        </mat-form-field>

        <mat-form-field appearance="outline" class="sm:col-span-2">
          <mat-label>งบมาตรฐาน (บาท)</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput currencyMask formControlName="standard_budget">
          @if (form.get('standard_budget')?.hasError('required')) {
            <mat-error>กรุณากรอกงบมาตรฐาน</mat-error>
          }
        </mat-form-field>

        @if (data.mode === 'edit') {
          <mat-form-field appearance="outline" class="sm:col-span-2">
            <mat-label>สถานะ</mat-label>
            <mat-select formControlName="status">
              <mat-option value="available">ว่าง</mat-option>
              <mat-option value="reserved">จอง</mat-option>
              <mat-option value="sold">ขายแล้ว</mat-option>
              <mat-option value="transferred">โอนแล้ว</mat-option>
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="sm:col-span-2">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput formControlName="remark" rows="2"></textarea>
        </mat-form-field>

        @if (serverError()) {
          <div class="sm:col-span-2 text-red-600 text-sm bg-red-50 p-3 rounded">{{ serverError() }}</div>
        }

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
        @if (saving()) { <mat-spinner diameter="18" class="!inline-block mr-1" /> }
        {{ data.mode === 'create' ? 'สร้างยูนิต' : 'บันทึก' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class UnitFormDialogComponent implements OnInit {
  data      = inject<UnitFormDialogData>(MAT_DIALOG_DATA);
  get projectType(): string { return this.data.projectType ?? "condo"; }
  dialogRef = inject(MatDialogRef<UnitFormDialogComponent>);
  private api      = inject(UnitApiService);
  private modelApi = inject(HouseModelApiService);
  private unitTypeApi = inject(UnitTypeApiService);
  unitTypes = signal<UnitType[]>([]);
  private fb       = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);
  houseModels = signal<HouseModel[]>([]);

  form = this.fb.group({
    unit_code:       [this.data.unit?.unit_code ?? '', Validators.required],
    unit_number:     [this.data.unit?.unit_number ?? ''],
    house_model_id:  [this.data.unit?.house_model_id ?? null],
    building:        [this.data.unit?.building ?? ''],
    floor:           [this.data.unit?.floor ?? null],
    unit_type_id:    [this.data.unit?.unit_type_id ?? null],
    land_area_sqw:   [this.data.unit?.land_area_sqw ?? null],
    base_price:      [this.data.unit?.base_price ?? null, [Validators.required, Validators.min(0.01)]],
    unit_cost:       [this.data.unit?.unit_cost ?? null, [Validators.required, Validators.min(0)]],
    appraisal_price: [this.data.unit?.appraisal_price ?? null],
    standard_budget: [this.data.unit?.standard_budget ?? null, Validators.required],
    status:          [this.data.unit?.status ?? 'available'],
    remark:          [this.data.unit?.remark ?? ''],
  });

  ngOnInit(): void {
    this.modelApi.getList(this.data.projectId).subscribe({
      next: models => this.houseModels.set(models),
    });
  }

  onModelChange(_modelId: number | null): void {
    // area_sqm มาจาก house_models แล้ว ไม่ต้อง auto-fill
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;
    const payload: UnitPayload = {
      project_id:      this.data.projectId,
      house_model_id:  v.house_model_id ?? null,
      unit_code:       v.unit_code!,
      unit_number:     v.unit_number || null,
      building:        v.building || null,
      floor:           v.floor ?? null,
      unit_type_id:    v.unit_type_id ?? null,
      land_area_sqw:   v.land_area_sqw ?? null,
      base_price:      v.base_price!,
      unit_cost:       v.unit_cost!,
      appraisal_price: v.appraisal_price ?? null,
      standard_budget: v.standard_budget!,
      status:          v.status ?? 'available',
      remark:          v.remark || null,
    };

    const obs = this.data.mode === 'create'
      ? this.api.create(payload)
      : this.api.update(this.data.unit!.id, payload);

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
