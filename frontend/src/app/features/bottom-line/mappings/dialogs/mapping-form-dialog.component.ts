import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { BottomLineApiService, MappingPreset, MappingConfig } from '../../bottom-line-api.service';

export interface MappingFormDialogData {
  mode: 'create' | 'edit';
  projectId: number;
  preset?: MappingPreset;
}

const COLUMNS = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' ');

@Component({
  selector: 'app-mapping-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule,
    MatCheckboxModule, MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      {{ data.mode === 'create' ? 'สร้าง Mapping Preset' : 'แก้ไข Mapping Preset' }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="flex flex-col gap-3 pt-2">
        <mat-form-field appearance="outline">
          <mat-label>ชื่อ Preset</mat-label>
          <input matInput formControlName="preset_name" placeholder="เช่น Default SRP" />
          @if (form.get('preset_name')?.hasError('required')) { <mat-error>กรุณากรอกชื่อ</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>ชื่อ Sheet</mat-label>
          <input matInput formControlName="sheet_name" placeholder="Sheet1" />
        </mat-form-field>

        <div class="grid grid-cols-2 gap-4">
          <mat-form-field appearance="outline">
            <mat-label>แถว Header</mat-label>
            <input matInput type="number" formControlName="header_row" min="1" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>แถวเริ่มต้นข้อมูล</mat-label>
            <input matInput type="number" formControlName="data_start_row" min="2" />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Column เลขที่ยูนิต</mat-label>
          <mat-select formControlName="unit_code_column">
            @for (c of columnOptions; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Column ราคา Bottom Line</mat-label>
          <mat-select formControlName="bottom_line_price_column">
            @for (c of columnOptions; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Column ราคาประเมินกรมที่ดิน</mat-label>
          <mat-select formControlName="appraisal_price_column">
            @for (c of columnOptions; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Column งบมาตรฐาน (Standard Budget)</mat-label>
          <mat-select formControlName="standard_budget_column">
            <mat-option [value]="''">— ไม่ระบุ —</mat-option>
            @for (c of columnOptions; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Column ราคาฐาน (Base Price)</mat-label>
          <mat-select formControlName="base_price_column">
            <mat-option [value]="''">— ไม่ระบุ —</mat-option>
            @for (c of columnOptions; track c) { <mat-option [value]="c">{{ c }}</mat-option> }
          </mat-select>
        </mat-form-field>

        <mat-checkbox formControlName="is_default" color="primary">ตั้งเป็น default สำหรับโครงการนี้</mat-checkbox>

        @if (serverError()) {
          <div class="text-red-600 text-sm bg-red-50 p-3 rounded">{{ serverError() }}</div>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
        @if (saving()) { <mat-spinner diameter="18" class="!inline-block mr-1" /> }
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
})
export class MappingFormDialogComponent {
  data      = inject<MappingFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<MappingFormDialogComponent>);
  private api = inject(BottomLineApiService);
  private fb  = inject(FormBuilder);

  saving      = signal(false);
  serverError = signal<string | null>(null);
  columnOptions = COLUMNS;

  form = this.fb.group({
    preset_name:              [this.data.preset?.preset_name ?? '', Validators.required],
    sheet_name:               [this.data.preset?.mapping_config?.sheet_name ?? 'Sheet1'],
    header_row:               [this.data.preset?.mapping_config?.header_row ?? 1],
    data_start_row:           [this.data.preset?.mapping_config?.data_start_row ?? 2],
    unit_code_column:         [this.data.preset?.mapping_config?.unit_code_column ?? 'A'],
    bottom_line_price_column: [this.data.preset?.mapping_config?.bottom_line_price_column ?? 'B'],
    appraisal_price_column:   [this.data.preset?.mapping_config?.appraisal_price_column ?? 'C'],
    standard_budget_column:   [this.data.preset?.mapping_config?.standard_budget_column ?? ''],
    base_price_column:        [this.data.preset?.mapping_config?.base_price_column ?? ''],
    is_default:               [!!Number(this.data.preset?.is_default)],
  });

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;
    const mappingConfig: MappingConfig = {
      unit_code_column: v.unit_code_column!,
      bottom_line_price_column: v.bottom_line_price_column!,
      appraisal_price_column: v.appraisal_price_column!,
      standard_budget_column: v.standard_budget_column || undefined,
      base_price_column: v.base_price_column || undefined,
      header_row: v.header_row!,
      data_start_row: v.data_start_row!,
      sheet_name: v.sheet_name!,
    };

    const payload = {
      project_id: this.data.projectId,
      preset_name: v.preset_name!,
      mapping_config: mappingConfig,
      is_default: v.is_default!,
    };

    const obs = this.data.mode === 'create'
      ? this.api.createMapping(payload)
      : this.api.updateMapping(this.data.preset!.id, payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        this.serverError.set(err.error?.errors ? Object.values(err.error.errors).join(', ') : (err.error?.error ?? 'เกิดข้อผิดพลาด'));
        this.saving.set(false);
      },
    });
  }
}
