import { Component, inject, input, signal, computed, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';

import { ProjectService } from '../../../core/services/project.service';
import { BudgetService, UnitBudgetSummary, SourceSummary, PoolBalance } from '../../budget/services/budget.service';
import { InlineBudgetDialogComponent, InlineBudgetDialogData } from './inline-budget-dialog.component';
import { ReturnSpecialBudgetDialogComponent, ReturnSpecialBudgetDialogData } from '../../budget/dialogs/return-special-budget-dialog.component';
import { TransferSpecialBudgetDialogComponent, TransferSpecialBudgetDialogData } from '../../budget/dialogs/transfer-special-budget-dialog.component';
import { ReturnUnitBudgetDialogComponent, ReturnUnitBudgetDialogData } from './return-unit-budget-dialog.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { AuthService } from '../../../core/services/auth.service';

interface BudgetRow {
  key: string;
  label: string;
  allocated: number;
  used: number;
  remaining: number;
  canAllocate: boolean;
}

const SOURCE_CONFIG: { key: string; label: string; canAllocate: boolean }[] = [
  { key: 'UNIT_STANDARD', label: 'งบยูนิต', canAllocate: false },
  { key: 'MANAGEMENT_SPECIAL', label: 'งบผู้บริหาร', canAllocate: true },
  { key: 'PROJECT_POOL', label: 'งบส่วนกลาง', canAllocate: true },
];

@Component({
  selector: 'app-budget-overview-section',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatDialogModule, SvgIconComponent,
    MatSnackBarModule, MatTooltipModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="section-card">
      <div class="flex items-center justify-between cursor-pointer" (click)="collapsed.set(!collapsed())">
        <h3 style="font-size: var(--font-size-card-title); color: var(--color-text-primary)" class="font-semibold m-0">
          งบประมาณที่ใช้ได้
        </h3>
        <div class="flex items-center gap-3">
          @if (loading()) {
            <mat-spinner diameter="20" />
          }
          @if (collapsed() && unitId()) {
            <span class="text-sm tabular-nums" style="color: var(--color-gray-700)">
              รวม: <span class="font-semibold" [class.text-profit]="totalRemaining() > 0" [class.text-loss]="totalRemaining() < 0">฿{{ totalRemaining() | number:'1.0-0' }}</span>
            </span>
          }
          <app-icon [name]="collapsed() ? 'chevron-right' : 'chevron-down'" class="w-5 h-5" style="color: var(--color-gray-500)" />
        </div>
      </div>

      @if (!collapsed() && unitId()) {
        <div class="overflow-x-auto mt-3">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500 border-b border-slate-200">
                <th class="py-2 pr-4 font-medium">แหล่งงบ</th>
                <th class="py-2 pr-4 font-medium text-right">ตั้งงบ</th>
                <th class="py-2 pr-4 font-medium text-right">ใช้ไป</th>
                <th class="py-2 pr-4 font-medium text-right">คงเหลือ</th>
                <th class="py-2 font-medium text-center w-24">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (row of budgetRows(); track row.key) {
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                  <td class="py-2 pr-4 font-medium text-slate-700">{{ row.label }}</td>
                  <td class="py-2 pr-4 text-right tabular-nums">฿{{ row.allocated | number:'1.0-0' }}</td>
                  <td class="py-2 pr-4 text-right tabular-nums text-red-600">฿{{ row.used | number:'1.0-0' }}</td>
                  <td class="py-2 pr-4 text-right tabular-nums"
                    [class.text-sky-600]="row.remaining > 0"
                    [class.text-red-600]="row.remaining < 0"
                    [class.font-semibold]="true">
                    ฿{{ row.remaining | number:'1.0-0' }}
                  </td>
                  <td class="py-2 text-center">
                    <div class="flex justify-center gap-1">
                      @if (row.canAllocate && canEdit()) {
                        <button mat-stroked-button class="!min-w-0 !px-2 !py-0 !text-xs"
                          (click)="openAllocateDialog(row.key, row.label)"
                          matTooltip="ตั้งงบเพิ่มเติม">
                          + ตั้งงบ
                        </button>
                      }
                      @if (!row.canAllocate && row.key === 'UNIT_STANDARD' && row.remaining > 0 && canReturnBudget() && unitStatus() === 'transferred') {
                        <button mat-stroked-button class="!min-w-0 !px-2 !py-0 !text-xs !text-sky-700 !border-sky-300"
                          (click)="openReturnToPoolDialog(row)"
                          matTooltip="คืนงบยูนิตเข้า Pool">
                          คืนงบ Pool
                        </button>
                      }
                      @if (row.canAllocate && row.allocated > 0 && row.remaining > 0 && canReturnBudget()) {
                        @if (row.key !== 'MANAGEMENT_SPECIAL') {
                          <button mat-stroked-button class="!min-w-0 !px-2 !py-0 !text-xs !text-sky-700 !border-sky-300"
                            (click)="openTransferDialog(row)"
                            matTooltip="โอนงบไป unit อื่น">
                            โอนงบ
                          </button>
                        }
                        @if (row.used === 0) {
                          <button mat-stroked-button class="!min-w-0 !px-2 !py-0 !text-xs !text-slate-600 !border-slate-300"
                            (click)="openVoidDialog(row)"
                            matTooltip="ยกเลิกงบทั้งก้อน (ตั้งผิด)">
                            ยกเลิก
                          </button>
                        }
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="font-semibold text-slate-800 border-t-2 border-slate-300">
                <td class="py-2 pr-4">รวม</td>
                <td class="py-2 pr-4 text-right tabular-nums">฿{{ totalAllocated() | number:'1.0-0' }}</td>
                <td class="py-2 pr-4 text-right tabular-nums text-red-600">฿{{ totalUsed() | number:'1.0-0' }}</td>
                <td class="py-2 pr-4 text-right tabular-nums"
                  [class.text-sky-600]="totalRemaining() > 0"
                  [class.text-red-600]="totalRemaining() < 0">
                  ฿{{ totalRemaining() | number:'1.0-0' }}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        @if (allowOverBudget() && hasOverBudget()) {
          <div class="mt-3 flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <app-icon name="exclamation-triangle" class="w-5 h-5 text-amber-500 shrink-0" />
            <span>โครงการนี้อนุญาตให้บันทึกเกินงบได้ — มีงบคงเหลือติดลบ กรุณาตรวจสอบ</span>
          </div>
        }
      } @else if (!collapsed()) {
        <div class="text-sm py-4 text-center" style="color: var(--color-gray-500)">กรุณาเลือกยูนิตก่อน</div>
      }
    </div>
  `,
})
export class BudgetOverviewSectionComponent implements OnDestroy {
  private project = inject(ProjectService);
  private budgetSvc = inject(BudgetService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private authSvc = inject(AuthService);

  // Inputs
  unitId = input<number>(0);
  pendingItemSources = input<string[]>([]);
  /** edit mode: จำนวนเงินจากรายการเดิมที่ต้องหักกลับ เช่น { UNIT_STANDARD: 200000, MANAGEMENT_SPECIAL: 180000 } */
  editReversal = input<Record<string, number>>({});
  /** สถานะยูนิตปัจจุบัน — ใช้ตัดสินว่าซ่อนปุ่ม "คืนงบ Pool" หรือไม่ (คืนได้เฉพาะ transferred) */
  unitStatus = input<string | null>(null);

  // State
  readonly collapsed = signal(false);
  readonly loading = signal(false);
  readonly summary = signal<UnitBudgetSummary | null>(null);
  readonly poolBalance = signal<PoolBalance | null>(null);

  /**
   * budgetUsed — real-time update จาก Panel 3A/3B
   * key = budget_source_type, value = จำนวนเงินที่ใช้ไปจากรายการที่กำลังสร้าง (ยังไม่บันทึก)
   */
  readonly pendingUsed = signal<Record<string, number>>({});

  readonly canEdit = computed(() => this.project.canEdit());
  readonly canReturnBudget = computed(() => {
    const role = this.authSvc.currentUser()?.role;
    return (role === 'admin' || role === 'manager') && this.canEdit();
  });
  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  readonly budgetRows = computed<BudgetRow[]>(() => {
    const s = this.summary();
    const pending = this.pendingUsed();
    const reversal = this.editReversal();
    return SOURCE_CONFIG.map(cfg => {
      const src = s ? (s as any)[cfg.key] ?? { allocated: 0, used: 0, returned: 0, remaining: 0 } : { allocated: 0, used: 0, returned: 0, remaining: 0 };
      const pendingAmount = pending[cfg.key] ?? 0;
      const reversalAmount = reversal[cfg.key] ?? 0;
      // ตั้งงบสุทธิ = allocated - returned (เช่น ยกเลิกขาย → RETURN หมด → ตั้งงบ = 0)
      // edit mode: หัก reversal (รายการเดิม) ออกจาก used → เพิ่มกลับ remaining
      return {
        key: cfg.key,
        label: cfg.label,
        allocated: src.allocated - (src.returned ?? 0),
        used: src.used - reversalAmount + pendingAmount,
        remaining: src.remaining + reversalAmount - pendingAmount,
        canAllocate: cfg.canAllocate,
      };
    });
  });

  readonly totalAllocated = computed(() => this.budgetRows().reduce((s, r) => s + r.allocated, 0));
  readonly totalUsed = computed(() => this.budgetRows().reduce((s, r) => s + r.used, 0));
  readonly totalRemaining = computed(() => this.budgetRows().reduce((s, r) => s + r.remaining, 0));

  /** flag อนุญาตเกินงบ (จาก project settings) */
  readonly allowOverBudget = computed(() => !!this.project.selectedProject()?.allow_over_budget);
  /** true เมื่อมีแหล่งงบใดคงเหลือติดลบ */
  readonly hasOverBudget = computed(() => this.budgetRows().some(r => r.remaining < 0));

  private sub?: Subscription;
  private poolSub?: Subscription;

  private unitIdEffect = effect(() => {
    const uid = this.unitId();
    if (uid > 0) {
      this.loadSummary(uid);
    } else {
      this.summary.set(null);
    }
  });

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.poolSub?.unsubscribe();
  }


  loadSummary(unitId?: number): void {
    const uid = unitId ?? this.unitId();
    const pid = this.projectId();
    if (uid <= 0 || pid <= 0) return;

    this.loading.set(true);
    this.sub?.unsubscribe();
    this.sub = this.budgetSvc.getUnitSummary(uid, pid).subscribe({
      next: data => { this.summary.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });

    // โหลด pool balance สำหรับ validate
    this.poolSub?.unsubscribe();
    this.poolSub = this.budgetSvc.getPoolBalance(pid).subscribe({
      next: data => this.poolBalance.set(data),
    });
  }

  updatePendingUsed(used: Record<string, number>): void {
    this.pendingUsed.set(used);
  }

  getRemainingBySource(sourceType: string): number {
    const row = this.budgetRows().find(r => r.key === sourceType);
    return row?.remaining ?? 0;
  }

  getAllocatedBySource(sourceType: string): number {
    const row = this.budgetRows().find(r => r.key === sourceType);
    return row?.allocated ?? 0;
  }

  openAllocateDialog(sourceType: string, sourceLabel: string): void {
    const dialogData: InlineBudgetDialogData = {
      unitId: this.unitId(),
      projectId: this.projectId(),
      budgetSourceType: sourceType,
      budgetSourceLabel: sourceLabel,
      poolRemaining: sourceType === 'PROJECT_POOL' ? this.poolBalance()?.pool_remaining : undefined,
    };

    const ref = this.dialog.open(InlineBudgetDialogComponent, {
      data: dialogData,
      width: '420px',
      maxHeight: '90vh',
    });

    ref.afterClosed().subscribe(result => {
      if (result) {
        this.snack.open('ตั้งงบสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadSummary();
      }
    });
  }
  openVoidDialog(row: BudgetRow): void {
    if (this.pendingItemSources().includes(row.key)) {
      this.snack.open('มีรายการโปรโมชั่นที่ใช้งบนี้อยู่ กรุณาบันทึกหรือลบรายการก่อน', 'ปิด', { duration: 5000 });
      return;
    }

    const s = this.summary();
    const src = s ? (s as any)[row.key] : null;
    if (!src || src.remaining <= 0) return;
    if (src.used > 0) {
      this.snack.open('ไม่สามารถยกเลิกได้ เพราะมีการใช้งบไปแล้ว — กรุณาใช้ "คืนงบ" แทน', 'ปิด', { duration: 5000 });
      return;
    }

    const amtStr = src.remaining.toLocaleString('th-TH');
    const ok = confirm(`ต้องการยกเลิก${row.label} จำนวน ฿${amtStr} ?\n\nงบจะถูกยกเลิกทั้งก้อน`);
    if (!ok) return;

    const note = window.prompt('กรุณาระบุเหตุผล:', 'ตั้งงบผิด');
    if (note == null || note.trim() === '') {
      this.snack.open('กรุณาระบุเหตุผล', 'ปิด', { duration: 3000 });
      return;
    }

    this.budgetSvc.voidSpecialBudget({
      project_id: this.projectId(),
      unit_id: this.unitId(),
      budget_source_type: row.key as any,
      note: note.trim(),
    }).subscribe({
      next: () => {
        this.snack.open('ยกเลิกงบสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadSummary();
      },
      error: (err) => this.snack.open(err?.error?.error || 'เกิดข้อผิดพลาด', 'ปิด', { duration: 5000 }),
    });
  }

  openReturnDialog(row: BudgetRow): void {
    // ตรวจว่ามีรายการใช้งบอยู่ที่ยังไม่ได้ save
    if (this.pendingItemSources().includes(row.key)) {
      this.snack.open('มีรายการโปรโมชั่นที่ใช้งบนี้อยู่ กรุณาบันทึกหรือลบรายการก่อนคืนงบ', 'ปิด', { duration: 5000 });
      return;
    }

    const s = this.summary();
    const src = s ? (s as any)[row.key] : null;

    const dialogData: ReturnSpecialBudgetDialogData = {
      project_id: this.projectId(),
      unit_id: this.unitId(),
      unit_code: s?.unit_code ?? '',
      budget_source_type: row.key,
      budget_source_label: row.label,
      allocated: src?.allocated ?? 0,
      used: src?.used ?? 0,
      remaining: src?.remaining ?? 0,
      approval_required: (this.project.selectedProject() as any)?.approval_required,
    };

    const ref = this.dialog.open(ReturnSpecialBudgetDialogComponent, {
      data: dialogData,
      width: '480px',
      maxHeight: '90vh',
    });

    ref.afterClosed().subscribe(result => {
      if (result) {
        this.snack.open('คืนงบสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadSummary();
      }
    });
  }

  openTransferDialog(row: BudgetRow): void {
    if (this.pendingItemSources().includes(row.key)) {
      this.snack.open('มีรายการโปรโมชั่นที่ใช้งบนี้อยู่ กรุณาบันทึกหรือลบรายการก่อน', 'ปิด', { duration: 5000 });
      return;
    }

    const s = this.summary();
    const src = s ? (s as any)[row.key] : null;

    const dialogData: TransferSpecialBudgetDialogData = {
      from_unit_id: this.unitId(),
      from_unit_code: s?.unit_code ?? '',
      budget_source_type: row.key,
      budget_source_label: row.label,
      remaining: src?.remaining ?? 0,
      project_id: this.projectId(),
    };

    const ref = this.dialog.open(TransferSpecialBudgetDialogComponent, {
      data: dialogData,
      width: '500px',
      maxHeight: '90vh',
    });

    ref.afterClosed().subscribe(result => {
      if (result) {
        this.snack.open('โอนงบสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadSummary();
      }
    });
  }


  openReturnToPoolDialog(row: BudgetRow): void {
    const s = this.summary();

    const dialogData: ReturnUnitBudgetDialogData = {
      unitId: this.unitId(),
      unitCode: s?.unit_code ?? '',
      projectId: this.projectId(),
      budgetUnitRemaining: row.remaining,
    };

    const ref = this.dialog.open(ReturnUnitBudgetDialogComponent, {
      data: dialogData,
      width: '420px',
      maxHeight: '90vh',
    });

    ref.afterClosed().subscribe(result => {
      if (result) {
        this.snack.open('คืนงบเข้า Pool สำเร็จ', 'ปิด', { duration: 3000 });
        this.loadSummary();
      }
    });
  }

}