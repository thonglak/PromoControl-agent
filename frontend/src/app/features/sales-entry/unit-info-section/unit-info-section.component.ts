import { Component, inject, ElementRef, signal, computed, output, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Subscription } from 'rxjs';

import { ProjectService } from '../../../core/services/project.service';
import { UnitApiService, Unit } from '../../master-data/units/unit-api.service';

/** แปลง Date หรือ Moment → YYYY-MM-DD string */
function toISODateStr(d: any): string {
  if (!d) return '';
  const y = typeof d.year === 'function' ? d.year() : d.getFullYear();
  const m = String((typeof d.month === 'function' ? d.month() : d.getMonth()) + 1).padStart(2, '0');
  const dd = String(typeof d.date === 'function' ? d.date() : d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

@Component({
  selector: 'app-unit-info-section',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule,
  ],
  template: `
    <div class="section-card">
      <h3 class="text-sm font-semibold mb-4" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">ข้อมูลยูนิต</h3>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- โครงการ -->
        <mat-form-field appearance="outline" class="w-full readonly-field">
          <mat-label>โครงการ</mat-label>
          <input matInput [value]="projectName()" readonly>
        </mat-form-field>

        <!-- ยูนิต -->
        <mat-form-field appearance="outline" class="w-full" [class.readonly-field]="unitControl.disabled">
          <mat-label>ยูนิต</mat-label>
          <mat-select [formControl]="unitControl" placeholder="เลือกยูนิต">
            @for (unit of filteredUnits(); track unit.id) {
              <mat-option [value]="unit.id">
                {{ unit.unit_code }}
                @if (unit.house_model_name) { — {{ unit.house_model_name }} }
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <!-- วันที่ขาย -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>วันที่ขาย</mat-label>
          <input matInput [matDatepicker]="picker" [formControl]="saleDateControl">
          <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
        </mat-form-field>

        <!-- ราคาขาย -->
        <mat-form-field appearance="outline" class="w-full readonly-field">
          <mat-label>ราคาขาย (Base Price)</mat-label>
          <input matInput [value]="selectedUnit()?.base_price | number:'1.0-0'" readonly>
          <span matTextPrefix>฿&nbsp;</span>
        </mat-form-field>

        <!-- ต้นทุน -->
        <mat-form-field appearance="outline" class="w-full readonly-field">
          <mat-label>ต้นทุน (Unit Cost)</mat-label>
          <input matInput [value]="selectedUnit()?.unit_cost | number:'1.0-0'" readonly>
          <span matTextPrefix>฿&nbsp;</span>
        </mat-form-field>

        <!-- ราคาประเมิน -->
        <mat-form-field appearance="outline" class="w-full readonly-field">
          <mat-label>ราคาประเมิน</mat-label>
          <input matInput
            [value]="selectedUnit()?.appraisal_price != null
              ? (selectedUnit()!.appraisal_price | number:'1.0-0')
              : 'ยังไม่มีราคาประเมิน'"
            readonly
            [class.text-amber-600]="selectedUnit() && selectedUnit()!.appraisal_price == null">
          @if (selectedUnit()?.appraisal_price != null) {
            <span matTextPrefix>฿&nbsp;</span>
          }
        </mat-form-field>

        <!-- ชื่อลูกค้า -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>ชื่อลูกค้า</mat-label>
          <input matInput [formControl]="customerNameControl" placeholder="กรอกชื่อลูกค้า">
          @if (customerNameControl.hasError('required') && customerNameControl.touched) {
            <mat-error>กรุณากรอกชื่อลูกค้า</mat-error>
          }
        </mat-form-field>

        <!-- พนักงานขาย -->
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>พนักงานขาย</mat-label>
          <input matInput [formControl]="salespersonControl" placeholder="กรอกชื่อพนักงานขาย">
          @if (salespersonControl.hasError('required') && salespersonControl.touched) {
            <mat-error>กรุณากรอกชื่อพนักงานขาย</mat-error>
          }
        </mat-form-field>
      </div>

      @if (selectedUnit(); as unit) {
        <div class="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
          <span>งบยูนิต: <strong class="text-slate-700">฿{{ unit.standard_budget | number:'1.0-0' }}</strong></span>
          @if (unit.house_model_name) {
            <span>แบบบ้าน: <strong class="text-slate-700">{{ unit.house_model_name }}</strong></span>
          }
          <span>สถานะ:
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
              [class]="statusClass(unit.status)">
              {{ statusLabel(unit.status) }}
            </span>
          </span>
        </div>
      }
    </div>
  `,
})
export class UnitInfoSectionComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private el = inject(ElementRef);
  private project = inject(ProjectService);
  private unitApi = inject(UnitApiService);

  // Outputs
  unitSelected = output<Unit | null>();
  saleDateChanged = output<string>();

  // Form controls
  unitControl = this.fb.control<number | null>(null);
  saleDateControl = this.fb.control<Date>(new Date(), { nonNullable: true });
  customerNameControl = this.fb.control('', [Validators.required]);
  salespersonControl = this.fb.control('', [Validators.required]);

  // Signals
  readonly units = signal<Unit[]>([]);
  readonly selectedUnit = signal<Unit | null>(null);
  readonly loading = signal(false);
  readonly allowSoldUnit = signal(false);

  readonly projectName = computed(() => this.project.selectedProject()?.name ?? '');
  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  readonly filteredUnits = computed(() =>
    this.units().filter(u =>
      u.status === 'available' || u.status === 'reserved' ||
      (this.allowSoldUnit() && u.status === 'sold')
    )
  );

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.loadUnits();

    // เมื่อเปลี่ยนยูนิต
    this.subs.push(
      this.unitControl.valueChanges.subscribe(unitId => {
        const unit = this.units().find(u => u.id === unitId) ?? null;
        this.selectedUnit.set(unit);
        this.unitSelected.emit(unit);
      })
    );

    // เมื่อเปลี่ยนวันที่ขาย
    this.subs.push(
      this.saleDateControl.valueChanges.subscribe(date => {
        if (date) {
          this.saleDateChanged.emit(this.formatDate(date));
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /** โหลด units สำหรับ project ที่ระบุ (ใช้ใน edit mode) */
  loadUnitsForProject(projectId: number): Promise<void> {
    return new Promise((resolve) => {
      this.loading.set(true);
      this.unitApi.getList(projectId).subscribe({
        next: data => { this.units.set(data); this.loading.set(false); resolve(); },
        error: () => { this.loading.set(false); resolve(); },
      });
    });
  }

  private loadUnits(): void {
    const pid = this.projectId();
    if (pid <= 0) return;
    this.loading.set(true);
    this.unitApi.getList(pid).subscribe({
      next: data => { this.units.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  formatDate(date: any): string {
    return toISODateStr(date);
  }

  getSaleDate(): string {
    return this.formatDate(this.saleDateControl.value);
  }

  getFormValues(): { customer_name: string; salesperson: string; sale_date: string } {
    return {
      customer_name: this.customerNameControl.value ?? '',
      salesperson: this.salespersonControl.value ?? '',
      sale_date: this.getSaleDate(),
    };
  }

  isValid(): boolean {
    this.customerNameControl.markAsTouched();
    this.salespersonControl.markAsTouched();
    const valid = !!this.selectedUnit() && this.customerNameControl.valid && this.salespersonControl.valid;
    if (!valid) {
      this.focusFirstInvalid();
    }
    return valid;
  }

  private focusFirstInvalid(): void {
    setTimeout(() => {
      const el = this.el.nativeElement.querySelector('.mat-form-field-invalid input, .mat-form-field-invalid mat-select, .ng-invalid input, .ng-invalid mat-select');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }, 100);
  }

  statusClass(status: string): string {
    switch (status) {
      case 'available': return 'bg-blue-100 text-blue-700';
      case 'reserved': return 'bg-amber-100 text-amber-700';
      case 'sold': return 'bg-green-100 text-green-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'available': return 'ว่าง';
      case 'reserved': return 'จอง';
      case 'sold': return 'ขายแล้ว';
      case 'transferred': return 'โอนแล้ว';
      default: return status;
    }
  }
}
