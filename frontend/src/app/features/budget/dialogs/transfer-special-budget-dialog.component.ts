import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { BudgetService } from '../services/budget.service';
import { UnitApiService, Unit } from '../../master-data/units/unit-api.service';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';

export interface TransferSpecialBudgetDialogData {
  from_unit_id: number;
  from_unit_code: string;
  budget_source_type: string;
  budget_source_label: string;
  remaining: number;
  project_id: number;
}

@Component({
  selector: 'app-transfer-special-budget-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatAutocompleteModule,
    MatProgressSpinnerModule, CurrencyMaskDirective, MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">โอนงบพิเศษ</h2>

    <mat-dialog-content class="!max-h-[75vh]">
      <div class="flex flex-col gap-4 py-2 min-w-[380px]">

        <!-- ข้อมูลต้นทาง -->
        <div class="grid grid-cols-3 gap-3 text-sm">
          <div>
            <span class="text-slate-500 block">จาก</span>
            <span class="font-medium text-slate-800">{{ data.from_unit_code }}</span>
          </div>
          <div>
            <span class="text-slate-500 block">แหล่งงบ</span>
            <span class="font-medium text-slate-800">{{ data.budget_source_label }}</span>
          </div>
          <div>
            <span class="text-slate-500 block">คงเหลือ</span>
            <span class="font-bold text-green-700">{{ fmtCurrency(data.remaining) }}</span>
          </div>
        </div>

        <!-- โอนไปยังยูนิต -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>โอนไปยังยูนิต</mat-label>
          <input matInput [formControl]="unitSearchControl"
                 [matAutocomplete]="unitAuto"
                 placeholder="ค้นหายูนิต...">
          <mat-autocomplete #unitAuto="matAutocomplete"
                            [displayWith]="displayUnit"
                            (optionSelected)="onUnitSelected($event.option.value)">
            @for (u of filteredUnits(); track u.id) {
              <mat-option [value]="u">{{ u.unit_code }}</mat-option>
            }
          </mat-autocomplete>
          @if (unitSearchControl.hasError('required') && unitSearchControl.touched) {
            <mat-error>กรุณาเลือกยูนิตปลายทาง</mat-error>
          }
        </mat-form-field>

        <!-- จำนวนเงิน -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>จำนวนเงิน</mat-label>
          <span matTextPrefix class="pl-1 text-slate-500">฿&nbsp;</span>
          <input matInput currencyMask [formControl]="amountControl">
          <mat-hint>สูงสุด: {{ fmtCurrency(data.remaining) }}</mat-hint>
          @if (amountControl.hasError('required')) {
            <mat-error>กรุณากรอกจำนวนเงิน</mat-error>
          }
          @if (amountControl.hasError('min')) {
            <mat-error>จำนวนเงินต้องมากกว่า 0</mat-error>
          }
          @if (amountControl.hasError('max')) {
            <mat-error>จำนวนเงินเกินงบคงเหลือ (สูงสุด {{ fmtCurrency(data.remaining) }})</mat-error>
          }
        </mat-form-field>

        <!-- หมายเหตุ -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput [formControl]="noteControl" rows="3"
                    placeholder="ระบุเหตุผลในการโอนงบ..."></textarea>
          @if (noteControl.hasError('required')) {
            <mat-error>กรุณาระบุหมายเหตุ</mat-error>
          }
        </mat-form-field>

        <!-- สรุป -->
        @if (selectedUnit() && amountControl.valid && amountControl.value) {
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p class="text-sm text-blue-800">
              <span class="font-semibold">สรุป:</span>
              โอน {{ fmtCurrency(amountControl.value!) }}
              จาก {{ data.from_unit_code }} → {{ selectedUnit()!.unit_code }}
            </p>
          </div>
        }

        <!-- Server error -->
        @if (errorMsg()) {
          <div class="text-sm text-red-600 bg-red-50 p-3 rounded">{{ errorMsg() }}</div>
        }
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button mat-dialog-close [disabled]="saving()">ปิด</button>
      <button mat-flat-button color="primary" (click)="submit()"
              [disabled]="saving() || !isFormValid()">
        @if (saving()) {
          <mat-spinner diameter="18" class="!inline-block mr-1"></mat-spinner>
        }
        ยืนยันโอนงบ
      </button>
    </mat-dialog-actions>
  `,
})
export class TransferSpecialBudgetDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<TransferSpecialBudgetDialogComponent>);
  private budgetSvc = inject(BudgetService);
  private unitApi = inject(UnitApiService);
  private snackBar = inject(MatSnackBar);
  readonly data: TransferSpecialBudgetDialogData = inject(MAT_DIALOG_DATA);

  saving = signal(false);
  errorMsg = signal('');
  selectedUnit = signal<Unit | null>(null);
  allUnits = signal<Unit[]>([]);

  unitSearchControl = new FormControl<string | Unit>('', Validators.required);
  amountControl = this.fb.control<number | null>(null, [
    Validators.required,
    Validators.min(1),
    Validators.max(this.data.remaining),
  ]);
  noteControl = this.fb.control('', Validators.required);

  filteredUnits = computed(() => {
    const search = this.unitSearchText();
    const units = this.allUnits().filter(u => u.id !== this.data.from_unit_id);
    if (!search) return units;
    const lower = search.toLowerCase();
    return units.filter(u => u.unit_code.toLowerCase().includes(lower));
  });

  private unitSearchText = signal('');

  ngOnInit(): void {
    // โหลดรายการยูนิตในโครงการเดียวกัน
    this.unitApi.getList(this.data.project_id).subscribe({
      next: units => this.allUnits.set(units),
    });

    // ติดตาม search input
    this.unitSearchControl.valueChanges.subscribe(val => {
      if (typeof val === 'string') {
        this.unitSearchText.set(val);
        this.selectedUnit.set(null);
      }
    });
  }

  displayUnit = (u: Unit | string): string => {
    if (!u) return '';
    if (typeof u === 'string') return u;
    return u.unit_code;
  };

  onUnitSelected(unit: Unit): void {
    this.selectedUnit.set(unit);
  }

  isFormValid(): boolean {
    return !!this.selectedUnit() && this.amountControl.valid && !!this.amountControl.value && this.noteControl.valid && !!this.noteControl.value;
  }

  fmtCurrency(v: number): string {
    return '฿' + (v ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  submit(): void {
    this.amountControl.markAsTouched();
    this.noteControl.markAsTouched();
    this.unitSearchControl.markAsTouched();

    if (!this.isFormValid()) return;

    const unit = this.selectedUnit()!;
    const amount = this.amountControl.value!;

    this.saving.set(true);
    this.errorMsg.set('');

    this.budgetSvc.transferSpecialBudget({
      from_unit_id: this.data.from_unit_id,
      to_unit_id: unit.id,
      budget_source_type: this.data.budget_source_type as any,
      amount,
      note: this.noteControl.value!,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        const amtStr = amount.toLocaleString('th-TH');
        this.snackBar.open(
          `โอนงบสำเร็จ — ฿${amtStr} จาก ${this.data.from_unit_code} → ${unit.unit_code}`,
          'ปิด', { duration: 5000 }
        );
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(err?.error?.error || 'เกิดข้อผิดพลาดในการโอนงบ');
      },
    });
  }
}
