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
import { MatButtonModule } from '@angular/material/button';
import { Subscription } from 'rxjs';

import { ProjectService } from '../../../core/services/project.service';
import { UnitApiService, Unit } from '../../master-data/units/unit-api.service';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

export type AdditionalExpenseMode = 'add_to_net' | 'as_premium' | 'as_unit_expense';

/** ตัวเลือกรายการ expense_support สำหรับ mode=as_unit_expense */
export interface ExpenseSupportOption {
  id: number;
  name: string;
}

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
    MatDatepickerModule, MatRadioModule, MatTooltipModule, MatButtonModule,
    CurrencyMaskDirective, SvgIconComponent,
  ],
  template: `
    <div class="section-card">
      <h3 class="text-sm font-semibold mb-4" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">ข้อมูลยูนิต</h3>

      <!-- Zone A: input fields (กรอก 3 ฟิลด์ติดกัน) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

        <!-- ราคาหน้าสัญญา — คำนวณอัตโนมัติ = ราคาสุทธิยื่นกู้ (disabled + พื้นเทา สื่อว่าแก้เองไม่ได้) -->
        <mat-form-field appearance="outline" class="w-full input-locked">
          <mat-label>ราคาหน้าสัญญา</mat-label>
          <input matInput currencyMask
            [formControl]="contractPriceControl"
            placeholder="0">
          <span matTextPrefix>฿&nbsp;</span>
        </mat-form-field>
      </div>

      <!-- Zone B + C: readonly info (โผล่เมื่อเลือกยูนิตแล้ว) -->
      @if (selectedUnit(); as unit) {
        <!-- Zone B: stat cards เลขสำคัญ 4 ใบ -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <div class="p-2.5"
            style="background-color: var(--color-gray-50); border: 1px solid var(--color-border); border-radius: var(--radius-md)">
            <p class="text-[11px] mb-0.5" style="color: var(--color-gray-500)">ราคาขาย</p>
            <p class="text-base font-semibold tabular-nums" style="color: var(--color-text-primary)">
              ฿{{ unit.base_price | number:'1.0-0' }}
            </p>
          </div>
          <div class="p-2.5"
            style="background-color: var(--color-gray-50); border: 1px solid var(--color-border); border-radius: var(--radius-md)">
            <p class="text-[11px] mb-0.5" style="color: var(--color-gray-500)">ต้นทุน</p>
            <p class="text-base font-semibold tabular-nums" style="color: var(--color-text-primary)">
              ฿{{ unit.unit_cost | number:'1.0-0' }}
            </p>
          </div>
          <div class="p-2.5"
            style="background-color: var(--color-gray-50); border: 1px solid var(--color-border); border-radius: var(--radius-md)">
            <p class="text-[11px] mb-0.5" style="color: var(--color-gray-500)">ราคาประเมิน</p>
            <p class="text-base font-semibold tabular-nums"
              [class.text-amber-600]="unit.appraisal_price == null"
              [style.color]="unit.appraisal_price != null ? 'var(--color-text-primary)' : ''">
              @if (unit.appraisal_price != null) {
                ฿{{ unit.appraisal_price | number:'1.0-0' }}
              } @else {
                ยังไม่มี
              }
            </p>
          </div>
          <div class="p-2.5"
            style="background-color: var(--color-gray-50); border: 1px solid var(--color-border); border-radius: var(--radius-md)">
            <p class="text-[11px] mb-0.5" style="color: var(--color-gray-500)">งบยูนิต</p>
            <p class="text-base font-semibold tabular-nums" style="color: var(--color-text-primary)">
              ฿{{ unit.standard_budget | number:'1.0-0' }}
            </p>
          </div>
        </div>

        <!-- Zone C: meta inline (โครงการ · แบบบ้าน · พื้นที่ · ที่ดิน · สถานะ) -->
        <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style="color: var(--color-gray-500)">
          <span>โครงการ <strong class="text-slate-700">{{ projectName() }}</strong></span>
          @if (unit.house_model_name) {
            <span style="color: var(--color-gray-300)">·</span>
            <span>แบบบ้าน <strong class="text-slate-700">{{ unit.house_model_name }}</strong></span>
          }
          @if (unit.area_sqm) {
            <span style="color: var(--color-gray-300)">·</span>
            <span>พื้นที่ <strong class="text-slate-700">{{ unit.area_sqm | number:'1.2-2' }} ตร.ม.</strong></span>
          }
          @if (unit.land_area_sqw && !isCondo()) {
            <span style="color: var(--color-gray-300)">·</span>
            <span>ที่ดิน <strong class="text-slate-700">{{ unit.land_area_sqw | number:'1.2-2' }} ตร.ว.</strong></span>
          }
          <span style="color: var(--color-gray-300)">·</span>
          <span>สถานะ
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
              [class]="statusClass(unit.status)">
              {{ statusLabel(unit.status) }}
            </span>
          </span>
        </div>
      } @else {
        <!-- ยังไม่ได้เลือกยูนิต — แสดง project name อย่างเดียว -->
        <p class="mt-3 text-sm" style="color: var(--color-gray-500)">
          โครงการ <strong class="text-slate-700">{{ projectName() }}</strong>
        </p>
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
                  <span style="color: var(--color-gray-500)" [matTooltip]="'mode ที่บริษัทจ่ายให้ → ค่าธรรมเนียมโอนไม่อยู่ในราคาสุทธิยื่นกู้ → คิดตรงๆ จากขอบวกเพิ่ม'">
                    (ทำไม?)
                  </span>
                }
              </p>
            }

            @if (showApplyRecommendedAdditionalExpenseButton()) {
              <button type="button"
                class="suggestion-chip mt-1.5 self-start inline-flex items-center gap-1.5 px-2 py-0.5 text-xs cursor-pointer transition-colors hover:opacity-80"
                style="background-color: var(--color-primary-100);
                       color: var(--color-primary-700);
                       border: 1px dashed var(--color-primary-500);
                       border-radius: var(--radius-sm);
                       font-weight: 600;"
                (click)="applyRecommendedAdditionalExpense()">
                <app-icon name="arrow-path" class="w-3 h-3" />
                <span>คำนวณอัตโนมัติ</span>
                <span class="tabular-nums font-bold">฿{{ recommendedAdditionalExpense() | number:'1.0-0' }}</span>
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
                ค่าธรรมเนียมโอนบวกเพิ่ม (ลูกค้าจ่ายเอง)
              </mat-radio-button>
              <!-- ตัวเลือก "ใช้งบยูนิต" (as_unit_expense) ถูกซ่อน — ไม่เปิดให้เลือกในหน้านี้ -->
              <mat-radio-button value="as_premium" class="text-sm">
                ค่าธรรมเนียมโอนบวกเพิ่ม (ใช้งบผู้บริหาร)
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
  /** รายการ expense_support ใน Panel A สำหรับ dropdown ของ mode=as_unit_expense */
  expenseSupportItems = input<ExpenseSupportOption[]>([]);

  // Outputs
  unitSelected = output<Unit | null>();
  saleDateChanged = output<string>();
  contractPriceChanged = output<number | null>();
  loanMarkupChanged = output<number>();
  additionalExpenseChanged = output<number>();
  additionalExpenseModeChanged = output<AdditionalExpenseMode>();
  /** เปลี่ยนรายการที่ผูกกับค่าธรรมเนียมโอน (mode=as_unit_expense); null = ยังไม่เลือก/mode อื่น */
  linkedItemChanged = output<number | null>();

  // Form controls
  unitControl = this.fb.control<number | null>(null);
  /** Text input control for the autocomplete field — value is display string, not unit ID */
  unitSearchControl = this.fb.control<string>('');
  saleDateControl = this.fb.control<Date>(new Date(), { nonNullable: true });
  /** ราคาหน้าสัญญา — ล็อกตามสูตร (= ราคาสุทธิยื่นกู้) disabled เพื่อสื่อว่าแก้เองไม่ได้
   *  ค่าเติมอัตโนมัติผ่าน autoFillContractEffect (setValue ทำงานบน disabled control ได้)
   *  validators คงไว้เป็น metadata แต่ disabled control ไม่ถูก validate — isValid() เช็คค่าตรงแทน */
  contractPriceControl = this.fb.control<number | null>({ value: null, disabled: true }, [Validators.required, Validators.min(0.01)]);
  /** ขอบวกเพิ่ม — virtual markup เพื่อยื่นกู้ (ไม่กระทบงบ/กำไรจริง) */
  loanMarkupControl = this.fb.control<number>(0, { nonNullable: true });
  /** ค่าใช้จ่ายบวกเพิ่ม — ค่าธรรมเนียมโอน */
  additionalExpenseControl = this.fb.control<number>(0, { nonNullable: true });
  /** โหมดการคิดค่าธรรมเนียมโอน:
   *  - add_to_net = บวกเข้าราคาขายสุทธิ (ลูกค้าจ่าย)
   *  - as_premium = ของแถมเพิ่มเติม (งบผู้บริหาร)
   *  - as_unit_expense = ผูกกับรายการ expense_support ใน Panel A (งบยูนิต) */
  additionalExpenseModeControl = this.fb.control<AdditionalExpenseMode>('add_to_net', { nonNullable: true });
  /** id ของ promotion_item ที่จะผูกค่าธรรมเนียมโอน (เฉพาะ mode=as_unit_expense) */
  linkedItemControl = this.fb.control<number | null>(null);

  // Signals
  readonly units = signal<Unit[]>([]);
  readonly selectedUnit = signal<Unit | null>(null);
  readonly loading = signal(false);
  readonly allowSoldUnit = signal(false);
  /** ข้อความที่ผู้ใช้พิมพ์เพื่อค้นหายูนิต */
  readonly unitSearchText = signal<string>('');
  /** ค่าปัจจุบันของ contractPriceControl เป็น signal (sync จาก auto-lock effect) */
  private contractValueSignal = signal<number | null>(null);

  /** true เมื่อ user แก้ ค่าธรรมเนียมโอน เอง — บล็อก auto-fill */
  readonly userOverrodeAdditionalExpense = signal<boolean>(false);
  /** ค่าปัจจุบันของ additionalExpenseControl เป็น signal */
  private additionalExpenseValueSignal = signal<number>(0);

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

    // ราคาหน้าสัญญา = ราคาสุทธิยื่นกู้ (auto-lock ผ่าน autoFillContractEffect) — แก้ไขเองไม่ได้ จึงไม่ subscribe valueChanges

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
        // เปลี่ยน mode ออกจาก as_unit_expense → เคลียร์ linkedItem (parent จะปลด lock + clear used_value)
        if (mode !== 'as_unit_expense' && this.linkedItemControl.value != null) {
          this.linkedItemControl.setValue(null);
        }
        this.additionalExpenseModeChanged.emit(mode);
      })
    );
    this.subs.push(
      this.linkedItemControl.valueChanges.subscribe(id => {
        this.linkedItemChanged.emit(id);
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

  /** Auto-lock contract_price = ราคาสุทธิยื่นกู้ (recommended) เสมอ — แสดงอย่างเดียว แก้ไขเองไม่ได้
   *  emit contractPriceChanged เมื่อค่าเปลี่ยน เพื่อให้ parent recalc สูตรที่อ้าง contract_price
   *  (setValue ใช้ emitEvent:false กัน loop จาก valueChanges; แจ้ง parent ผ่าน emit โดยตรงแทน) */
  private autoFillContractEffect = effect(() => {
    const rec = this.recommendedContractPrice();
    if (rec <= 0) return;
    const current = Number(this.contractValueSignal() ?? 0);
    if (current === rec) return;
    this.contractPriceControl.setValue(rec, { emitEvent: false });
    this.contractValueSignal.set(rec);
    this.contractPriceChanged.emit(rec);
  });

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
    // เปลี่ยนยูนิต → contract_price ล็อกตามสูตรอัตโนมัติ (effect); reset override ของค่าธรรมเนียมโอน
    this.contractPriceControl.markAsPristine();
    this.userOverrodeAdditionalExpense.set(false);
    this.additionalExpenseControl.markAsPristine();
    // เปลี่ยนยูนิต → Panel A เปลี่ยน → เคลียร์ linkedItem (parent ก็ปลด lock เอง)
    if (this.linkedItemControl.value != null) {
      this.linkedItemControl.setValue(null);
    }
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
    const hasUnit = !!this.selectedUnit();
    // contractPriceControl ถูก disable (ล็อกตามสูตร) → .valid เป็น false เสมอ
    // จึงเช็คค่าตรง ๆ: ราคาหน้าสัญญา = ราคาสุทธิยื่นกู้ ต้อง > 0
    const contractValid = Number(this.contractPriceControl.value) > 0;

    // mode=as_unit_expense + มี amount → ต้องเลือก linkedItem
    const mode = this.additionalExpenseModeControl.value;
    const addExpense = Number(this.additionalExpenseControl.value) || 0;
    const linkedOk = !(mode === 'as_unit_expense' && addExpense > 0 && this.linkedItemControl.value == null);

    const valid = hasUnit && contractValid && linkedOk;
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
