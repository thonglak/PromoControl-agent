import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { BudgetService, BudgetMovement } from '../services/budget.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';

@Component({
  selector: 'app-budget-movements',
  standalone: true,
  imports: [
    ThaiDatePipe,
    StatusChipComponent,
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatCheckboxModule,
    MatDatepickerModule,
    MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule,
    SvgIconComponent,
  ],
  templateUrl: './budget-movements.component.html',
})
export class BudgetMovementsComponent implements OnInit {
  private readonly budgetSvc  = inject(BudgetService);
  private readonly projectSvc = inject(ProjectService);
  private readonly authSvc    = inject(AuthService);
  private readonly fb         = inject(FormBuilder);
  private readonly snackBar   = inject(MatSnackBar);

  // ── state ──
  readonly movements   = signal<BudgetMovement[]>([]);
  readonly total       = signal(0);
  readonly page        = signal(1);
  readonly perPage     = signal(25);
  readonly pendingCount = signal(0);
  readonly loading     = signal(false);
  readonly selectedIds = signal<Set<number>>(new Set());

  // ── computed ──
  readonly projectId = computed(() => this.projectSvc.selectedProject()?.id ?? null);

  readonly canApprove = computed(() => {
    const role = this.authSvc.currentUser()?.role;
    return role === 'admin' || role === 'manager';
  });

  readonly displayedColumns = computed(() => {
    const cols = ['movement_no', 'created_at', 'unit_code', 'movement_type',
                  'budget_source_type', 'amount', 'status', 'note', 'created_by_name', 'actions'];
    return this.canApprove() ? ['select', ...cols] : cols;
  });

  readonly pendingInPage = computed(() =>
    this.movements().filter(m => m.status === 'pending')
  );

  readonly allPendingSelected = computed(() => {
    const pending = this.pendingInPage();
    if (pending.length === 0) return false;
    const ids = this.selectedIds();
    return pending.every(m => ids.has(m.id));
  });

  readonly somePendingSelected = computed(() => {
    const pending = this.pendingInPage();
    const ids = this.selectedIds();
    const someSelected = pending.some(m => ids.has(m.id));
    return someSelected && !this.allPendingSelected();
  });

  // ── filter form ──
  readonly filterForm = this.fb.group({
    budget_source_type: [''],
    movement_type: [''],
    status: [''],
    date_from: [null as Date | null],
    date_to: [null as Date | null],
    search: [''],
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    const pid = this.projectId();
    if (!pid) return;

    this.loading.set(true);
    const f = this.filterForm.value;
    const params: Record<string, any> = {
      project_id: pid,
      page: this.page(),
      per_page: this.perPage(),
    };
    if (f.budget_source_type) params['budget_source_type'] = f.budget_source_type;
    if (f.movement_type) params['movement_type'] = f.movement_type;
    if (f.status) params['status'] = f.status;
    if (f.date_from) params['date_from'] = this.toISODate(f.date_from);
    if (f.date_to) params['date_to'] = this.toISODate(f.date_to);
    if (f.search) params['search'] = f.search;

    this.budgetSvc.getMovements(params).subscribe({
      next: res => {
        this.movements.set(res.data);
        this.total.set(res.total);
        // นับ pending จากข้อมูลที่ได้ (ถ้า API ไม่ส่ง pending_count มา)
        this.pendingCount.set(res.data.filter(m => m.status === 'pending').length);
        this.selectedIds.set(new Set());
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('โหลดข้อมูลล้มเหลว', 'ปิด', { duration: 3000 });
      },
    });
  }

  onFilterChange(): void {
    this.page.set(1);
    this.loadData();
  }

  resetFilters(): void {
    this.filterForm.reset();
    this.page.set(1);
    this.loadData();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.perPage.set(e.pageSize);
    this.loadData();
  }

  // ── approve / reject ──
  approve(id: number): void {
    this.budgetSvc.approveMovement(id).subscribe({
      next: () => {
        this.snackBar.open('อนุมัติรายการสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadData();
      },
      error: () => this.snackBar.open('อนุมัติล้มเหลว', 'ปิด', { duration: 3000 }),
    });
  }

  reject(id: number): void {
    const reason = window.prompt('กรุณาระบุเหตุผลที่ปฏิเสธ:');
    if (reason == null) return; // user cancelled
    this.budgetSvc.rejectMovement(id, reason).subscribe({
      next: () => {
        this.snackBar.open('ปฏิเสธรายการสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadData();
      },
      error: () => this.snackBar.open('ปฏิเสธล้มเหลว', 'ปิด', { duration: 3000 }),
    });
  }

  async bulkApprove(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    for (const id of ids) {
      try {
        await this.budgetSvc.approveMovement(id).toPromise();
      } catch {
        this.snackBar.open(`อนุมัติรายการ #${id} ล้มเหลว`, 'ปิด', { duration: 3000 });
      }
    }
    this.snackBar.open(`อนุมัติ ${ids.length} รายการสำเร็จ`, 'ปิด', { duration: 3000 });
    this.loadData();
  }

  // ── selection ──
  toggleSelect(id: number): void {
    const s = new Set(this.selectedIds());
    if (s.has(id)) { s.delete(id); } else { s.add(id); }
    this.selectedIds.set(s);
  }

  toggleSelectAll(checked: boolean): void {
    const s = new Set(this.selectedIds());
    for (const m of this.pendingInPage()) {
      if (checked) { s.add(m.id); } else { s.delete(m.id); }
    }
    this.selectedIds.set(s);
  }

  isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  // ── label / class helpers ──
  moveTypeLabel(type: string): string {
    const map: Record<string, string> = {
      ALLOCATE: 'จัดสรร', USE: 'ใช้', RETURN: 'คืน', ADJUST: 'ปรับ',
      SPECIAL_BUDGET_ADD: 'เพิ่ม(พิเศษ)',
      SPECIAL_BUDGET_ALLOCATE: 'จัดสรร(พิเศษ)', SPECIAL_BUDGET_USE: 'ใช้(พิเศษ)',
      SPECIAL_BUDGET_RETURN: 'คืน(พิเศษ)',
    };
    return map[type] ?? type;
  }

  moveTypeClass(type: string): string {
    const map: Record<string, string> = {
      ALLOCATE: 'bg-blue-50 text-blue-700',
      USE: 'bg-red-50 text-red-700',
      RETURN: 'bg-green-50 text-green-700',
      ADJUST: 'bg-amber-50 text-amber-700',
    };
    if (type.startsWith('SPECIAL_')) return 'bg-purple-50 text-purple-700';
    return map[type] ?? 'bg-slate-100 text-slate-600';
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

  sourceLabel(s: string): string {
    const map: Record<string, string> = {
      UNIT_STANDARD: 'งบมาตรฐาน', PROJECT_POOL: 'งบ Pool',
      MANAGEMENT_SPECIAL: 'งบพิเศษ',
    };
    return map[s] ?? s;
  }

  isPositiveType(type: string): boolean {
    return ['ALLOCATE', 'RETURN', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE',
            'SPECIAL_BUDGET_RETURN', 'ADJUST'].includes(type);
  }

  formatCurrency(v: number): string {
    return (v ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDate(d: string): string {
    return formatThaiDate(d, 'auto-datetime');
  }

  private toISODate(d: Date): string {
    return d.toISOString().split('T')[0];
  }
}
