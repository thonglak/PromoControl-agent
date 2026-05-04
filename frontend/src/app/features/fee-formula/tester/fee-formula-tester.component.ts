import { Component, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { FeeFormulaApiService, FeeFormula, TestResult, TestResultItem, BatchResultItem } from '../fee-formula-api.service';
import { UnitApiService, Unit } from '../../master-data/units/unit-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

/** แปลง Date หรือ Moment → YYYY-MM-DD string */
function toISODateStr(d: any): string {
  if (!d) return '';
  const y = typeof d.year === 'function' ? d.year() : d.getFullYear();
  const m = String((typeof d.month === 'function' ? d.month() : d.getMonth()) + 1).padStart(2, '0');
  const dd = String(typeof d.date === 'function' ? d.date() : d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

@Component({
  selector: 'app-fee-formula-tester',
  standalone: true,
  imports: [
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatTabsModule, MatDatepickerModule,
    MatProgressSpinnerModule, CurrencyMaskDirective, MatSnackBarModule,
  ],
  templateUrl: './fee-formula-tester.component.html',
})
export class FeeFormulaTesterComponent implements OnInit {
  private api     = inject(FeeFormulaApiService);
  private unitApi = inject(UnitApiService);
  private project = inject(ProjectService);
  private snack   = inject(MatSnackBar);
  private fb      = inject(FormBuilder);

  formulas = signal<FeeFormula[]>([]);
  units    = signal<Unit[]>([]);

  // ── Single Test ──
  singleForm = this.fb.group({
    formulaId:     [null as number | null, Validators.required],
    unitId:        [null as number | null, Validators.required],
    saleDate:      [new Date() as Date | null, Validators.required],
    manualInput:   [null as number | null],
    contractPrice: [null as number | null],
    netPrice:      [null as number | null],
  });
  testResult  = signal<TestResult | null>(null);
  calculating = signal(false);

  // ── Batch Test ──
  batchForm = this.fb.group({
    formulaId: [null as number | null, Validators.required],
    saleDate:  [new Date() as Date | null, Validators.required],
  });
  batchResults   = signal<BatchResultItem[]>([]);
  batchDataSource = new MatTableDataSource<BatchResultItem>([]);
  batchColumns   = ['unit_code', 'base_amount', 'rate', 'buyer_share', 'calculated_value', 'matched_policy'];
  calculatingBatch = signal(false);

  @ViewChild('batchSort') set batchSortRef(s: MatSort) { if (s) this.batchDataSource.sort = s; }
  @ViewChild('batchPaginator') set batchPaginatorRef(p: MatPaginator) { if (p) this.batchDataSource.paginator = p; }

  // Check if any formula uses manual_input
  hasManualInput = computed(() => {
    const fid = this.singleForm.get('formulaId')?.value;
    if (!fid) return this.formulas().some(f => f.base_field === 'manual_input');
    const f = this.formulas().find(x => x.id === fid);
    return f?.base_field === 'manual_input';
  });

  /** ตรวจว่ามีสูตร expression ที่ใช้ contract_price ไหม → ต้องแสดงช่องกรอก */
  needsContractPrice = computed(() => {
    const fid = this.singleForm.get('formulaId')?.value;
    const formulas = fid
      ? this.formulas().filter(f => f.id === fid)
      : this.formulas();
    return formulas.some(f =>
      f.base_field === 'expression' &&
      (f.formula_expression ?? '').includes('contract_price')
    );
  });

  /** ตรวจว่าต้องการ net_price ไหม — ใช้กับ base_field='net_price' หรือ expression ที่ใช้ตัวแปร net_price */
  needsNetPrice = computed(() => {
    const fid = this.singleForm.get('formulaId')?.value;
    const formulas = fid
      ? this.formulas().filter(f => f.id === fid)
      : this.formulas();
    return formulas.some(f =>
      f.base_field === 'net_price' ||
      (f.base_field === 'expression' && (f.formula_expression ?? '').includes('net_price'))
    );
  });

  get projectId(): number { return Number(this.project.selectedProject()?.id ?? 0); }

  ngOnInit(): void {
    this.api.getFormulas().subscribe({ next: f => this.formulas.set(f) });
    if (this.projectId) {
      this.unitApi.getList(this.projectId).subscribe({ next: u => this.units.set(u) });
    }
  }

  calculate(): void {
    if (this.singleForm.invalid) { this.singleForm.markAllAsTouched(); return; }
    this.calculating.set(true);
    this.testResult.set(null);

    const v = this.singleForm.value;
    const params: any = {
      mode: 'unit',
      unit_id: v.unitId,
      sale_date: v.saleDate ? this.toDateStr(v.saleDate) : null,
    };
    if (v.formulaId) params.formula_id = v.formulaId;
    if (v.manualInput) params.manual_input = v.manualInput;
    if (v.contractPrice) params.contract_price = v.contractPrice;
    if (v.netPrice)      params.net_price      = v.netPrice;

    this.api.test(params).subscribe({
      next: result => { this.testResult.set(result); this.calculating.set(false); },
      error: err => {
        this.snack.open(err.error?.error ?? 'คำนวณไม่สำเร็จ', 'ปิด', { duration: 5000 });
        this.calculating.set(false);
      },
    });
  }

  calculateBatch(): void {
    if (this.batchForm.invalid) { this.batchForm.markAllAsTouched(); return; }
    this.calculatingBatch.set(true);
    this.batchResults.set([]);

    const v = this.batchForm.value;
    const params: any = {
      sale_date: v.saleDate ? this.toDateStr(v.saleDate) : null,
    };
    if (v.formulaId) params.formula_id = v.formulaId;

    this.api.testBatch(params).subscribe({
      next: result => {
        this.batchResults.set(result.results);
        this.batchDataSource.data = result.results;
        this.calculatingBatch.set(false);
      },
      error: err => {
        this.snack.open(err.error?.error ?? 'คำนวณไม่สำเร็จ', 'ปิด', { duration: 5000 });
        this.calculatingBatch.set(false);
      },
    });
  }

  formatCurrency(v: number): string {
    return '฿' + v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatNumber(v: number): string {
    // ตัวเลขเต็ม → ไม่มีทศนิยม, ทศนิยม → 2 หลัก
    if (Number.isInteger(v)) {
      return v.toLocaleString('th-TH');
    }
    return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatRate(decimal: number): string {
    return (decimal * 100).toFixed(2) + '%';
  }

  formatShare(decimal: number): string {
    return Math.round(decimal * 100) + '%';
  }

  private toDateStr(d: any): string {
    return toISODateStr(d);
  }
}
