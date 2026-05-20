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
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { BudgetService, BudgetMovement } from '../services/budget.service';
import { ProjectService } from '../../../core/services/project.service';
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
    MatButtonModule,
    MatDatepickerModule,
    MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule,
    SvgIconComponent,
  ],
  templateUrl: './budget-movements.component.html',
})
export class BudgetMovementsComponent implements OnInit {
  private readonly budgetSvc  = inject(BudgetService);
  private readonly projectSvc = inject(ProjectService);
  private readonly fb         = inject(FormBuilder);
  private readonly snackBar   = inject(MatSnackBar);

  // ── state ──
  readonly movements   = signal<BudgetMovement[]>([]);
  readonly total       = signal(0);
  readonly page        = signal(1);
  readonly perPage     = signal(25);
  readonly loading     = signal(false);

  // ── computed ──
  readonly projectId = computed(() => this.projectSvc.selectedProject()?.id ?? null);

  readonly displayedColumns = ['movement_no', 'created_at', 'unit_code', 'movement_type',
    'budget_source_type', 'amount', 'status', 'note', 'created_by_name'];

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
    const map: Record<string, string> = { approved: 'อนุมัติ', voided: 'ยกเลิก' };
    return map[s] ?? s;
  }

  statusClass(s: string): string {
    const map: Record<string, string> = {
      approved: 'bg-green-50 text-green-700',
      voided:   'bg-slate-100 text-slate-500',
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
