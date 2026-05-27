import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UnitApiService, CaldiscountSoldSyncRow, CaldiscountSoldRowStatus } from '../unit-api.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

export interface CaldiscountSoldSyncDialogData {
  projectId: number;
  projectName?: string;
}

type StatusFilter = 'all' | 'will_update' | 'no_change' | 'conflict' | 'not_found';

@Component({
  selector: 'app-caldiscount-sold-sync-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatDialogModule, MatCheckboxModule,
    MatProgressSpinnerModule, MatTooltipModule, SvgIconComponent,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800 flex items-center gap-2">
      ดึงสถานะขาย/โอน จาก Caldiscount
      @if (data.projectName) { <span class="text-slate-500 font-normal text-sm">— {{ data.projectName }}</span> }
    </h2>

    <mat-dialog-content style="max-height: calc(90vh - 130px)">

      @if (loading()) {
        <div class="flex flex-col items-center justify-center py-16">
          <mat-spinner diameter="40" />
          <p class="mt-3 text-slate-500">กำลังเปรียบเทียบสถานะ...</p>
        </div>
      } @else if (error()) {
        <div class="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{{ error() }}</div>
      } @else {
        <!-- ── Summary ── -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          <div class="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <div class="text-[11px] text-slate-500 uppercase tracking-wide">ทั้งหมด</div>
            <div class="text-base font-semibold text-slate-800 num">{{ summary().total }}</div>
          </div>
          <div class="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
            <div class="text-[11px] text-amber-700 uppercase tracking-wide">เปลี่ยนแปลง</div>
            <div class="text-base font-semibold text-amber-800 num">{{ summary().will_update }}</div>
          </div>
          <div class="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <div class="text-[11px] text-slate-500 uppercase tracking-wide">ไม่เปลี่ยน</div>
            <div class="text-base font-semibold text-slate-700 num">{{ summary().no_change }}</div>
          </div>
          <div class="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200">
            <div class="text-[11px] text-rose-700 uppercase tracking-wide">ขัดแย้ง (ข้าม)</div>
            <div class="text-base font-semibold text-rose-800 num">{{ summary().conflict }}</div>
          </div>
          <div class="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <div class="text-[11px] text-slate-500 uppercase tracking-wide">ไม่พบใน Cal</div>
            <div class="text-base font-semibold text-slate-700 num">{{ summary().not_found }}</div>
          </div>
        </div>

        <!-- ── Filter chips + select all ── -->
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex flex-wrap gap-1.5">
            @for (f of filterOptions; track f.key) {
              <button type="button"
                class="px-2.5 py-1 rounded text-xs font-medium border transition-colors"
                [class.bg-indigo-600]="filter() === f.key"
                [class.text-white]="filter() === f.key"
                [class.border-indigo-600]="filter() === f.key"
                [class.bg-white]="filter() !== f.key"
                [class.text-slate-700]="filter() !== f.key"
                [class.border-slate-300]="filter() !== f.key"
                [class.hover:bg-slate-100]="filter() !== f.key"
                (click)="filter.set(f.key)">
                {{ f.label }}
              </button>
            }
          </div>
          <div class="flex items-center gap-3 text-sm">
            <span class="text-slate-500">เลือก: <span class="font-semibold text-slate-800 num">{{ selectedCount() }}</span> จาก <span class="num">{{ updatableCount() }}</span></span>
            <button type="button" class="text-indigo-600 hover:underline" (click)="selectAllUpdatable()">เลือกทั้งหมด</button>
            <span class="text-slate-300">|</span>
            <button type="button" class="text-indigo-600 hover:underline" (click)="clearSelection()">ล้างการเลือก</button>
          </div>
        </div>

        <!-- ── Table ── -->
        <div class="border border-slate-200 rounded-lg overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 sticky top-0 z-10">
              <tr class="text-left">
                <th class="px-2 py-2 w-10"></th>
                <th class="px-3 py-2 font-semibold text-slate-600">รหัสยูนิต</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-center">สถานะเดิม</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-center">→ ใหม่</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-center">วันที่ขาย</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-center">วันที่โอน</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-center">ผล</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of filteredRows(); track row.unit_code) {
                <tr class="hover:bg-slate-50/60"
                    [class.bg-amber-50/40]="row.status === 'will_update'"
                    [class.bg-rose-50/30]="row.status === 'conflict'"
                    [class.opacity-60]="row.status === 'not_found'">
                  <td class="px-2 py-1.5 text-center">
                    @if (row.status === 'will_update') {
                      <input type="checkbox"
                             [checked]="isSelected(row)"
                             (change)="toggleSelect(row, $any($event.target).checked)"
                             class="cursor-pointer accent-indigo-600" />
                    }
                  </td>
                  <td class="px-3 py-1.5 font-mono text-slate-800">
                    <span>{{ row.unit_code }}</span>
                    @if (row.note) {
                      <div class="text-[10px] mt-0.5"
                           [class.text-rose-600]="row.status === 'conflict'"
                           [class.text-slate-500]="row.status !== 'conflict'">
                        {{ row.note }}
                      </div>
                    }
                  </td>
                  <td class="px-3 py-1.5 text-center">
                    <span class="text-xs text-slate-600">{{ statusText(row.current_status) }}</span>
                  </td>
                  <td class="px-3 py-1.5 text-center">
                    @if (row.new_status) {
                      <span class="text-xs font-semibold"
                            [class.text-amber-700]="row.new_status !== row.current_status"
                            [class.text-slate-700]="row.new_status === row.current_status">
                        {{ statusText(row.new_status) }}
                      </span>
                    } @else {
                      <span class="text-slate-300">—</span>
                    }
                  </td>
                  <td class="px-3 py-1.5 text-center text-xs num text-slate-600">
                    {{ row.new_sale_date ?? row.current_sale_date ?? '—' }}
                  </td>
                  <td class="px-3 py-1.5 text-center text-xs num text-slate-600">
                    {{ row.new_transfer_date ?? row.current_transfer_date ?? '—' }}
                  </td>
                  <td class="px-3 py-1.5 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium" [class]="statusClass(row.status)">
                      {{ statusLabel(row.status) }}
                    </span>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="text-center py-10 text-slate-400">ไม่มีข้อมูลในเงื่อนไขนี้</td></tr>
              }
            </tbody>
          </table>
        </div>

        <p class="text-xs text-slate-500 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>📌 <code class="font-mono">is_trans=1</code> หรือ <code class="font-mono">is_sold=1</code> → บันทึกเป็น <span class="text-emerald-700 font-medium">โอนแล้ว</span> ทั้งคู่</span>
          <span>· จะสร้าง <span class="text-slate-700 font-medium">รายการขายระบบเก่า</span> (sale_no = <code class="font-mono">LEGACY-{{ '{' }}unit_code{{ '}' }}</code>) อัตโนมัติ — read-only ไม่นับเข้างบ</span>
          <span>· ยูนิตที่มีรายการขายในระบบใหม่จะถูก <span class="text-rose-700 font-medium">ข้าม</span> อัตโนมัติ</span>
          @if (preview()?.project_code) { <span>· รหัสโครงการ <code class="font-mono">{{ preview()?.project_code }}</code></span> }
        </p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary"
              [disabled]="saving() || selectedCount() === 0"
              (click)="apply()">
        @if (saving()) { <mat-spinner diameter="18" class="!inline-block mr-1" /> }
        ยืนยันอัปเดต ({{ selectedCount() }})
      </button>
    </mat-dialog-actions>
  `,
})
export class CaldiscountSoldSyncDialogComponent implements OnInit {
  readonly data: CaldiscountSoldSyncDialogData = inject(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<CaldiscountSoldSyncDialogComponent>);
  private readonly api   = inject(UnitApiService);
  private readonly snack = inject(MatSnackBar);

  loading = signal(true);
  saving  = signal(false);
  error   = signal<string | null>(null);
  preview = signal<{ project_code: string; rows: CaldiscountSoldSyncRow[]; summary: any } | null>(null);

  readonly summary = computed(() => this.preview()?.summary ?? { total: 0, will_update: 0, no_change: 0, conflict: 0, not_found: 0 });

  selectedIds = signal<Set<number>>(new Set());

  filter = signal<StatusFilter>('all');

  readonly filterOptions: { key: StatusFilter; label: string }[] = [
    { key: 'all',         label: 'ทั้งหมด' },
    { key: 'will_update', label: 'เปลี่ยนแปลง' },
    { key: 'no_change',   label: 'ไม่เปลี่ยน' },
    { key: 'conflict',    label: 'ขัดแย้ง' },
    { key: 'not_found',   label: 'ไม่พบใน Cal' },
  ];

  readonly filteredRows = computed(() => {
    const all = this.preview()?.rows ?? [];
    const f = this.filter();
    return f === 'all' ? all : all.filter(r => r.status === f);
  });

  readonly updatableCount = computed(() => (this.preview()?.rows ?? [])
    .filter(r => r.status === 'will_update').length
  );

  readonly selectedCount = computed(() => this.selectedIds().size);

  ngOnInit(): void {
    this.api.previewCaldiscountSoldSync(this.data.projectId).subscribe({
      next: res => {
        this.preview.set({ project_code: res.project_code, rows: res.rows, summary: res.summary });
        this.loading.set(false);
        // default: tick rows ที่ "เปลี่ยนแปลง" ทั้งหมด
        const ids = new Set<number>();
        for (const r of res.rows) {
          if (r.status === 'will_update') ids.add(r.unit_id);
        }
        this.selectedIds.set(ids);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'โหลดข้อมูลไม่สำเร็จ');
      },
    });
  }

  isSelected(row: CaldiscountSoldSyncRow): boolean {
    return this.selectedIds().has(row.unit_id);
  }

  toggleSelect(row: CaldiscountSoldSyncRow, checked: boolean): void {
    const s = new Set(this.selectedIds());
    if (checked) s.add(row.unit_id); else s.delete(row.unit_id);
    this.selectedIds.set(s);
  }

  selectAllUpdatable(): void {
    const ids = new Set<number>();
    for (const r of this.preview()?.rows ?? []) {
      if (r.status === 'will_update') ids.add(r.unit_id);
    }
    this.selectedIds.set(ids);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  apply(): void {
    if (this.selectedIds().size === 0) return;
    this.saving.set(true);
    const ids = Array.from(this.selectedIds());
    this.api.applyCaldiscountSoldSync(this.data.projectId, ids).subscribe({
      next: res => {
        this.saving.set(false);
        this.snack.open(`อัปเดต ${res.updated} ยูนิตสำเร็จ${res.skipped.length ? ' (ข้าม ' + res.skipped.length + ')' : ''}`, 'ปิด', { duration: 4000 });
        if (res.skipped.length > 0 || res.errors.length > 0) {
          console.warn('[caldiscount sold sync]', { skipped: res.skipped, errors: res.errors });
        }
        this.dialogRef.close({ updated: res.updated });
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err?.error?.error ?? 'อัปเดตไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  statusText(s: 'available' | 'reserved' | 'sold' | 'transferred' | null): string {
    switch (s) {
      case 'available':   return 'ว่าง';
      case 'reserved':    return 'จอง';
      case 'sold':        return 'ขายแล้ว';
      case 'transferred': return 'โอนแล้ว';
      default:            return '—';
    }
  }

  statusLabel(s: CaldiscountSoldRowStatus): string {
    switch (s) {
      case 'will_update': return '🟡 เปลี่ยนแปลง';
      case 'no_change':   return '⚪ ไม่เปลี่ยน';
      case 'conflict':    return '🔴 ขัดแย้ง';
      case 'not_found':   return '⚪ ไม่พบใน Cal';
    }
  }

  statusClass(s: CaldiscountSoldRowStatus): string {
    switch (s) {
      case 'will_update': return 'bg-amber-100 text-amber-800';
      case 'no_change':   return 'bg-slate-100 text-slate-600';
      case 'conflict':    return 'bg-rose-100 text-rose-800';
      case 'not_found':   return 'bg-slate-100 text-slate-500';
    }
  }
}
