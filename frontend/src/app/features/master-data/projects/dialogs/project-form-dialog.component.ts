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
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CurrencyMaskDirective } from '../../../../shared/directives/currency-mask.directive';
import { ProjectApiService, Project } from '../project-api.service';
import { NumberSeriesService } from '../../../settings/services/number-series.service';

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
    MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule,
    MatDatepickerModule, MatDividerModule,
    CurrencyMaskDirective,
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

        <!-- Approved project value -->
        <mat-form-field appearance="outline">
          <mat-label>มูลค่าโครงการที่อนุมัติ (บาท)</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput currencyMask formControlName="approved_project_value" placeholder="0">
          <mat-hint>ปล่อยว่างหรือ 0 = ใช้ผลรวม base_price ของยูนิตอัตโนมัติ</mat-hint>
          @if (form.get('approved_project_value')?.hasError('min')) {
            <mat-error>มูลค่าโครงการที่อนุมัติต้องไม่ติดลบ</mat-error>
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

        <!-- ─── ข้อมูลระบบเก่า (สำหรับ Dashboard) ─────────────────────────── -->
        <mat-divider />
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide -mb-2">
          ข้อมูลระบบเก่า (สำหรับ Dashboard)
        </p>

        <!-- จำนวนยูนิตที่ขายไปแล้ว -->
        <mat-form-field appearance="outline">
          <mat-label>จำนวนยูนิตที่ขายไปแล้ว (ระบบเก่า)</mat-label>
          <input matInput
                 currencyMask
                 [options]="{ precision: 0, allowNegative: false }"
                 formControlName="legacy_sold_units"
                 class="text-right font-mono tabular-nums"
                 placeholder="0" />
          <mat-hint>จำนวนเต็ม ≥ 0</mat-hint>
        </mat-form-field>

        <!-- มูลค่าขายสุทธิระบบเก่า -->
        <mat-form-field appearance="outline">
          <mat-label>มูลค่าขายสุทธิระบบเก่า</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput
                 currencyMask
                 [options]="{ allowNegative: true }"
                 formControlName="legacy_sold_net_price"
                 class="text-right font-mono tabular-nums"
                 placeholder="0" />
        </mat-form-field>

        <!-- มูลค่าส่วนลดรวมระบบเก่า -->
        <mat-form-field appearance="outline">
          <mat-label>มูลค่าส่วนลดรวมระบบเก่า</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput
                 currencyMask
                 [options]="{ allowNegative: true }"
                 formControlName="legacy_total_discount_amount"
                 class="text-right font-mono tabular-nums"
                 placeholder="0" />
        </mat-form-field>

        <!-- มูลค่าโครงการที่ทำได้ระบบเก่า -->
        <mat-form-field appearance="outline">
          <mat-label>มูลค่าโครงการที่ทำได้ระบบเก่า</mat-label>
          <span matPrefix class="text-slate-400 ml-2 mr-1">฿</span>
          <input matInput
                 currencyMask
                 [options]="{ allowNegative: true }"
                 formControlName="legacy_value_achieved"
                 class="text-right font-mono tabular-nums"
                 placeholder="0" />
        </mat-form-field>

        <!-- ณ วันที่ (cutoff Dashboard) -->
        <mat-form-field appearance="outline">
          <mat-label>ณ วันที่ (cutoff Dashboard)</mat-label>
          <input matInput [matDatepicker]="legacyPicker"
                 formControlName="legacy_dashboard_as_of_date" />
          <mat-datepicker-toggle matIconSuffix [for]="legacyPicker" />
          <mat-datepicker #legacyPicker />
          <mat-hint>ปล่อยว่างได้ถ้ายังไม่มีข้อมูลระบบเก่า</mat-hint>
        </mat-form-field>

        <mat-divider />

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

        <!-- เลขที่เอกสาร — edit only: สำหรับโครงการที่สร้างผ่าน import จะไม่มี series -->
        @if (data.mode === 'edit') {
          <div class="border border-slate-200 rounded-md p-3 bg-slate-50/50">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1">
                <div class="text-sm font-medium text-slate-700">เลขที่เอกสารอัตโนมัติ</div>
                <div class="text-xs text-slate-500 mt-0.5">
                  สร้างชุดเลข SO / BM / BL / UA ที่ยังขาด — ใช้สำหรับโครงการที่สร้างผ่าน import
                </div>
              </div>
              <button mat-stroked-button type="button"
                      [disabled]="provisioning()"
                      (click)="provisionSeries()">
                @if (provisioning()) {
                  <mat-spinner diameter="16" class="!inline-block mr-1" />
                  กำลังสร้าง…
                } @else {
                  สร้างเลขที่เอกสาร
                }
              </button>
            </div>
          </div>
        }

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

  private numberSeriesSvc = inject(NumberSeriesService);
  private snack = inject(MatSnackBar);

  saving       = signal(false);
  provisioning = signal(false);
  serverError  = signal<string | null>(null);

  private fb = inject(FormBuilder);

  form = this.fb.group({
    code:         [this.data.project?.code ?? '', [Validators.required, Validators.pattern(/^[A-Za-z0-9\-_]+$/)]],
    name:         [this.data.project?.name ?? '', Validators.required],
    project_type: [this.data.project?.project_type ?? '', Validators.required],
    status:       [this.data.project?.status ?? 'active'],
    location:     [this.data.project?.location ?? ''],
    pool_budget_amount:  [this.data.project?.pool_budget_amount ?? 0, Validators.min(0)],
    approved_project_value: [this.data.project?.approved_project_value ?? null, Validators.min(0)],
    common_fee_rate:     [this.data.project?.common_fee_rate ?? 0, Validators.min(0)],
    electric_meter_fee:  [this.data.project?.electric_meter_fee ?? 0, Validators.min(0)],
    water_meter_fee:     [this.data.project?.water_meter_fee ?? 0, Validators.min(0)],
    // ข้อมูลระบบเก่า สำหรับ Dashboard
    legacy_sold_units:              [this.data.project?.legacy_sold_units ?? 0],
    legacy_sold_net_price:          [this.data.project?.legacy_sold_net_price ?? 0],
    legacy_total_discount_amount:   [this.data.project?.legacy_total_discount_amount ?? 0],
    legacy_value_achieved:          [this.data.project?.legacy_value_achieved ?? 0],
    legacy_dashboard_as_of_date:    [
      this.data.project?.legacy_dashboard_as_of_date
        ? new Date(this.data.project.legacy_dashboard_as_of_date)
        : null as Date | null,
    ],
    approval_required:   [!!Number(this.data.project?.approval_required)],
    allow_over_budget:   [!!Number(this.data.project?.allow_over_budget)],
  });

  /** แปลง Date object → 'YYYY-MM-DD' หรือ null */
  private formatDate(d: Date | null | undefined): string | null {
    if (!d) return null;
    const val: unknown = d;
    const asAny = val as Record<string, () => number>;
    const year  = typeof asAny['year']  === 'function' ? asAny['year']()  : (d as Date).getFullYear();
    const month = typeof asAny['month'] === 'function' ? asAny['month']() + 1 : (d as Date).getMonth() + 1;
    const day   = typeof asAny['date']  === 'function' ? asAny['date']()  : (d as Date).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.serverError.set(null);

    const val = this.form.value;
    const legacyAsOfDate = this.formatDate(val.legacy_dashboard_as_of_date as Date | null | undefined);

    const obs = this.data.mode === 'create'
      ? this.api.createProject({
          code:               val.code!,
          name:               val.name!,
          project_type:       val.project_type!,
          location:           val.location || undefined,
          pool_budget_amount: val.pool_budget_amount ?? 0,
          approved_project_value: val.approved_project_value ?? null,
          common_fee_rate:    val.common_fee_rate ?? 0,
          electric_meter_fee: val.electric_meter_fee ?? 0,
          water_meter_fee:    val.water_meter_fee ?? 0,
          approval_required:  !!val.approval_required,
          allow_over_budget:  !!val.allow_over_budget,
          legacy_sold_units:             val.legacy_sold_units ?? 0,
          legacy_sold_net_price:         val.legacy_sold_net_price ?? 0,
          legacy_total_discount_amount:  val.legacy_total_discount_amount ?? 0,
          legacy_value_achieved:         val.legacy_value_achieved ?? 0,
          legacy_dashboard_as_of_date:   legacyAsOfDate,
        })
      : this.api.updateProject(this.data.project!.id, {
          name:               val.name!,
          project_type:       val.project_type!,
          status:             val.status!,
          location:           val.location || undefined,
          pool_budget_amount: val.pool_budget_amount ?? 0,
          approved_project_value: val.approved_project_value ?? null,
          common_fee_rate:    val.common_fee_rate ?? 0,
          electric_meter_fee: val.electric_meter_fee ?? 0,
          water_meter_fee:    val.water_meter_fee ?? 0,
          approval_required:  !!val.approval_required,
          allow_over_budget:  !!val.allow_over_budget,
          legacy_sold_units:             val.legacy_sold_units ?? 0,
          legacy_sold_net_price:         val.legacy_sold_net_price ?? 0,
          legacy_total_discount_amount:  val.legacy_total_discount_amount ?? 0,
          legacy_value_achieved:         val.legacy_value_achieved ?? 0,
          legacy_dashboard_as_of_date:   legacyAsOfDate,
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

  provisionSeries(): void {
    const id = this.data.project?.id;
    if (!id || this.provisioning()) return;
    this.provisioning.set(true);

    this.numberSeriesSvc.provision(id).subscribe({
      next: res => {
        this.provisioning.set(false);
        const msg = res.created === 0
          ? 'มีเลขที่เอกสารครบแล้ว ไม่ต้องสร้างเพิ่ม'
          : `สร้างเลขที่เอกสาร ${res.created} รายการ: ${res.types.join(', ')}`;
        this.snack.open(msg, 'ปิด', { duration: 4000 });
      },
      error: err => {
        this.provisioning.set(false);
        const errMsg = err?.error?.error ?? 'สร้างเลขที่เอกสารไม่สำเร็จ';
        this.snack.open(errMsg, 'ปิด', { duration: 5000 });
      },
    });
  }
}
