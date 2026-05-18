import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { LegacyReconciliation, LegacyReconciliationService } from '../services/legacy-reconciliation.service';

export interface LegacyReconciliationDialogData {
  projectId: number;
  current: LegacyReconciliation | null;
  isAdmin: boolean;
}

@Component({
  selector: 'app-legacy-reconciliation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    CurrencyMaskDirective,
    SvgIconComponent,
  ],
  template: `
    <h2 mat-dialog-title class="flex items-center gap-2">
      <app-icon name="arrows-right-left" class="w-5 h-5 text-primary-500" />
      กระทบยอดระบบเก่า
    </h2>

    <mat-dialog-content style="max-height: 80vh; min-width: 480px">
      <div class="flex flex-col gap-4 py-2">

        <!-- คำอธิบาย -->
        <div class="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
          กรอกตัวเลขจากระบบเก่า เพื่อเปรียบเทียบกับยอดจริงในระบบนี้
        </div>

        <form [formGroup]="form" class="flex flex-col gap-4">

          <!-- ─── Section 1: ค่าสำหรับหน้า รายการขาย ────────────────────── -->
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide -mb-2">
            ค่าสำหรับหน้า รายการขาย
          </p>

          <!-- งบคงเหลือรวม X (ระบบเก่า) -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>งบคงเหลือรวม X (ระบบเก่า)</mat-label>
            <input matInput
                   currencyMask
                   [options]="{ allowNegative: true }"
                   formControlName="legacy_total_budget_remaining"
                   class="text-right font-mono tabular-nums" />
            <span matTextPrefix class="text-slate-400 mr-1">฿</span>
            <mat-error>กรุณาระบุงบคงเหลือรวม</mat-error>
          </mat-form-field>

          <!-- กำไร Y (ระบบเก่า) -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>กำไร Y (ระบบเก่า)</mat-label>
            <input matInput
                   currencyMask
                   [options]="{ allowNegative: true }"
                   formControlName="legacy_total_profit"
                   class="text-right font-mono tabular-nums" />
            <span matTextPrefix class="text-slate-400 mr-1">฿</span>
            <mat-error>กรุณาระบุกำไร</mat-error>
          </mat-form-field>

          <mat-divider />

          <!-- ─── Section 2: ค่าสำหรับหน้า Dashboard ─────────────────────── -->
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide -mb-2">
            ค่าสำหรับหน้า Dashboard
          </p>

          <!-- จำนวนยูนิตที่ขายไปแล้ว (ระบบเก่า) -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>จำนวนยูนิตที่ขายไปแล้ว (ระบบเก่า)</mat-label>
            <input matInput
                   currencyMask
                   [options]="{ precision: 0, allowNegative: false }"
                   formControlName="legacy_sold_units"
                   class="text-right font-mono tabular-nums" />
            <mat-hint>จำนวนเต็ม ≥ 0</mat-hint>
            <mat-error>กรุณาระบุจำนวนยูนิต</mat-error>
          </mat-form-field>

          <!-- มูลค่าขายสุทธิระบบเก่า -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>มูลค่าขายสุทธิระบบเก่า</mat-label>
            <input matInput
                   currencyMask
                   [options]="{ allowNegative: true }"
                   formControlName="legacy_sold_net_price"
                   class="text-right font-mono tabular-nums" />
            <span matTextPrefix class="text-slate-400 mr-1">฿</span>
            <mat-error>กรุณาระบุมูลค่าขายสุทธิ</mat-error>
          </mat-form-field>

          <!-- มูลค่าส่วนลดรวมระบบเก่า -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>มูลค่าส่วนลดรวมระบบเก่า</mat-label>
            <input matInput
                   currencyMask
                   [options]="{ allowNegative: true }"
                   formControlName="legacy_total_discount_amount"
                   class="text-right font-mono tabular-nums" />
            <span matTextPrefix class="text-slate-400 mr-1">฿</span>
            <mat-error>กรุณาระบุมูลค่าส่วนลดรวม</mat-error>
          </mat-form-field>

          <!-- มูลค่าโครงการที่ทำได้ระบบเก่า -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>มูลค่าโครงการที่ทำได้ระบบเก่า</mat-label>
            <input matInput
                   currencyMask
                   [options]="{ allowNegative: true }"
                   formControlName="legacy_value_achieved"
                   class="text-right font-mono tabular-nums" />
            <span matTextPrefix class="text-slate-400 mr-1">฿</span>
            <mat-error>กรุณาระบุมูลค่าโครงการที่ทำได้</mat-error>
          </mat-form-field>

          <mat-divider />

          <!-- ณ วันที่ -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>ณ วันที่</mat-label>
            <input matInput [matDatepicker]="picker" formControlName="as_of_date" [max]="today" required />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
            <mat-error>กรุณาระบุวันที่</mat-error>
          </mat-form-field>

          <!-- หมายเหตุ -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>หมายเหตุ (ไม่บังคับ)</mat-label>
            <textarea matInput formControlName="note" rows="2" maxlength="500"></textarea>
            <mat-hint align="end">{{ form.get('note')?.value?.length ?? 0 }}/500</mat-hint>
          </mat-form-field>

        </form>

        <!-- Error message -->
        @if (errorMsg()) {
          <div class="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {{ errorMsg() }}
          </div>
        }

      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="gap-2 px-6 pb-4">
      <!-- ปุ่มลบ (เฉพาะ admin และมีข้อมูลอยู่แล้ว) -->
      @if (data.isAdmin && data.current) {
        <button mat-stroked-button color="warn" (click)="onDelete()" [disabled]="saving()">
          @if (saving() && deleteMode()) {
            <mat-spinner diameter="16" class="inline-block mr-1" />
          } @else {
            <app-icon name="trash" class="w-4 h-4 mr-1" />
          }
          ลบข้อมูล
        </button>
      }
      <span class="flex-1"></span>
      <button mat-button mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button mat-flat-button color="primary" (click)="onSave()"
              [disabled]="saving() || form.invalid">
        @if (saving() && !deleteMode()) {
          <mat-spinner diameter="18" class="inline-block mr-1" />
        }
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
})
export class LegacyReconciliationDialogComponent {
  private fb = inject(FormBuilder);
  private legacySvc = inject(LegacyReconciliationService);
  readonly dialogRef = inject(MatDialogRef<LegacyReconciliationDialogComponent>);
  readonly data: LegacyReconciliationDialogData = inject(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly deleteMode = signal(false);
  readonly errorMsg = signal('');
  readonly today = new Date();

  form = this.fb.group({
    legacy_total_budget_remaining: [
      this.data.current?.legacy_total_budget_remaining ?? null as number | null,
      Validators.required,
    ],
    legacy_total_profit: [
      this.data.current?.legacy_total_profit ?? null as number | null,
      Validators.required,
    ],
    legacy_sold_units: [
      this.data.current?.legacy_sold_units ?? 0,
      Validators.required,
    ],
    legacy_sold_net_price: [
      this.data.current?.legacy_sold_net_price ?? 0,
      Validators.required,
    ],
    legacy_total_discount_amount: [
      this.data.current?.legacy_total_discount_amount ?? 0,
      Validators.required,
    ],
    legacy_value_achieved: [
      this.data.current?.legacy_value_achieved ?? 0,
      Validators.required,
    ],
    as_of_date: [
      this.data.current?.as_of_date ? new Date(this.data.current.as_of_date) : null as Date | null,
      Validators.required,
    ],
    note: [this.data.current?.note ?? ''],
  });

  onSave(): void {
    if (this.form.invalid) return;

    const raw = this.form.value;

    // แปลง Date → 'YYYY-MM-DD'
    const d: Date | null = raw.as_of_date as Date | null;
    if (!d) return;

    const asOfDate = this.formatDate(d);

    this.saving.set(true);
    this.deleteMode.set(false);
    this.errorMsg.set('');

    this.legacySvc.save(this.data.projectId, {
      legacy_total_budget_remaining: raw.legacy_total_budget_remaining ?? 0,
      legacy_total_profit: raw.legacy_total_profit ?? 0,
      legacy_sold_units: raw.legacy_sold_units ?? 0,
      legacy_sold_net_price: raw.legacy_sold_net_price ?? 0,
      legacy_total_discount_amount: raw.legacy_total_discount_amount ?? 0,
      legacy_value_achieved: raw.legacy_value_achieved ?? 0,
      as_of_date: asOfDate,
      note: raw.note || null,
    }).subscribe({
      next: result => {
        this.saving.set(false);
        this.dialogRef.close({ saved: true, data: result });
      },
      error: err => {
        this.saving.set(false);
        this.errorMsg.set(err.error?.error || err.error?.message || 'เกิดข้อผิดพลาด');
      },
    });
  }

  onDelete(): void {
    if (!this.data.isAdmin) return;

    this.saving.set(true);
    this.deleteMode.set(true);
    this.errorMsg.set('');

    this.legacySvc.delete(this.data.projectId).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogRef.close({ deleted: true });
      },
      error: err => {
        this.saving.set(false);
        this.errorMsg.set(err.error?.error || err.error?.message || 'เกิดข้อผิดพลาด');
      },
    });
  }

  private formatDate(d: Date): string {
    const val: unknown = d;
    // รองรับทั้ง native Date และ Moment object
    const asAny = val as Record<string, () => number>;
    const year = typeof asAny['year'] === 'function' ? asAny['year']() : (d as Date).getFullYear();
    const month = typeof asAny['month'] === 'function'
      ? asAny['month']() + 1
      : (d as Date).getMonth() + 1;
    const day = typeof asAny['date'] === 'function' ? asAny['date']() : (d as Date).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}
