import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { BudgetService, PoolBalance, UnitBudgetSummary, SourceSummary } from '../services/budget.service';
import { UnitApiService, Unit } from '../../master-data/units/unit-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';

const SOURCE_LABELS: Record<string, string> = {
  UNIT_STANDARD: 'งบมาตรฐานยูนิต', PROJECT_POOL: 'งบ Pool โครงการ',
  MANAGEMENT_SPECIAL: 'งบพิเศษผู้บริหาร',
};

@Component({
  selector: 'app-budget-transfer',
  standalone: true,
  imports: [
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatTableModule, MatProgressSpinnerModule, CurrencyMaskDirective, MatSnackBarModule,
    SvgIconComponent,
  ],
  templateUrl: './budget-transfer.component.html',
})
export class BudgetTransferComponent implements OnInit {
  private budgetSvc = inject(BudgetService);
  private unitApi   = inject(UnitApiService);
  private project   = inject(ProjectService);
  private snack     = inject(MatSnackBar);
  private fb        = inject(FormBuilder);

  projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));
  canEdit   = computed(() => this.project.canEdit());

  // ── State ──
  loading      = signal(false);
  transferring = signal(false);
  pool         = signal<PoolBalance | null>(null);
  units        = signal<Unit[]>([]);
  fromSummary  = signal<UnitBudgetSummary | null>(null);
  toSummary    = signal<UnitBudgetSummary | null>(null);

  // ── Summary table ──
  summaryColumns = ['source', 'allocated', 'used', 'remaining'];
  sourceLabels   = SOURCE_LABELS;
  sources        = ['UNIT_STANDARD', 'PROJECT_POOL', 'MANAGEMENT_SPECIAL'];

  // ── Form ──
  form = this.fb.group({
    from_unit_id:       [null as number | null, Validators.required],
    to_unit_id:         [null as number | null, Validators.required],
    budget_source_type: ['', Validators.required],
    amount:             [null as number | null, [Validators.required, Validators.min(1)]],
    note:               [''],
  });

  // ── Computed: available sources ──
  availableSources = computed(() => {
    const s = this.fromSummary();
    if (!s) return [];
    return this.sources.filter(src => {
      const data = s[src as keyof UnitBudgetSummary] as SourceSummary;
      return data && data.remaining > 0;
    });
  });

  // ── Computed: max transferable ──
  maxAmount = computed(() => {
    const s = this.fromSummary();
    const src = this.form.get('budget_source_type')?.value;
    if (!s || !src) return 0;
    return (s[src as keyof UnitBudgetSummary] as SourceSummary)?.remaining ?? 0;
  });

  // ── Computed: filtered units ──
  toUnits = computed(() => {
    const fromId = this.form.get('from_unit_id')?.value;
    return this.units().filter(u => u.id !== fromId);
  });

  ngOnInit(): void {
    this.loadPool();
    this.loadUnits();
  }

  loadPool(): void {
    if (!this.projectId()) return;
    this.budgetSvc.getPoolBalance(this.projectId()).subscribe({
      next: p => this.pool.set(p),
    });
  }

  loadUnits(): void {
    if (!this.projectId()) return;
    this.unitApi.getList(this.projectId()).subscribe({
      next: u => this.units.set(u),
    });
  }

  onFromUnitChange(unitId: number): void {
    this.fromSummary.set(null);
    this.form.patchValue({ budget_source_type: '', amount: null });
    if (!unitId) return;
    this.budgetSvc.getUnitSummary(unitId, this.projectId()).subscribe({
      next: s => this.fromSummary.set(s),
    });
  }

  onToUnitChange(unitId: number): void {
    this.toSummary.set(null);
    if (!unitId) return;
    this.budgetSvc.getUnitSummary(unitId, this.projectId()).subscribe({
      next: s => this.toSummary.set(s),
    });
  }

  confirmTransfer(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.value;
    const fromUnit = this.units().find(u => u.id === v.from_unit_id);
    const toUnit   = this.units().find(u => u.id === v.to_unit_id);
    const srcLabel = SOURCE_LABELS[v.budget_source_type!] ?? v.budget_source_type;
    const amtStr   = Number(v.amount).toLocaleString('th-TH');

    const ok = confirm(
      `ต้องการโอนงบ ${srcLabel}\nจำนวน ฿${amtStr}\nจากยูนิต ${fromUnit?.unit_code ?? '?'}\nไปยังยูนิต ${toUnit?.unit_code ?? '?'} ?`
    );
    if (!ok) return;

    this.transferring.set(true);
    this.budgetSvc.transferBudget({
      project_id:         this.projectId(),
      from_unit_id:       v.from_unit_id,
      to_unit_id:         v.to_unit_id,
      budget_source_type: v.budget_source_type,
      amount:             v.amount,
      note:               v.note || '',
    }).subscribe({
      next: r => {
        this.transferring.set(false);
        this.snack.open(r.message ?? 'โอนงบสำเร็จ', 'ปิด', { duration: 4000 });
        // Refresh
        this.loadPool();
        this.onFromUnitChange(v.from_unit_id!);
        this.onToUnitChange(v.to_unit_id!);
        this.form.patchValue({ amount: null, note: '' });
      },
      error: err => {
        this.transferring.set(false);
        this.snack.open(err.error?.error ?? 'โอนงบไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  getSummaryRows(summary: UnitBudgetSummary): { source: string; label: string; allocated: number; used: number; remaining: number }[] {
    return this.sources.map(src => {
      const d = summary[src as keyof UnitBudgetSummary] as SourceSummary;
      return { source: src, label: SOURCE_LABELS[src], allocated: d?.allocated ?? 0, used: d?.used ?? 0, remaining: d?.remaining ?? 0 };
    });
  }

  formatCurrency(v: number): string {
    return '฿' + v.toLocaleString('th-TH', { minimumFractionDigits: 0 });
  }
}
