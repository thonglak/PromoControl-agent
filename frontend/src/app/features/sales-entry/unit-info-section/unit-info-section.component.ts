import { Component, inject, ElementRef, signal, computed, output, input, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';

import { ProjectService } from '../../../core/services/project.service';
import { UnitApiService, Unit } from '../../master-data/units/unit-api.service';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';

export type AdditionalExpenseMode = 'add_to_net' | 'as_premium';

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
    MatDatepickerModule, MatRadioModule, MatTooltipModule,
    CurrencyMaskDirective,
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

        <!-- ราคาหน้าสัญญา (auto-fill จากราคาแนะนำ — แก้ไขได้) -->
        <div class="flex flex-col">
          <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
            <mat-label>ราคาหน้าสัญญา</mat-label>
            <input matInput currencyMask
              [formControl]="contractPriceControl"
              placeholder="0">
            <span matTextPrefix>฿&nbsp;</span>
            @if (contractPriceControl.touched && contractPriceControl.hasError('required')) {
              <mat-error>กรุณาระบุราคาหน้าสัญญา</mat-error>
            }
            @if (contractPriceControl.touched && contractPriceControl.hasError('min')) {
              <mat-error>ราคาหน้าสัญญาต้องมากกว่า 0</mat-error>
            }
          </mat-form-field>
          @if (showApplyRecommendedButton()) {
            <button type="button" class="text-xs mt-1 self-start hover:underline tabular-nums"
              style="color: var(--color-primary)"
              (click)="applyRecommendedContractPrice()">
              ↺ ใช้ราคาแนะนำ ฿{{ recommendedContractPrice() | number:'1.0-0' }}
            </button>
          }
        </div>

        <!-- ราคาขาย -->
        <mat-form-field appearance="outline" class="w-full readonly-field">
          <mat-label>ราคาขาย (Base Price)</mat-label>
          <input matInput class="num" [value]="selectedUnit()?.base_price | number:'1.0-0'" readonly>
          <span matTextPrefix>฿&nbsp;</span>
        </mat-form-field>

        <!-- ต้นทุน -->
        <mat-form-field appearance="outline" class="w-full readonly-field">
          <mat-label>ต้นทุน (Unit Cost)</mat-label>
          <input matInput class="num" [value]="selectedUnit()?.unit_cost | number:'1.0-0'" readonly>
          <span matTextPrefix>฿&nbsp;</span>
        </mat-form-field>

        <!-- ราคาประเมิน -->
        <mat-form-field appearance="outline" class="w-full readonly-field">
          <mat-label>ราคาประเมิน</mat-label>
          <input matInput
            [class.num]="selectedUnit()?.appraisal_price != null"
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

      <!-- ── ส่วนเสริม: ขอบวกเพิ่ม / ค่าใช้จ่ายบวกเพิ่ม ── -->
      <div class="mt-4 pt-4 border-t border-slate-200">
        <div class="text-xs font-medium mb-3" style="color: var(--color-text-secondary)">ส่วนเสริม (สำหรับยื่นกู้)</div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <!-- ขอบวกเพิ่ม -->
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>ขอบวกเพิ่ม (เพื่อยื่นกู้)</mat-label>
            <input matInput currencyMask
              [formControl]="loanMarkupControl"
              placeholder="0">
            <span matTextPrefix>฿&nbsp;</span>
            <mat-hint>ลูกค้าขอบวกเพิ่มในราคาสุทธิเพื่อยื่นกู้ — ไม่กระทบงบ/กำไรจริง</mat-hint>
          </mat-form-field>

          <!-- ค่าใช้จ่ายบวกเพิ่ม (auto-fill จาก system setting transfer_fee_percent — แก้ไขได้) -->
          <div class="flex flex-col">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>ค่าใช้จ่ายบวกเพิ่ม (ค่าธรรมเนียมโอน)</mat-label>
              <input matInput currencyMask
                [formControl]="additionalExpenseControl"
                placeholder="0">
              <span matTextPrefix>฿&nbsp;</span>
            </mat-form-field>

            <!-- คำอธิบายสูตรตามโหมด -->
            @if (transferFeePercent() > 0) {
              <p class="text-xs mt-1 leading-relaxed" style="color: var(--color-text-secondary)">
                @if (additionalExpenseModeControl.value === 'add_to_net') {
                  สูตร: (ราคาสุทธิยื่นกู้ − ราคาสุทธิ) × {{ transferFeePercent() }}%
                  <br>
                  <span style="color: var(--color-gray-500)">
                    = ขอบวกเพิ่ม × {{ transferFeePercent() }}% ÷ (100% − {{ transferFeePercent() }}%)
                    <span [matTooltip]="'mode บวกเข้าราคาขายสุทธิ → ค่าธรรมเนียมโอนถูกบวกเข้า ราคาสุทธิยื่นกู้ ด้วย → ผลต่างจึงรวมตัวมันเอง แก้สมการ closed-form'">
                      (ทำไม?)
                    </span>
                  </span>
                } @else {
                  สูตร: ขอบวกเพิ่ม × {{ transferFeePercent() }}%
                  <span style="color: var(--color-gray-500)" [matTooltip]="'mode ของแถมเพิ่มเติม → ค่าธรรมเนียมโอน ไม่อยู่ใน ราคาสุทธิยื่นกู้ → คิดตรงๆ จากขอบวกเพิ่ม'">
                    (ทำไม?)
                  </span>
                }
              </p>
            }

            @if (showApplyRecommendedAdditionalExpenseButton()) {
              <button type="button" class="text-xs mt-1 self-start hover:underline tabular-nums"
                style="color: var(--color-primary)"
                (click)="applyRecommendedAdditionalExpense()">
                ↺ ใช้ค่าเริ่มต้น ฿{{ recommendedAdditionalExpense() | number:'1.0-0' }}
              </button>
            }
          </div>
        </div>

        <!-- โหมดการคิดค่าธรรมเนียมโอน — แสดงเมื่อมีจำนวนเงิน -->
        @if ((additionalExpenseControl.value ?? 0) > 0) {
          <div class="mt-2 p-3 rounded" style="background-color: var(--color-primary-100)">
            <div class="text-xs font-medium mb-2" style="color: var(--color-text-primary)">วิธีคิดค่าธรรมเนียมโอน</div>
            <mat-radio-group class="flex flex-col gap-1" [formControl]="additionalExpenseModeControl">
              <mat-radio-button value="add_to_net" class="text-sm">
                บวกเข้าราคาขายสุทธิ (ลูกค้าจ่ายเอง)
              </mat-radio-button>
              <mat-radio-button value="as_premium" class="text-sm">
                ของแถมเพิ่มเติม (หักจากงบผู้บริหาร)
              </mat-radio-button>
            </mat-radio-group>
          </div>
        }
      </div>
    </div>
  `,
})
export class UnitInfoSectionComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private el = inject(ElementRef);
  private project = inject(ProjectService);
  private unitApi = inject(UnitApiService);

  // Inputs
  /** ราคาที่แนะนำสำหรับ contract_price = net_price + ขอบวกเพิ่ม + ค่าธรรมเนียมโอน(add_to_net) */
  recommendedContractPrice = input<number>(0);
  /** ค่าธรรมเนียมโอนแนะนำจาก system_settings.transfer_fee_percent */
  recommendedAdditionalExpense = input<number>(0);
  /** อัตรา % ค่าธรรมเนียมโอน (จาก system_settings) — สำหรับแสดงสูตรใต้ช่อง input */
  transferFeePercent = input<number>(0);

  // Outputs
  unitSelected = output<Unit | null>();
  saleDateChanged = output<string>();
  contractPriceChanged = output<number | null>();
  loanMarkupChanged = output<number>();
  additionalExpenseChanged = output<number>();
  additionalExpenseModeChanged = output<AdditionalExpenseMode>();

  // Form controls
  unitControl = this.fb.control<number | null>(null);
  /** Text input control for the autocomplete field — value is display string, not unit ID */
  unitSearchControl = this.fb.control<string>('');
  saleDateControl = this.fb.control<Date>(new Date(), { nonNullable: true });
  /** ราคาหน้าสัญญา — บังคับกรอก ต้อง > 0 */
  contractPriceControl = this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]);
  /** ขอบวกเพิ่ม — virtual markup เพื่อยื่นกู้ (ไม่กระทบงบ/กำไรจริง) */
  loanMarkupControl = this.fb.control<number>(0, { nonNullable: true });
  /** ค่าใช้จ่ายบวกเพิ่ม — ค่าธรรมเนียมโอน */
  additionalExpenseControl = this.fb.control<number>(0, { nonNullable: true });
  /** โหมดการคิดค่าธรรมเนียมโอน: add_to_net = บวกเข้าราคาขายสุทธิ, as_premium = ของแถมเพิ่มเติม (งบผู้บริหาร) */
  additionalExpenseModeControl = this.fb.control<AdditionalExpenseMode>('add_to_net', { nonNullable: true });

  // Signals
  readonly units = signal<Unit[]>([]);
  readonly selectedUnit = signal<Unit | null>(null);
  readonly loading = signal(false);
  readonly allowSoldUnit = signal(false);
  /** ข้อความที่ผู้ใช้พิมพ์เพื่อค้นหายูนิต */
  readonly unitSearchText = signal<string>('');
  /** true เมื่อ user แก้ ราคาหน้าสัญญา เอง — บล็อก auto-fill จากราคาแนะนำ */
  readonly userOverrodeContract = signal<boolean>(false);
  /** ค่าปัจจุบันของ contractPriceControl เป็น signal (sync จาก valueChanges + auto-fill) */
  private contractValueSignal = signal<number | null>(null);

  /** true เมื่อ user แก้ ค่าธรรมเนียมโอน เอง — บล็อก auto-fill */
  readonly userOverrodeAdditionalExpense = signal<boolean>(false);
  /** ค่าปัจจุบันของ additionalExpenseControl เป็น signal */
  private additionalExpenseValueSignal = signal<number>(0);

  /** แสดงปุ่ม "ใช้ราคาแนะนำ" เมื่อ: user เคยแก้เอง + recommended > 0 + ค่าใน ช่อง ≠ recommended */
  readonly showApplyRecommendedButton = computed(() => {
    const rec = this.recommendedContractPrice();
    if (rec <= 0) return false;
    if (!this.userOverrodeContract()) return false;
    return Number(this.contractValueSignal() ?? 0) !== rec;
  });

  /** แสดงปุ่ม "ใช้ค่าเริ่มต้น" สำหรับค่าธรรมเนียมโอน */
  readonly showApplyRecommendedAdditionalExpenseButton = computed(() => {
    const rec = this.recommendedAdditionalExpense();
    if (rec <= 0) return false;
    if (!this.userOverrodeAdditionalExpense()) return false;
    return Number(this.additionalExpenseValueSignal() ?? 0) !== rec;
  });

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

    // เมื่อเปลี่ยนราคาหน้าสัญญา (user แก้เอง — auto-fill ใช้ emitEvent:false ไม่ผ่านที่นี่)
    // → flag override + emit ให้ parent recalc expression formulas ที่อ้าง contract_price
    this.subs.push(
      this.contractPriceControl.valueChanges.subscribe(price => {
        const num = price == null ? null : Number(price);
        this.contractValueSignal.set(num);
        this.userOverrodeContract.set(true);
        this.contractPriceChanged.emit(price);
      })
    );

    // ส่วนเสริม — emit สู่ parent
    this.subs.push(
      this.loanMarkupControl.valueChanges.subscribe(v => {
        this.loanMarkupChanged.emit(Number(v) || 0);
      })
    );
    // ค่าธรรมเนียมโอน — user แก้เอง (auto-fill ใช้ emitEvent:false ไม่ผ่านที่นี่)
    this.subs.push(
      this.additionalExpenseControl.valueChanges.subscribe(v => {
        const num = Number(v) || 0;
        this.additionalExpenseValueSignal.set(num);
        this.userOverrodeAdditionalExpense.set(true);
        this.additionalExpenseChanged.emit(num);
      })
    );
    this.subs.push(
      this.additionalExpenseModeControl.valueChanges.subscribe(mode => {
        this.additionalExpenseModeChanged.emit(mode);
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

  /** Auto-fill contract_price จาก recommended เมื่อ user ยังไม่ได้แก้เอง
   *  ใช้ emitEvent:false → ไม่ trigger contractPriceChanged → ไม่ trigger eligible reload (กัน loop) */
  private autoFillContractEffect = effect(() => {
    const rec = this.recommendedContractPrice();
    if (this.userOverrodeContract()) return;
    if (rec <= 0) return;
    if (this.contractPriceControl.disabled) return;
    const current = Number(this.contractValueSignal() ?? 0);
    if (current === rec) return;
    this.contractPriceControl.setValue(rec, { emitEvent: false });
    this.contractValueSignal.set(rec);
  });

  /** ปุ่ม "ใช้ราคาแนะนำ" — รีเซ็ต override + sync ค่าใหม่ + emit (ให้ parent recalc ถ้ามีสูตรอ้าง contract_price) */
  applyRecommendedContractPrice(): void {
    const rec = this.recommendedContractPrice();
    if (rec <= 0) return;
    this.contractPriceControl.setValue(rec, { emitEvent: false });
    this.contractValueSignal.set(rec);
    this.userOverrodeContract.set(false);
    this.contractPriceControl.markAsPristine();
    this.contractPriceChanged.emit(rec);
  }

  /** Auto-fill ค่าธรรมเนียมโอน จาก recommendedAdditionalExpense เมื่อ user ยังไม่ได้แก้
   *  ใช้ emitEvent:false → ไม่ flip override flag, ไม่ trigger additionalExpenseChanged
   *  → ผมยังต้องอัพเดท parent state เอง ตรงนี้แค่ sync ช่องในจอ */
  private autoFillAdditionalExpenseEffect = effect(() => {
    const rec = this.recommendedAdditionalExpense();
    if (this.userOverrodeAdditionalExpense()) return;
    if (this.additionalExpenseControl.disabled) return;
    const current = Number(this.additionalExpenseValueSignal() ?? 0);
    if (current === rec) return;
    this.additionalExpenseControl.setValue(rec, { emitEvent: false });
    this.additionalExpenseValueSignal.set(rec);
    this.additionalExpenseChanged.emit(rec);
  });

  /** ปุ่ม "ใช้ค่าเริ่มต้น" สำหรับค่าธรรมเนียมโอน */
  applyRecommendedAdditionalExpense(): void {
    const rec = this.recommendedAdditionalExpense();
    if (rec <= 0) return;
    this.additionalExpenseControl.setValue(rec, { emitEvent: false });
    this.additionalExpenseValueSignal.set(rec);
    this.userOverrodeAdditionalExpense.set(false);
    this.additionalExpenseControl.markAsPristine();
    this.additionalExpenseChanged.emit(rec);
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
    // เปลี่ยนยูนิต → reset override ของ contract_price + additional_expense
    // (ของยูนิตใหม่ไม่ใช่ข้อมูลที่ user เคยแก้)
    this.userOverrodeContract.set(false);
    this.contractPriceControl.markAsPristine();
    this.userOverrodeAdditionalExpense.set(false);
    this.additionalExpenseControl.markAsPristine();
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
              // ส่ง unit.id (ไม่ใช่ display string) เพราะ MatAutocompleteTrigger จะวิ่งผ่าน
              // displayWith → displayUnit(id) คืน display string ให้เอง
              // (ถ้าส่ง display string ตรง ๆ displayUnit จะหา unit ไม่เจอแล้วคืน '' ทำให้ input โล่ง)
              this.unitSearchControl.setValue(unit.id as any, { emitEvent: false });
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

  getFormValues(): {
    sale_date: string;
    contract_price: number | null;
    loan_markup_amount: number;
    additional_expense_amount: number;
    additional_expense_mode: AdditionalExpenseMode;
  } {
    return {
      sale_date: this.getSaleDate(),
      contract_price: this.contractPriceControl.value,
      loan_markup_amount: Number(this.loanMarkupControl.value) || 0,
      additional_expense_amount: Number(this.additionalExpenseControl.value) || 0,
      additional_expense_mode: this.additionalExpenseModeControl.value,
    };
  }

  isValid(): boolean {
    // mark touched เพื่อแสดง error
    this.contractPriceControl.markAsTouched();
    this.contractPriceControl.updateValueAndValidity();

    const hasUnit = !!this.selectedUnit();
    const contractValid = this.contractPriceControl.valid;
    const valid = hasUnit && contractValid;
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
