import { Component, inject, input, signal, computed, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';

import { ProjectService } from '../../../core/services/project.service';
import { BudgetService, UnitBudgetSummary } from '../../budget/services/budget.service';
import { InlineBudgetDialogComponent, InlineBudgetDialogData } from './inline-budget-dialog.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { AuthService } from '../../../core/services/auth.service';

/** เฉพาะ MGMT_SPECIAL — UNIT_STANDARD ย้ายไปอยู่ใน premium-promotion-panel แล้ว */
const SOURCE_KEY = 'MANAGEMENT_SPECIAL';
const SOURCE_LABEL = 'งบผู้บริหาร';

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
          งบประมาณที่ใช้ได้ — {{ sourceLabel }}
        </h3>
        <div class="flex items-center gap-3">
          @if (loading()) {
            <mat-spinner diameter="20" />
          }
          @if (collapsed() && unitId()) {
            <span class="text-sm tabular-nums" style="color: var(--color-gray-700)">
              คงเหลือ:
              <span class="font-semibold"
                [class.text-profit]="row().remaining > 0"
                [class.text-loss]="row().remaining < 0">฿{{ row().remaining | number:'1.0-0' }}</span>
            </span>
          }
          <app-icon [name]="collapsed() ? 'chevron-right' : 'chevron-down'" class="w-5 h-5" style="color: var(--color-gray-500)" />
        </div>
      </div>

      @if (!collapsed() && unitId()) {
        <!-- Stat cards: ตั้งงบ / ใช้ไป / คงเหลือ -->
        <div class="grid grid-cols-3 gap-3 mt-3">
          <div class="p-3 text-center"
            style="border: 1px solid var(--color-border); border-radius: var(--radius-md); background-color: var(--color-gray-50)">
            <div class="text-xs mb-1" style="color: var(--color-gray-500)">ตั้งงบ</div>
            <div class="text-lg font-semibold tabular-nums" style="color: var(--color-text-primary)">
              ฿{{ row().allocated | number:'1.0-0' }}
            </div>
          </div>
          <div class="p-3 text-center"
            style="border: 1px solid var(--color-border); border-radius: var(--radius-md); background-color: var(--color-gray-50)">
            <div class="text-xs mb-1" style="color: var(--color-gray-500)">ใช้ไป</div>
            <div class="text-lg font-semibold tabular-nums text-red-600">
              ฿{{ row().used | number:'1.0-0' }}
            </div>
          </div>
          <div class="p-3 text-center"
            style="border: 1px solid var(--color-border); border-radius: var(--radius-md); background-color: var(--color-gray-50)">
            <div class="text-xs mb-1" style="color: var(--color-gray-500)">คงเหลือ</div>
            <div class="text-lg font-semibold tabular-nums"
              [class.text-sky-600]="row().remaining > 0"
              [class.text-red-600]="row().remaining < 0">
              ฿{{ row().remaining | number:'1.0-0' }}
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-center gap-2 mt-3">
          @if (canEdit()) {
            <button mat-stroked-button color="primary" class="!text-sm"
              (click)="openAllocateDialog()"
              matTooltip="ตั้งงบผู้บริหารเพิ่ม">
              + ตั้งงบเพิ่ม
            </button>
          }
          @if (canReturnBudget() && row().allocated > 0) {
            <button mat-stroked-button class="!text-sm !text-slate-600 !border-slate-300"
              (click)="openVoidDialog()"
              matTooltip="ยกเลิกงบทั้งก้อน">
              ยกเลิกงบ
            </button>
          }
        </div>

        @if (allowOverBudget() && row().remaining < 0) {
          <div class="mt-3 flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <app-icon name="exclamation-triangle" class="w-5 h-5 text-amber-500 shrink-0" />
            <span>โครงการนี้อนุญาตให้บันทึกเกินงบได้ — งบคงเหลือติดลบ กรุณาตรวจสอบ</span>
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
  /** edit mode: จำนวนเงินจากรายการเดิมที่ต้องหักกลับ เช่น { MANAGEMENT_SPECIAL: 180000 } */
  editReversal = input<Record<string, number>>({});

  // Constants for template
  readonly sourceLabel = SOURCE_LABEL;

  // State
  readonly collapsed = signal(false);
  readonly loading = signal(false);
  readonly summary = signal<UnitBudgetSummary | null>(null);

  /** real-time pending used จาก Panel 3A/3B (key = budget_source_type) */
  readonly pendingUsed = signal<Record<string, number>>({});

  readonly canEdit = computed(() => this.project.canEdit());
  readonly canReturnBudget = computed(() => {
    const role = this.authSvc.currentUser()?.role;
    return (role === 'admin' || role === 'manager') && this.canEdit();
  });
  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  /** ตัวเลขเฉพาะ MANAGEMENT_SPECIAL (รวม pending + edit reversal) */
  readonly row = computed(() => {
    const s = this.summary();
    const src = s ? (s as any)[SOURCE_KEY] ?? { allocated: 0, used: 0, returned: 0, remaining: 0 } : { allocated: 0, used: 0, returned: 0, remaining: 0 };
    const pendingAmount = this.pendingUsed()[SOURCE_KEY] ?? 0;
    const reversalAmount = this.editReversal()[SOURCE_KEY] ?? 0;
    return {
      allocated: src.allocated - (src.returned ?? 0),
      used: src.used - reversalAmount + pendingAmount,
      remaining: src.remaining + reversalAmount - pendingAmount,
    };
  });

  /** flag อนุญาตเกินงบ (จาก project settings) */
  readonly allowOverBudget = computed(() => !!this.project.selectedProject()?.allow_over_budget);

  private sub?: Subscription;

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
  }

  /** public API ที่ parent (sales-entry) เรียก เพื่อ push pending used realtime */
  updatePendingUsed(used: Record<string, number>): void {
    this.pendingUsed.set(used);
  }

  // ─── Actions ───────────────────────────────────────────────────────────

  openAllocateDialog(): void {
    const dialogData: InlineBudgetDialogData = {
      unitId: this.unitId(),
      projectId: this.projectId(),
      budgetSourceType: SOURCE_KEY,
      budgetSourceLabel: SOURCE_LABEL,
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

  openVoidDialog(): void {
    if (this.pendingItemSources().includes(SOURCE_KEY)) {
      this.snack.open('มีรายการโปรโมชั่นที่ใช้งบนี้อยู่ กรุณาบันทึกหรือลบรายการก่อน', 'ปิด', { duration: 5000 });
      return;
    }

    const s = this.summary();
    const src = s ? (s as any)[SOURCE_KEY] : null;
    if (!src || src.remaining <= 0) return;

    const amtStr = src.remaining.toLocaleString('th-TH');
    const warnUsed = src.used > 0
      ? `\n\n⚠️ มีการใช้งบไปแล้ว ฿${src.used.toLocaleString('th-TH')} — หลังยกเลิก คงเหลือจะติดลบ`
      : '';
    const ok = confirm(`ต้องการยกเลิก${SOURCE_LABEL} จำนวน ฿${amtStr} ?${warnUsed}`);
    if (!ok) return;

    this.budgetSvc.voidSpecialBudget({
      project_id: this.projectId(),
      unit_id: this.unitId(),
      budget_source_type: SOURCE_KEY as any,
      note: 'ยกเลิกงบ',
    }).subscribe({
      next: () => {
        this.snack.open('ยกเลิกงบสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadSummary();
      },
      error: (err) => this.snack.open(err?.error?.error || 'เกิดข้อผิดพลาด', 'ปิด', { duration: 5000 }),
    });
  }
}
