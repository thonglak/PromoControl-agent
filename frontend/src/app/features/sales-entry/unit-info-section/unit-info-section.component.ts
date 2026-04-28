import { Component, inject, ElementRef, signal, computed, output, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
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
    MatFormFieldModule, MatInputModule, MatSelectModule, MatAutocompleteModule,
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
          <input matInput
            [formControl]="unitSearchControl"
            [matAutocomplete]="unitAuto"
            placeholder="เลือกยูนิต"
            (input)="unitSearchText.set(unitSearchControl.value ?? '')"
            (blur)="onUnitSearchBlur()">
          <mat-autocomplete #unitAuto="matAutocomplete"
            [displayWith]="displayUnit.bind(this)"
            (optionSelected)="onUnitOptionSelected($event.option.value)">
            @for (unit of autocompleteFilteredUnits(); track unit.id) {
              <mat-option [value]="unit.id">
                {{ unit.unit_code }}@if (unit.house_model_name) { — {{ unit.house_model_name }} }
              </mat-option>
            }
          </mat-autocomplete>
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

      </div>

      @if (selectedUnit(); as unit) {
        <div class="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
          <span>งบยูนิต: <strong class="text-slate-700">฿{{ unit.standard_budget | number:'1.0-0' }}</strong></span>
          @if (unit.house_model_name) {
            <span>แบบบ้าน: <strong class="text-slate-700">{{ unit.house_model_name }}</strong></span>
          }
          @if (unit.area_sqm) {
            <span>พื้นที่: <strong class="text-slate-700">{{ unit.area_sqm | number:'1.2-2' }} ตร.ม.</strong></span>
          }
          @if (unit.land_area_sqw && !isCondo()) {
            <span>ที่ดิน: <strong class="text-slate-700">{{ unit.land_area_sqw | number:'1.2-2' }} ตร.ว.</strong></span>
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
  /** Text input control for the autocomplete field — value is display string, not unit ID */
  unitSearchControl = this.fb.control<string>('');
  saleDateControl = this.fb.control<Date>(new Date(), { nonNullable: true });

  // Signals
  readonly units = signal<Unit[]>([]);
  readonly selectedUnit = signal<Unit | null>(null);
  readonly loading = signal(false);
  readonly allowSoldUnit = signal(false);
  /** ข้อความที่ผู้ใช้พิมพ์เพื่อค้นหายูนิต */
  readonly unitSearchText = signal<string>('');

  readonly projectName = computed(() => this.project.selectedProject()?.name ?? '');
  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));
  readonly isCondo = computed(() => (this.project.selectedProject() as any)?.project_type === 'condo');

  /** กรองตามสถานะ (available / reserved / sold ถ้าอนุญาต) */
  readonly filteredUnits = computed(() =>
    this.units().filter(u =>
      u.status === 'available' || u.status === 'reserved' ||
      (this.allowSoldUnit() && u.status === 'sold')
    )
  );

  /** กรองซ้อนทับด้วยข้อความที่พิมพ์ — ใช้กับ autocomplete */
  readonly autocompleteFilteredUnits = computed(() => {
    const text = this.unitSearchText().toLowerCase().trim();
    if (!text) return this.filteredUnits();
    return this.filteredUnits().filter(u =>
      u.unit_code.toLowerCase().includes(text) ||
      (u.house_model_name ?? '').toLowerCase().includes(text)
    );
  });

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.loadUnits();

    // เมื่อเปลี่ยนวันที่ขาย
    this.subs.push(
      this.saleDateControl.valueChanges.subscribe(date => {
        if (date) {
          this.saleDateChanged.emit(this.formatDate(date));
        }
      })
    );

    // ซิงค์ disabled state จาก unitControl ไปยัง unitSearchControl
    this.subs.push(
      this.unitControl.statusChanges.subscribe(() => {
        if (this.unitControl.disabled) {
          this.unitSearchControl.disable({ emitEvent: false });
        } else {
          this.unitSearchControl.enable({ emitEvent: false });
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /** แสดงข้อความใน input จาก unit ID — ใช้กับ [displayWith] ของ mat-autocomplete */
  displayUnit(unitId: number | string | null): string {
    if (unitId == null) return '';
    const unit = this.units().find(u => String(u.id) === String(unitId));
    if (!unit) return '';
    return unit.house_model_name
      ? `${unit.unit_code} — ${unit.house_model_name}`
      : unit.unit_code;
  }

  /** เรียกเมื่อผู้ใช้เลือก option จาก autocomplete */
  onUnitOptionSelected(unitId: number): void {
    this.unitControl.setValue(unitId);
    this.unitSearchText.set('');
    const unit = this.units().find(u => String(u.id) === String(unitId)) ?? null;
    this.selectedUnit.set(unit);
    this.unitSelected.emit(unit);
  }

  /** เมื่อ input เสียโฟกัส ถ้าไม่มีค่าที่ถูกต้องให้ล้างฟิลด์ */
  onUnitSearchBlur(): void {
    const currentId = this.unitControl.value;
    if (currentId == null) {
      this.unitSearchControl.setValue('', { emitEvent: false });
    }
  }

  /** โหลด units สำหรับ project ที่ระบุ (ใช้ใน edit mode) */
  loadUnitsForProject(projectId: number): Promise<void> {
    return new Promise((resolve) => {
      this.loading.set(true);
      this.unitApi.getList(projectId).subscribe({
        next: data => {
          this.units.set(data);
          this.loading.set(false);
          // หลังโหลดข้อมูล ให้ซิงค์ selectedUnit + display text + emit event สำหรับ edit mode
          const currentId = this.unitControl.value;
          if (currentId != null) {
            // unit.id จาก API อาจเป็น string — ใช้ == เพื่อ match ทั้ง string/number
            const unit = data.find(u => String(u.id) === String(currentId)) ?? null;
            this.selectedUnit.set(unit);
            if (unit) {
              const display = unit.house_model_name
                ? `${unit.unit_code} — ${unit.house_model_name}`
                : unit.unit_code;
              this.unitSearchControl.setValue(display, { emitEvent: false });
            }
            this.unitSelected.emit(unit);
          }
          resolve();
        },
        error: () => { this.loading.set(false); resolve(); },
      });
    });
  }

  private loadUnits(): void {
    // ถ้ามี unit ที่เลือกไว้แล้ว (edit mode) ไม่ต้องโหลดซ้ำ — loadUnitsForProject จัดการเอง
    if (this.unitControl.value != null) return;
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

  getFormValues(): { sale_date: string } {
    return {
      sale_date: this.getSaleDate(),
    };
  }

  isValid(): boolean {
    const valid = !!this.selectedUnit();
    if (!valid) {
      this.focusFirstInvalid();
    }
    return valid;
  }

  private focusFirstInvalid(): void {
    setTimeout(() => {
      const el = this.el.nativeElement.querySelector('.mat-form-field-invalid input, .ng-invalid input');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
