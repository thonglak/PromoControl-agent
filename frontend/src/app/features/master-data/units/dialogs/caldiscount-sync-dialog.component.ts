import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UnitApiService, CaldiscountSyncRow, CaldiscountRowStatus } from '../unit-api.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

export interface CaldiscountSyncDialogData {
  projectId: number;
  projectName?: string;
}

type StatusFilter = 'all' | 'will_update' | 'no_change' | 'not_found' | 'cal_only';

@Component({
  selector: 'app-caldiscount-sync-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatDialogModule, MatCheckboxModule,
    MatProgressSpinnerModule, MatTooltipModule, SvgIconComponent,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800 flex items-center gap-2">
      Sync ต้นทุน &amp; ราคาประเมิน จาก Caldiscount
      @if (data.projectName) { <span class="text-slate-500 font-normal text-sm">— {{ data.projectName }}</span> }
    </h2>

    <mat-dialog-content class="!max-h-[80vh] !overflow-hidden flex flex-col">

      @if (loading()) {
        <div class="flex flex-col items-center justify-center py-16">
          <mat-spinner diameter="40" />
          <p class="mt-3 text-slate-500">กำลังเปรียบเทียบข้อมูล...</p>
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
            <div class="text-[11px] text-rose-700 uppercase tracking-wide">ไม่พบใน Cal</div>
            <div class="text-base font-semibold text-rose-800 num">{{ summary().not_found }}</div>
          </div>
          <div class="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
            <div class="text-[11px] text-blue-700 uppercase tracking-wide">มีใน Cal เท่านั้น</div>
            <div class="text-base font-semibold text-blue-800 num">{{ summary().cal_only }}</div>
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
        <div class="flex-1 overflow-auto border border-slate-200 rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 sticky top-0 z-10">
              <tr class="text-left">
                <th class="px-2 py-2 w-10"></th>
                <th class="px-3 py-2 font-semibold text-slate-600">รหัสยูนิต</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-right">ต้นทุนเดิม</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-right">→ ใหม่</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-right">ราคาประเมินเดิม</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-right">→ ใหม่</th>
                <th class="px-3 py-2 font-semibold text-slate-600 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of filteredRows(); track row.unit_code) {
                <tr class="hover:bg-slate-50/60"
                    [class.bg-amber-50/40]="row.status === 'will_update'"
                    [class.opacity-60]="row.status === 'cal_only' || row.status === 'not_found'">
                  <td class="px-2 py-1.5 text-center">
                    @if (row.status === 'will_update' || row.status === 'no_change') {
                      <input type="checkbox"
                             [checked]="isSelected(row)"
                             (change)="toggleSelect(row, $any($event.target).checked)"
                             class="cursor-pointer accent-indigo-600" />
                    }
                  </td>
                  <td class="px-3 py-1.5 font-mono text-slate-800">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span>{{ row.unit_code }}</span>
                      @if (row.match_type === 'normalized' && row.cal_unit_code && row.cal_unit_code !== row.unit_code) {
                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 border border-indigo-200"
                              matTooltip="ระบบจับคู่อัตโนมัติ — รหัสไม่ตรงเป๊ะแต่ normalize แล้วตรงกัน">
                          🔗 {{ row.cal_unit_code }}
                        </span>
                      }
                    </div>
                    @if (row.note) {
                      <div class="text-[10px] text-rose-600 mt-0.5">{{ row.note }}</div>
                    }
                  </td>
                  <td class="px-3 py-1.5 text-right num text-slate-600">{{ formatNum(row.current_unit_cost) }}</td>
                  <td class="px-3 py-1.5 text-right num font-semibold"
                      [class.text-amber-700]="diff(row.current_unit_cost, row.new_unit_cost)"
                      [class.text-slate-700]="!diff(row.current_unit_cost, row.new_unit_cost)">
                    {{ formatNum(row.new_unit_cost) }}
                  </td>
                  <td class="px-3 py-1.5 text-right num text-slate-600">{{ formatNum(row.current_appraisal_price) }}</td>
                  <td class="px-3 py-1.5 text-right num font-semibold"
                      [class.text-amber-700]="diff(row.current_appraisal_price, row.new_appraisal_price)"
                      [class.text-slate-700]="!diff(row.current_appraisal_price, row.new_appraisal_price)">
                    {{ formatNum(row.new_appraisal_price) }}
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
          <span>📌 mapping: <code class="font-mono">pd_bl</code> → ต้นทุน, <code class="font-mono">pd_price_ga</code> → ราคาประเมิน</span>
          @if (preview()?.project_code) { <span>· รหัสโครงการ <code class="font-mono">{{ preview()?.project_code }}</code></span> }
          @if (normalizedCount() > 0) {
            <span class="text-indigo-700">· 🔗 auto-match {{ normalizedCount() }} ตัว (รหัสต่างเล็กน้อย — ดูแถวที่มี chip <code class="font-mono">🔗</code>)</span>
          }
        </p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary"
              [disabled]="saving() || selectedCount() === 0"
              (click)="apply()">
        @if (saving()) { <mat-spinner diameter="18" class="!inline-block mr-1" /> }
        ยืนยัน sync ({{ selectedCount() }})
      </button>
    </mat-dialog-actions>
  `,
})
export class CaldiscountSyncDialogComponent implements OnInit {
  readonly data: CaldiscountSyncDialogData = inject(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<CaldiscountSyncDialogComponent>);
  private readonly api   = inject(UnitApiService);
  private readonly snack = inject(MatSnackBar);

  loading = signal(true);
  saving  = signal(false);
  error   = signal<string | null>(null);
  preview = signal<{ project_code: string; rows: CaldiscountSyncRow[]; summary: any } | null>(null);

  readonly summary = computed(() => this.preview()?.summary ?? { total: 0, will_update: 0, no_change: 0, not_found: 0, cal_only: 0 });

  /** unit_id ของแถวที่เลือก */
  selectedIds = signal<Set<number>>(new Set());

  filter = signal<StatusFilter>('all');

  readonly filterOptions: { key: StatusFilter; label: string }[] = [
    { key: 'all',         label: 'ทั้งหมด' },
    { key: 'will_update', label: 'เปลี่ยนแปลง' },
    { key: 'no_change',   label: 'ไม่เปลี่ยน' },
    { key: 'not_found',   label: 'ไม่พบใน Cal' },
    { key: 'cal_only',    label: 'มีใน Cal เท่านั้น' },
  ];

  readonly filteredRows = computed(() => {
    const all = this.preview()?.rows ?? [];
    const f = this.filter();
    return f === 'all' ? all : all.filter(r => r.status === f);
  });

  /** จำนวน rows ที่ update ได้ (มี unit_id + caldiscount มีค่า) */
  readonly updatableCount = computed(() => (this.preview()?.rows ?? [])
    .filter(r => r.unit_id !== null && (r.status === 'will_update' || r.status === 'no_change'))
    .length
  );

  readonly selectedCount = computed(() => this.selectedIds().size);

  /** จำนวนแถวที่ match แบบ normalized (รหัสต่างเล็กน้อย) */
  readonly normalizedCount = computed(() => (this.preview()?.rows ?? [])
    .filter(r => r.match_type === 'normalized')
    .length
  );

  ngOnInit(): void {
    this.api.previewCaldiscountSync(this.data.projectId).subscribe({
      next: res => {
        this.preview.set({ project_code: res.project_code, rows: res.rows, summary: res.summary });
        this.loading.set(false);
        // default: tick rows ที่ "เปลี่ยนแปลง" ทั้งหมด
        const ids = new Set<number>();
        for (const r of res.rows) {
          if (r.status === 'will_update' && r.unit_id !== null) ids.add(r.unit_id);
        }
        this.selectedIds.set(ids);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'โหลดข้อมูลไม่สำเร็จ');
      },
    });
  }

  isSelected(row: CaldiscountSyncRow): boolean {
    return row.unit_id !== null && this.selectedIds().has(row.unit_id);
  }

  toggleSelect(row: CaldiscountSyncRow, checked: boolean): void {
    if (row.unit_id === null) return;
    const s = new Set(this.selectedIds());
    if (checked) s.add(row.unit_id); else s.delete(row.unit_id);
    this.selectedIds.set(s);
  }

  selectAllUpdatable(): void {
    const ids = new Set<number>();
    for (const r of this.preview()?.rows ?? []) {
      if (r.unit_id !== null && (r.status === 'will_update' || r.status === 'no_change')) {
        ids.add(r.unit_id);
      }
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
    this.api.applyCaldiscountSync(this.data.projectId, ids).subscribe({
      next: res => {
        this.saving.set(false);
        this.snack.open(`อัปเดต ${res.updated} ยูนิตสำเร็จ${res.skipped.length ? ' (ข้าม ' + res.skipped.length + ')' : ''}`, 'ปิด', { duration: 4000 });
        if (res.skipped.length > 0 || res.errors.length > 0) {
          console.warn('[caldiscount sync]', { skipped: res.skipped, errors: res.errors });
        }
        this.dialogRef.close({ updated: res.updated });
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err?.error?.error ?? 'sync ไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  formatNum(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('th-TH').format(v);
  }

  diff(a: number | null, b: number | null): boolean {
    if (a === null || b === null) return a !== b;
    return a !== b;
  }

  statusLabel(s: CaldiscountRowStatus): string {
    switch (s) {
      case 'will_update': return '🟡 เปลี่ยนแปลง';
      case 'no_change':   return '⚪ ไม่เปลี่ยน';
      case 'not_found':   return '🔴 ไม่พบใน Cal';
      case 'cal_only':    return '🔵 มีใน Cal';
    }
  }

  statusClass(s: CaldiscountRowStatus): string {
    switch (s) {
      case 'will_update': return 'bg-amber-100 text-amber-800';
      case 'no_change':   return 'bg-slate-100 text-slate-600';
      case 'not_found':   return 'bg-rose-100 text-rose-800';
      case 'cal_only':    return 'bg-blue-100 text-blue-700';
    }
  }
}
