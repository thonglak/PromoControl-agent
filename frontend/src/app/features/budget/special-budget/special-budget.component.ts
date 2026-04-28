import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { forkJoin } from 'rxjs';

import { BudgetService, BudgetMovement, UnitBudgetSummary, SourceSummary } from '../services/budget.service';
import { UnitApiService, Unit } from '../../master-data/units/unit-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { ReturnSpecialBudgetDialogComponent, ReturnSpecialBudgetDialogData } from '../dialogs/return-special-budget-dialog.component';
import { TransferSpecialBudgetDialogComponent, TransferSpecialBudgetDialogData } from '../dialogs/transfer-special-budget-dialog.component';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';

interface UnitSpecialSummary {
  unit_id: number;
  unit_code: string;
  ms_allocated: number; ms_used: number; ms_remaining: number;
  pp_allocated: number; pp_used: number; pp_remaining: number;
  cs_allocated: number; cs_used: number; cs_remaining: number;
  total_remaining: number;
  recent_movements?: any[];
}

@Component({
  selector: 'app-special-budget',
  standalone: true,
  imports: [
    ThaiDatePipe,
    StatusChipComponent,
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatCheckboxModule, MatSlideToggleModule, MatTableModule, MatPaginatorModule,
    MatTooltipModule, MatProgressSpinnerModule, CurrencyMaskDirective, MatSnackBarModule, MatDialogModule,
    SvgIconComponent,
  ],
  templateUrl: './special-budget.component.html',
})
export class SpecialBudgetComponent implements OnInit {
  private readonly budgetSvc  = inject(BudgetService);
  private readonly unitApi    = inject(UnitApiService);
  private readonly projectSvc = inject(ProjectService);
  private readonly authSvc    = inject(AuthService);
  private readonly fb         = inject(FormBuilder);
  private readonly snackBar   = inject(MatSnackBar);
  private readonly dialog     = inject(MatDialog);

  // ── Computed ──
  readonly projectId = computed(() => { const id = this.projectSvc.selectedProject()?.id; return id != null ? Number(id) : null; });

  readonly canWrite = computed(() => {
    const role = this.authSvc.currentUser()?.role;
    return (role === 'admin' || role === 'manager') && this.projectSvc.canEdit();
  });

  // ── State ──
  readonly units = signal<Unit[]>([]);
  readonly submitting = signal(false);

  // Tab 2 state
  readonly specialMovements = signal<BudgetMovement[]>([]);
  readonly movementsTotal = signal(0);
  readonly movementsPage = signal(1);
  readonly movementsPerPage = signal(25);
  readonly movementsLoading = signal(false);

  // Map: "unitId:sourceType" -> remaining — ใช้ตรวจว่า row ALLOCATE/ADD มีงบคงเหลือไหม
  readonly unitRemainingMap = signal<Record<string, number>>({});

  // Movements หลัง filter ด้วย budget_remaining_filter
  readonly displayedMovements = computed(() => {
    const all = this.specialMovements();
    const filter = this.filterForm.get('budget_remaining_filter')?.value ?? '';
    if (!filter) return all; // "ทั้งหมด"

    const allocTypes = ['SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'];
    const map = this.unitRemainingMap();

    return all.filter(m => {
      // เฉพาะ ALLOCATE/ADD rows ที่ต้อง filter
      if (!allocTypes.includes(m.movement_type)) return true; // ไม่ใช่ ALLOCATE/ADD → แสดงเสมอ

      const key = m.unit_id + ':' + m.budget_source_type;
      const remaining = map[key] ?? -1; // -1 = ยังไม่มีข้อมูล → แสดงไว้ก่อน

      if (filter === 'has_remaining') return remaining > 0 || remaining < 0;
      if (filter === 'fully_returned') return remaining === 0;
      return true;
    });
  });

  readonly movementColumns = ['movement_no', 'created_at', 'unit_code', 'budget_source_type',
    'movement_type', 'amount', 'status', 'note', 'created_by_name', 'actions'];

  // Tab 3 state
  readonly unitSummaries = signal<UnitSpecialSummary[]>([]);
  readonly summariesLoading = signal(false);
  readonly expandedUnitId = signal<number | null>(null);
  readonly showAllUnits = signal(false);

  readonly allSummaries = signal<UnitSpecialSummary[]>([]);

  readonly filteredSummaries = computed(() => {
    const all = this.allSummaries();
    if (this.showAllUnits()) return all;
    return all.filter(s => s.ms_allocated > 0 || s.ms_used > 0 || s.pp_allocated > 0 || s.pp_used > 0 || s.cs_allocated > 0 || s.cs_used > 0);
  });

  readonly summaryColumns = ['unit_code', 'ms_allocated', 'ms_used', 'ms_remaining',
    'cs_allocated', 'cs_used', 'cs_remaining', 'total_remaining', 'actions'];

  // ── Tab 1 Form ──
  readonly addForm = this.fb.group({
    budget_source_type: ['MANAGEMENT_SPECIAL', Validators.required],
    all_units: [false],
    unit_ids: [[] as number[], Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    note: [''],
  });

  // ── Tab 2 Filter Form ──
  readonly filterForm = this.fb.group({
    budget_source_type: [''],
    status: [''],
    budget_remaining_filter: ['has_remaining'],  // ทั้งหมด / มีงบคงเหลือ / คืนแล้ว
  });

  // ── Computed for preview ──
  readonly selectedUnitCount = computed(() => {
    const allUnits = this.addForm.get('all_units')?.value;
    if (allUnits) return this.units().length;
    return (this.addForm.get('unit_ids')?.value ?? []).length;
  });

  ngOnInit(): void {
    this.loadUnits();
    this.loadMovements();

    // Watch all_units checkbox
    this.addForm.get('all_units')?.valueChanges.subscribe(checked => {
      if (checked) {
        const allIds = this.units().map(u => u.id);
        this.addForm.get('unit_ids')?.setValue(allIds);
        this.addForm.get('unit_ids')?.disable();
      } else {
        this.addForm.get('unit_ids')?.enable();
      }
    });
  }


  loadUnits(): void {
    const pid = this.projectId();
    if (!pid) return;
    this.unitApi.getList(pid).subscribe({
      next: u => this.units.set(u),
    });
  }

  // ── Tab 1: Submit Add ──
  submitAdd(): void {
    if (this.addForm.invalid) { this.addForm.markAllAsTouched(); return; }

    const v = this.addForm.getRawValue();
    const unitIds = v.all_units ? this.units().map(u => u.id) : (v.unit_ids ?? []);
    const srcLabel = this.sourceLabel(v.budget_source_type!);
    const amtStr = Number(v.amount).toLocaleString('th-TH');

    const ok = confirm(
      `ต้องการเพิ่ม ${srcLabel}\nจำนวน ฿${amtStr} ต่อยูนิต\nให้ ${unitIds.length} ยูนิต\nรวม ฿${(Number(v.amount) * unitIds.length).toLocaleString('th-TH')} ?`
    );
    if (!ok) return;

    this.submitting.set(true);
    let completed = 0;
    let errors = 0;

    const createNext = (index: number) => {
      if (index >= unitIds.length) {
        this.submitting.set(false);
        if (errors > 0) {
          this.snackBar.open(`เพิ่มงบสำเร็จ ${completed} ยูนิต, ล้มเหลว ${errors} ยูนิต`, 'ปิด', { duration: 5000 });
        } else {
          this.snackBar.open(`เพิ่มงบพิเศษสำเร็จ ${completed} ยูนิต`, 'ปิด', { duration: 3000 });
        }
        this.addForm.patchValue({ unit_ids: [], amount: null, note: '', all_units: false });
        this.addForm.get('unit_ids')?.enable();
        this.loadMovements();
        this.loadSummaries();
        return;
      }

      this.budgetSvc.createMovement({
        project_id: this.projectId(),
        unit_id: unitIds[index],
        movement_type: 'SPECIAL_BUDGET_ADD',
        budget_source_type: v.budget_source_type,
        amount: v.amount,
        note: v.note || '',
      }).subscribe({
        next: () => { completed++; createNext(index + 1); },
        error: () => { errors++; createNext(index + 1); },
      });
    };

    createNext(0);
  }

  // ── Tab 2: Load Movements ──
  loadMovements(): void {
    const pid = this.projectId();
    if (!pid) return;

    this.movementsLoading.set(true);
    const f = this.filterForm.value;
    const params: Record<string, any> = {
      project_id: pid,
      page: this.movementsPage(),
      per_page: this.movementsPerPage(),
    };
    if (f.budget_source_type) {
      params['budget_source_type'] = f.budget_source_type;
    } else {
      // ดึงเฉพาะ MANAGEMENT_SPECIAL + PROJECT_POOL (ไม่เอา UNIT_STANDARD)
      params['budget_source_type'] = 'MANAGEMENT_SPECIAL,PROJECT_POOL';
    }
    if (f.status) params['status'] = f.status;

    this.budgetSvc.getMovements(params).subscribe({
      next: res => {
        this.specialMovements.set(res.data);
        this.movementsTotal.set(res.total);
        this.movementsLoading.set(false);
        this.buildRemainingMap(res.data);
      },
      error: () => {
        this.movementsLoading.set(false);
        this.snackBar.open('โหลดข้อมูลล้มเหลว', 'ปิด', { duration: 3000 });
      },
    });
  }

  onMovementsFilterChange(): void {
    this.movementsPage.set(1);
    this.loadMovements();
  }

  resetMovementsFilter(): void {
    this.filterForm.reset();
    this.movementsPage.set(1);
    this.loadMovements();
  }

  onMovementsPage(e: PageEvent): void {
    this.movementsPage.set(e.pageIndex + 1);
    this.movementsPerPage.set(e.pageSize);
    this.loadMovements();
  }

  approve(id: number): void {
    this.budgetSvc.approveMovement(id).subscribe({
      next: () => {
        this.snackBar.open('อนุมัติรายการสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadMovements();
      },
      error: () => this.snackBar.open('อนุมัติล้มเหลว', 'ปิด', { duration: 3000 }),
    });
  }

  reject(id: number): void {
    const reason = window.prompt('กรุณาระบุเหตุผลที่ปฏิเสธ:');
    if (reason == null) return;
    this.budgetSvc.rejectMovement(id, reason).subscribe({
      next: () => {
        this.snackBar.open('ปฏิเสธรายการสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadMovements();
      },
      error: () => this.snackBar.open('ปฏิเสธล้มเหลว', 'ปิด', { duration: 3000 }),
    });
  }

  // ── Tab 3: Load Summaries ──
  loadSummaries(): void {
    const pid = this.projectId();
    if (!pid) return;
    const unitList = this.units();
    if (unitList.length === 0) return;

    this.summariesLoading.set(true);

    const calls = unitList.map(u => this.budgetSvc.getUnitSummary(u.id, pid));
    forkJoin(calls).subscribe({
      next: results => {
        const summaries: UnitSpecialSummary[] = results.map(s => {
          const ms = (s.MANAGEMENT_SPECIAL as SourceSummary) ?? { allocated: 0, used: 0, remaining: 0 };
          const pp = (s.PROJECT_POOL as SourceSummary) ?? { allocated: 0, used: 0, remaining: 0 };

          return {
            unit_id: s.unit_id,
            unit_code: s.unit_code,
            ms_allocated: ms.allocated, ms_used: ms.used, ms_remaining: ms.remaining,
            pp_allocated: pp.allocated, pp_used: pp.used, pp_remaining: pp.remaining,
            cs_allocated: 0, cs_used: 0, cs_remaining: 0,
            total_remaining: ms.remaining + pp.remaining,
            recent_movements: s.recent_movements ?? [],
          };
        });
        this.allSummaries.set(summaries);
        this.unitSummaries.set(this.filteredSummaries());
        this.summariesLoading.set(false);
      },
      error: () => {
        this.summariesLoading.set(false);
        this.snackBar.open('โหลดข้อมูลสรุปล้มเหลว', 'ปิด', { duration: 3000 });
      },
    });
  }

  toggleShowAllUnits(show: boolean): void {
    this.showAllUnits.set(show);
    this.unitSummaries.set(this.filteredSummaries());
  }

  toggleExpand(unitId: number): void {
    this.expandedUnitId.set(this.expandedUnitId() === unitId ? null : unitId);
  }

  onTabChange(index: number): void {
    if (index === 1) this.loadMovements();
    if (index === 2) this.loadSummaries();
  }


  // ── Build remaining map for ALLOCATE/ADD movements ──
  private buildRemainingMap(movements: BudgetMovement[]): void {
    const pid = this.projectId();
    if (!pid) return;

    // Collect unique unit_ids from ALLOCATE/ADD movements
    const allocTypes = ['SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'];
    const unitIds = [...new Set(
      movements
        .filter(m => allocTypes.includes(m.movement_type) && m.status === 'approved')
        .map(m => m.unit_id)
    )];

    if (unitIds.length === 0) {
      this.unitRemainingMap.set({});
      return;
    }

    // Fetch summary for each unit
    const calls = unitIds.map(uid => this.budgetSvc.getUnitSummary(uid, pid));
    forkJoin(calls).subscribe({
      next: results => {
        const map: Record<string, number> = {};
        for (const s of results) {
          const ms = (s.MANAGEMENT_SPECIAL as any) ?? { remaining: 0 };
          const pp = (s.PROJECT_POOL as any) ?? { remaining: 0 };
          map[s.unit_id + ':MANAGEMENT_SPECIAL'] = ms.remaining;
          map[s.unit_id + ':PROJECT_POOL'] = pp.remaining;
        }
        this.unitRemainingMap.set(map);
      },
    });
  }

  // ── คืนงบพิเศษ ──
  openReturnDialog(unitId: number, unitCode: string, sourceType: string, allocated?: number, used?: number, remaining?: number): void {
    const pid = this.projectId();
    if (!pid) return;

    // ถ้าไม่ได้ส่ง remaining → fetch summary ก่อนเปิด dialog
    if (remaining == null || allocated == null) {
      this.budgetSvc.getUnitSummary(unitId, pid).subscribe({
        next: summary => {
          const src = (summary as any)[sourceType] as SourceSummary;
          if (!src || src.remaining <= 0) {
            this.snackBar.open('ไม่มีงบคงเหลือให้คืน', 'ปิด', { duration: 3000 });
            return;
          }
          this.doOpenReturnDialog(pid, unitId, unitCode, sourceType, src.allocated, src.used, src.remaining);
        },
        error: () => this.snackBar.open('โหลดข้อมูลงบล้มเหลว', 'ปิด', { duration: 3000 }),
      });
    } else {
      this.doOpenReturnDialog(pid, unitId, unitCode, sourceType, allocated ?? 0, used ?? 0, remaining ?? 0);
    }
  }


  // ── ยกเลิกงบพิเศษ (Void) — used = 0 ──
  openVoidDialog(unitId: number, unitCode: string, sourceType: string, allocated: number): void {
    const pid = this.projectId();
    if (!pid) return;
    const sourceLabel = this.sourceLabel(sourceType);
    const amtStr = allocated.toLocaleString('th-TH');

    const ok = confirm(
      `ต้องการยกเลิก${sourceLabel}\nจำนวน ฿${amtStr}\nของยูนิต ${unitCode} ?\n\nหมายเหตุ: งบจะถูกยกเลิกทั้งก้อน`
    );
    if (!ok) return;

    const note = window.prompt('กรุณาระบุเหตุผลในการยกเลิก:', 'ตั้งงบผิด');
    if (note == null || note.trim() === '') {
      this.snackBar.open('กรุณาระบุเหตุผล', 'ปิด', { duration: 3000 });
      return;
    }

    this.budgetSvc.voidSpecialBudget({
      project_id: pid,
      unit_id: unitId,
      budget_source_type: sourceType as any,
      note: note.trim(),
    }).subscribe({
      next: (res) => {
        const msg = res.data.status === 'approved' ? 'ยกเลิกงบสำเร็จ' : 'ส่งคำขอยกเลิกสำเร็จ รอการอนุมัติ';
        this.snackBar.open(msg, 'ปิด', { duration: 3000 });
        this.loadMovements();
        this.loadSummaries();
      },
      error: (err) => {
        this.snackBar.open(err?.error?.error || 'เกิดข้อผิดพลาด', 'ปิด', { duration: 5000 });
      },
    });
  }

  private doOpenReturnDialog(pid: number, unitId: number, unitCode: string, sourceType: string, allocated: number, used: number, remaining: number): void {
    const approvalRequired = (this.projectSvc.selectedProject() as any)?.approval_required;

    const ref = this.dialog.open(ReturnSpecialBudgetDialogComponent, {
      data: {
        project_id: pid,
        unit_id: unitId,
        unit_code: unitCode,
        budget_source_type: sourceType,
        budget_source_label: this.sourceLabel(sourceType),
        allocated,
        used,
        remaining,
        approval_required: !!Number(approvalRequired),
      } as ReturnSpecialBudgetDialogData,
      width: '480px',
      maxHeight: '90vh',
    });

    ref.afterClosed().subscribe(result => {
      if (result) {
        this.loadMovements();
        this.loadSummaries();
      }
    });
  }

  // ── Budget Remaining Check ──
  isFullyReturned(m: BudgetMovement): boolean {
    const allocTypes = ['ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'];
    if (!allocTypes.includes(m.movement_type)) return false;
    const key = (m as any).unit_id + ':' + m.budget_source_type;
    return (this.unitRemainingMap()[key] ?? -1) === 0;
  }

  // ── Helpers ──
  get totalPreview(): number {
    const amt = Number(this.addForm.get('amount')?.value ?? 0);
    const allUnits = this.addForm.get('all_units')?.value;
    const count = allUnits ? this.units().length : (this.addForm.get('unit_ids')?.value ?? []).length;
    return amt * count;
  }

  get previewUnitCount(): number {
    const allUnits = this.addForm.get('all_units')?.value;
    return allUnits ? this.units().length : (this.addForm.get('unit_ids')?.value ?? []).length;
  }

  sourceLabel(s: string): string {
    const map: Record<string, string> = {
      MANAGEMENT_SPECIAL: 'งบพิเศษผู้บริหาร',
      PROJECT_POOL: 'งบส่วนกลาง',
    };
    return map[s] ?? s;
  }

  moveTypeLabel(t: string): string {
    const map: Record<string, string> = {
      ALLOCATE: 'จัดสรร',
      USE: 'ใช้',
      RETURN: 'คืน',
      SPECIAL_BUDGET_ADD: 'เพิ่มงบ',
      SPECIAL_BUDGET_ALLOCATE: 'จัดสรร',
      SPECIAL_BUDGET_USE: 'ใช้',
      SPECIAL_BUDGET_RETURN: 'คืน',
      SPECIAL_BUDGET_VOID: 'ยกเลิก',
      SPECIAL_BUDGET_TRANSFER_OUT: 'โอนออก',
      SPECIAL_BUDGET_TRANSFER_IN: 'โอนเข้า',
    };
    return map[t] ?? t;
  }

  moveTypeClass(t: string): string {
    const map: Record<string, string> = {
      ALLOCATE: 'bg-green-50 text-green-700',
      USE: 'bg-red-50 text-red-700',
      RETURN: 'bg-amber-50 text-amber-700',
      SPECIAL_BUDGET_ADD: 'bg-blue-50 text-blue-700',
      SPECIAL_BUDGET_ALLOCATE: 'bg-green-50 text-green-700',
      SPECIAL_BUDGET_USE: 'bg-red-50 text-red-700',
      SPECIAL_BUDGET_RETURN: 'bg-amber-50 text-amber-700',
      SPECIAL_BUDGET_VOID: 'bg-slate-100 text-slate-600',
      SPECIAL_BUDGET_TRANSFER_OUT: 'bg-orange-50 text-orange-700',
      SPECIAL_BUDGET_TRANSFER_IN: 'bg-teal-50 text-teal-700',
    };
    return map[t] ?? 'bg-slate-100 text-slate-600';
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = { approved: 'อนุมัติ', pending: 'รอการอนุมัติ', rejected: 'ปฏิเสธ' };
    return map[s] ?? s;
  }

  statusClass(s: string): string {
    const map: Record<string, string> = {
      approved: 'bg-green-50 text-green-700',
      pending: 'bg-amber-50 text-amber-700',
      rejected: 'bg-red-50 text-red-700',
    };
    return map[s] ?? 'bg-slate-100 text-slate-600';
  }

  isPositiveType(type: string): boolean {
    return ['ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE', 'SPECIAL_BUDGET_TRANSFER_IN'].includes(type);
  }

  formatCurrency(v: number): string {
    return (v ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDate(d: string): string {
    return formatThaiDate(d, 'auto-datetime');
  }

  // ── โอนงบพิเศษ ──
  openTransferDialog(unitId: number, unitCode: string, sourceType: string, remaining?: number): void {
    const pid = this.projectId();
    if (!pid) return;

    // ถ้าไม่ได้ส่ง remaining → fetch summary ก่อน
    if (remaining == null) {
      this.budgetSvc.getUnitSummary(unitId, pid).subscribe({
        next: summary => {
          const src = (summary as any)[sourceType] as SourceSummary;
          if (!src || src.remaining <= 0) {
            this.snackBar.open('ไม่มีงบคงเหลือให้โอน', 'ปิด', { duration: 3000 });
            return;
          }
          this.doOpenTransferDialog(pid, unitId, unitCode, sourceType, src.remaining);
        },
        error: () => this.snackBar.open('โหลดข้อมูลงบล้มเหลว', 'ปิด', { duration: 3000 }),
      });
    } else {
      this.doOpenTransferDialog(pid, unitId, unitCode, sourceType, remaining);
    }
  }

  private doOpenTransferDialog(pid: number, unitId: number, unitCode: string, sourceType: string, remaining: number): void {
    const sourceLabel = this.sourceLabel(sourceType);
    const ref = this.dialog.open(TransferSpecialBudgetDialogComponent, {
      data: {
        from_unit_id: unitId,
        from_unit_code: unitCode,
        budget_source_type: sourceType,
        budget_source_label: sourceLabel,
        remaining,
        project_id: pid,
      } as TransferSpecialBudgetDialogData,
      width: '500px',
      maxHeight: '90vh',
    });

    ref.afterClosed().subscribe(result => {
      if (result) {
        this.loadMovements();
        this.loadSummaries();
      }
    });
  }

  // ── Summary footer totals ──
  get summaryTotals(): UnitSpecialSummary {
    const list = this.filteredSummaries();
    return {
      unit_id: 0, unit_code: 'รวม',
      ms_allocated: list.reduce((s, r) => s + r.ms_allocated, 0),
      ms_used: list.reduce((s, r) => s + r.ms_used, 0),
      ms_remaining: list.reduce((s, r) => s + r.ms_remaining, 0),
      pp_allocated: list.reduce((s, r) => s + r.pp_allocated, 0),
      pp_used: list.reduce((s, r) => s + r.pp_used, 0),
      pp_remaining: list.reduce((s, r) => s + r.pp_remaining, 0),
      cs_allocated: list.reduce((s, r) => s + r.cs_allocated, 0),
      cs_used: list.reduce((s, r) => s + r.cs_used, 0),
      cs_remaining: list.reduce((s, r) => s + r.cs_remaining, 0),
      total_remaining: list.reduce((s, r) => s + r.total_remaining, 0),
    };
  }
}
