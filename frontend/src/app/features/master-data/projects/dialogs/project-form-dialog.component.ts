import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CurrencyMaskDirective } from '../../../../shared/directives/currency-mask.directive';
import { ProjectApiService, Project } from '../project-api.service';

export interface ProjectFormDialogData {
  mode: 'create' | 'edit';
  project?: Project;
}

@Component({
  selector: 'app-project-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule, CurrencyMaskDirective,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      {{ data.mode === 'create' ? 'สร้างโครงการใหม่' : 'แก้ไขโครงการ' }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">

        <!-- Code — disabled in edit -->
        <mat-form-field appearance="outline">
          <mat-label>รหัสโครงการ</mat-label>
          <input matInput formControlName="code"
                 placeholder="เช่น PROJ001"
                 [readonly]="data.mode === 'edit'">
          @if (form.get('code')?.hasError('required')) {
            <mat-error>กรุณากรอกรหัสโครงการ</mat-error>
          }
          @if (form.get('code')?.hasError('pattern')) {
            <mat-error>ใช้ได้เฉพาะตัวอักษร ตัวเลข - และ _</mat-error>
          }
        </mat-form-field>

        <!-- Name -->
        <mat-form-field appearance="outline">
          <mat-label>ชื่อโครงการ</mat-label>
          <input matInput formControlName="name" placeholder="ชื่อโครงการ">
          @if (form.get('name')?.hasError('required')) {
            <mat-error>กรุณากรอกชื่อโครงการ</mat-error>
          }
        </mat-form-field>

        <!-- Type -->
        <mat-form-field appearance="outline">
          <mat-label>ประเภทโครงการ</mat-label>
          <mat-select formControlName="project_type">
            <mat-option value="condo">คอนโดมิเนียม</mat-option>
            <mat-option value="house">บ้านเดี่ยว</mat-option>
            <mat-option value="townhouse">ทาวน์เฮาส์</mat-option>
            <mat-option value="mixed">มิกซ์ยูส</mat-option>
          </mat-select>
          @if (form.get('project_type')?.hasError('required')) {
            <mat-error>กรุณาเลือกประเภทโครงการ</mat-error>
          }
        </mat-form-field>

        <!-- Status — edit only -->
        @if (data.mode === 'edit') {
          <mat-form-field appearance="outline">
            <mat-label>สถานะ</mat-label>
            <mat-select formControlName="status">
              <mat-option value="active">เปิดใช้งาน</mat-option>
              <mat-option value="inactive">ปิดใช้งาน</mat-option>
              <mat-option value="completed">เสร็จสิ้น</mat-option>
            </mat-select>
          </mat-form-field>
        }

        <!-- Location -->
        <mat-form-field appearance="outline">
          <mat-label>ที่ตั้ง (ไม่บังคับ)</mat-label>
          <input matInput formControlName="location" placeholder="ที่อยู่โครงการ">
        </mat-form-field>

        <!-- Pool budget -->
        <mat-form-field appearance="outline">
          <mat-label>งบ Pool (บาท)</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput currencyMask formControlName="pool_budget_amount" placeholder="0">
          @if (form.get('pool_budget_amount')?.hasError('min')) {
            <mat-error>งบ Pool ต้องไม่ติดลบ</mat-error>
          }
        </mat-form-field>

        <!-- Common fee rate -->
        <mat-form-field appearance="outline">
          <mat-label>อัตราค่าส่วนกลาง</mat-label>
          <input matInput currencyMask [options]="{ precision: 2 }" formControlName="common_fee_rate" placeholder="0.00">
          @if (form.get('common_fee_rate')?.hasError('min')) {
            <mat-error>อัตราค่าส่วนกลางต้องไม่ติดลบ</mat-error>
          }
        </mat-form-field>

        <!-- Electric meter install fee -->
        <mat-form-field appearance="outline">
          <mat-label>ค่าติดตั้งมิเตอร์ไฟฟ้า</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput currencyMask [options]="{ precision: 2 }" formControlName="electric_meter_fee" placeholder="0.00">
          @if (form.get('electric_meter_fee')?.hasError('min')) {
            <mat-error>ค่าติดตั้งมิเตอร์ไฟฟ้าต้องไม่ติดลบ</mat-error>
          }
        </mat-form-field>

        <!-- Water meter install fee -->
        <mat-form-field appearance="outline">
          <mat-label>ค่าติดตั้งมิเตอร์ประปา</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput currencyMask [options]="{ precision: 2 }" formControlName="water_meter_fee" placeholder="0.00">
          @if (form.get('water_meter_fee')?.hasError('min')) {
            <mat-error>ค่าติดตั้งมิเตอร์ประปาต้องไม่ติดลบ</mat-error>
          }
        </mat-form-field>

        <!-- Approval required -->
        <div class="flex items-center gap-2">
          <mat-checkbox formControlName="approval_required" color="primary">
            ต้องอนุมัติการขายก่อนบันทึก
          </mat-checkbox>
        </div>

        <!-- Allow over budget -->
        <div class="flex items-center gap-2">
          <mat-checkbox formControlName="allow_over_budget" color="warn">
            อนุญาตให้บันทึกเกินงบได้
          </mat-checkbox>
          <span class="text-xs text-slate-400">(ระบบจะแสดงคำเตือนแทนการบล็อก)</span>
        </div>

        <!-- Server errors -->
        @if (serverError()) {
          <div class="text-red-600 text-sm bg-red-50 p-3 rounded">{{ serverError() }}</div>
        }

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
        @if (saving()) { <mat-spinner diameter="18" class="!inline-block mr-1" /> }
        {{ data.mode === 'create' ? 'สร้างโครงการ' : 'บันทึก' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ProjectFormDialogComponent {
  data     = inject<ProjectFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ProjectFormDialogComponent>);
  private api = inject(ProjectApiService);

  saving      = signal(false);
  serverError = signal<string | null>(null);

  private fb = inject(FormBuilder);

  form = this.fb.group({
    code:         [this.data.project?.code ?? '', [Validators.required, Validators.pattern(/^[A-Za-z0-9\-_]+$/)]],
    name:         [this.data.project?.name ?? '', Validators.required],
    project_type: [this.data.project?.project_type ?? '', Validators.required],
    status:       [this.data.project?.status ?? 'active'],
    location:     [this.data.project?.location ?? ''],
    pool_budget_amount:  [this.data.project?.pool_budget_amount ?? 0, Validators.min(0)],
    common_fee_rate:     [this.data.project?.common_fee_rate ?? 0, Validators.min(0)],
    electric_meter_fee:  [this.data.project?.electric_meter_fee ?? 0, Validators.min(0)],
    water_meter_fee:     [this.data.project?.water_meter_fee ?? 0, Validators.min(0)],
    approval_required:   [!!Number(this.data.project?.approval_required)],
    allow_over_budget:   [!!Number(this.data.project?.allow_over_budget)],
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
      ? this.api.createProject({
          code:               val.code!,
          name:               val.name!,
          project_type:       val.project_type!,
          location:           val.location || undefined,
          pool_budget_amount: val.pool_budget_amount ?? 0,
          common_fee_rate:    val.common_fee_rate ?? 0,
          electric_meter_fee: val.electric_meter_fee ?? 0,
          water_meter_fee:    val.water_meter_fee ?? 0,
          approval_required:  !!val.approval_required,
          allow_over_budget:  !!val.allow_over_budget,
        })
      : this.api.updateProject(this.data.project!.id, {
          name:               val.name!,
          project_type:       val.project_type!,
          status:             val.status!,
          location:           val.location || undefined,
          pool_budget_amount: val.pool_budget_amount ?? 0,
          common_fee_rate:    val.common_fee_rate ?? 0,
          electric_meter_fee: val.electric_meter_fee ?? 0,
          water_meter_fee:    val.water_meter_fee ?? 0,
          approval_required:  !!val.approval_required,
          allow_over_budget:  !!val.allow_over_budget,
        });

    obs.subscribe({
      next: project => this.dialogRef.close(project),
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
