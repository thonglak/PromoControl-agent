import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { ConfirmClearDialogComponent, ClearMode } from './confirm-clear-dialog.component';

interface ClearLog {
  id: number;
  project_id: number;
  project_name: string;
  user_id: number;
  user_name: string | null;
  mode: ClearMode;
  reason: string | null;
  deleted_transaction_items: number;
  deleted_transactions: number;
  deleted_movements: number;
  deleted_allocations: number;
  reset_units: number;
  created_at: string;
}

@Component({
  selector: 'app-clear-transactions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatRadioModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTableModule,
    SvgIconComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <h1 class="text-2xl font-bold text-slate-800 mb-2">ล้างข้อมูลการขาย</h1>
      <p class="text-sm text-slate-500 mb-6">เครื่องมือสำหรับ admin — ใช้ล้างข้อมูลการขาย/งบประมาณของโครงการ</p>

      <mat-card class="!rounded-xl border border-red-200 !shadow-sm mb-6">
        <mat-card-content class="!p-6">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <app-icon name="trash" class="w-6 h-6 text-red-500" />
            </div>
            <div class="flex-1">
              <h2 class="text-lg font-semibold text-slate-800 mb-1">โครงการ: <span class="text-primary-700">{{ projectName() }}</span></h2>
              <p class="text-sm text-slate-500 mb-4">เลือก mode ที่ต้องการล้าง</p>

              <mat-radio-group [(ngModel)]="mode" class="flex flex-col gap-3 mb-4">
                <mat-radio-button value="sales_only">
                  <div class="flex flex-col">
                    <span class="font-medium text-slate-800">เฉพาะข้อมูลการขาย</span>
                    <span class="text-xs text-slate-500">ลบรายการขาย + USE/RETURN ที่เกิดจากการขาย — คงงบที่ตั้งไว้ (ALLOCATE) และ unit_budget_allocations</span>
                  </div>
                </mat-radio-button>
                <mat-radio-button value="full_reset">
                  <div class="flex flex-col">
                    <span class="font-medium text-slate-800">รีเซ็ตทั้งหมด (เริ่มโครงการใหม่)</span>
                    <span class="text-xs text-slate-500">ลบทุกอย่าง รวมงบที่ตั้งไว้ + unit_budget_allocations + เลขเอกสาร BUDGET_MOVE</span>
                  </div>
                </mat-radio-button>
              </mat-radio-group>

              <div class="bg-red-50 rounded-lg p-4 mb-4">
                <p class="text-sm font-medium text-red-800 mb-2">ข้อมูลที่จะถูกลบ ({{ mode === 'full_reset' ? 'รีเซ็ตทั้งหมด' : 'เฉพาะข้อมูลการขาย' }}):</p>
                <ul class="text-sm text-red-700 space-y-1 ml-4 list-disc">
                  <li>รายการขายทั้งหมด (sales_transactions + items)</li>
                  @if (mode === 'sales_only') {
                    <li>budget_movements เฉพาะ USE/SPECIAL_BUDGET_USE และ RETURN จากการยกเลิกขาย</li>
                  } @else {
                    <li>budget_movements ทั้งหมด (รวม ALLOCATE / TRANSFER / manual RETURN)</li>
                    <li>การตั้งงบผูกยูนิตทั้งหมด (unit_budget_allocations)</li>
                    <li>Reset เลขเอกสาร BUDGET_MOVE</li>
                  }
                  <li>Reset สถานะยูนิต sold/transferred → available</li>
                  <li>Reset เลขเอกสาร SALE</li>
                </ul>
              </div>

              @if (result()) {
                <div class="bg-green-50 rounded-lg p-4 mb-4">
                  <p class="text-sm font-medium text-green-800 mb-2">ผลลัพธ์ ({{ result()!.mode === 'full_reset' ? 'รีเซ็ตทั้งหมด' : 'เฉพาะข้อมูลการขาย' }}):</p>
                  <ul class="text-sm text-green-700 space-y-1 ml-4 list-disc">
                    <li>ลบรายการขาย: {{ result()!.summary.deleted_transactions | number }} รายการ ({{ result()!.summary.deleted_transaction_items | number }} items)</li>
                    <li>ลบ budget movements: {{ result()!.summary.deleted_budget_movements | number }} รายการ</li>
                    <li>ลบ budget allocations: {{ result()!.summary.deleted_budget_allocations | number }} รายการ</li>
                    <li>Reset ยูนิต: {{ result()!.summary.reset_units | number }} ยูนิต</li>
                  </ul>
                </div>
              }

              <button mat-flat-button
                      color="warn"
                      [disabled]="loading()"
                      (click)="onClear()"
                      class="!rounded-lg">
                @if (loading()) {
                  <mat-spinner diameter="20" class="inline-block mr-2" />
                }
                ล้างข้อมูล
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Audit log history -->
      <mat-card class="!rounded-xl border border-slate-200 !shadow-sm">
        <mat-card-content class="!p-6">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h2 class="text-base font-semibold text-slate-800">ประวัติการล้างข้อมูล</h2>
              <p class="text-xs text-slate-500">เฉพาะโครงการนี้ (ล่าสุด 50 รายการ)</p>
            </div>
            <button mat-stroked-button (click)="loadLogs()" class="!rounded-lg">
              <app-icon name="arrow-path" class="w-4 h-4 mr-1" />
              รีเฟรช
            </button>
          </div>

          @if (logsLoading()) {
            <div class="py-8 text-center"><mat-spinner diameter="28" class="inline-block" /></div>
          } @else if (logs().length === 0) {
            <p class="py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติ</p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                    <th class="text-left py-2 px-3">วันที่</th>
                    <th class="text-left py-2 px-3">ผู้ทำ</th>
                    <th class="text-left py-2 px-3">Mode</th>
                    <th class="text-right py-2 px-3">รายการขาย</th>
                    <th class="text-right py-2 px-3">Movements</th>
                    <th class="text-right py-2 px-3">Allocations</th>
                    <th class="text-right py-2 px-3">Reset units</th>
                    <th class="text-left py-2 px-3">เหตุผล</th>
                  </tr>
                </thead>
                <tbody>
                  @for (log of logs(); track log.id) {
                    <tr class="border-t border-slate-100 hover:bg-slate-50/60">
                      <td class="py-2 px-3 text-slate-500 whitespace-nowrap">{{ log.created_at }}</td>
                      <td class="py-2 px-3 text-slate-700">{{ log.user_name || ('#' + log.user_id) }}</td>
                      <td class="py-2 px-3">
                        @if (log.mode === 'full_reset') {
                          <span class="inline-flex items-center px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">รีเซ็ตทั้งหมด</span>
                        } @else {
                          <span class="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">เฉพาะการขาย</span>
                        }
                      </td>
                      <td class="py-2 px-3 text-right tabular-nums">{{ log.deleted_transactions | number }}</td>
                      <td class="py-2 px-3 text-right tabular-nums">{{ log.deleted_movements | number }}</td>
                      <td class="py-2 px-3 text-right tabular-nums">{{ log.deleted_allocations | number }}</td>
                      <td class="py-2 px-3 text-right tabular-nums">{{ log.reset_units | number }}</td>
                      <td class="py-2 px-3 text-slate-600">{{ log.reason || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class ClearTransactionsComponent implements OnInit {
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private projectService = inject(ProjectService);

  readonly loading = signal(false);
  readonly result = signal<{ mode: ClearMode; summary: any } | null>(null);
  readonly logs = signal<ClearLog[]>([]);
  readonly logsLoading = signal(false);
  readonly projectName = () => this.projectService.selectedProject()?.name ?? '—';

  mode: ClearMode = 'sales_only';

  ngOnInit(): void {
    this.loadLogs();
  }

  loadLogs(): void {
    const project = this.projectService.selectedProject();
    if (!project) return;
    this.logsLoading.set(true);
    this.http.get<{ data: ClearLog[] }>('/api/dev/clear-logs', { params: { project_id: project.id } }).subscribe({
      next: res => {
        this.logs.set(res.data ?? []);
        this.logsLoading.set(false);
      },
      error: () => {
        this.logsLoading.set(false);
        this.snackBar.open('โหลดประวัติล้มเหลว', 'ปิด', { duration: 3000 });
      },
    });
  }

  onClear(): void {
    const project = this.projectService.selectedProject();
    if (!project) {
      this.snackBar.open('กรุณาเลือกโครงการก่อน', 'ปิด', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(ConfirmClearDialogComponent, {
      width: '480px',
      data: { projectName: project.name, mode: this.mode },
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.executeClear(+project.id, confirmed.projectNameConfirm, confirmed.reason);
    });
  }

  private executeClear(projectId: number, projectNameConfirm: string, reason: string): void {
    this.loading.set(true);
    this.result.set(null);

    this.http.post<any>('/api/dev/clear-transactions', {
      project_id: projectId,
      mode: this.mode,
      project_name_confirm: projectNameConfirm,
      reason,
    }).subscribe({
      next: res => {
        this.loading.set(false);
        this.result.set({ mode: res.mode, summary: res.summary });
        this.snackBar.open('ล้างข้อมูลสำเร็จ', 'ปิด', { duration: 5000 });
        this.loadLogs();
      },
      error: err => {
        this.loading.set(false);
        this.snackBar.open(err.error?.error ?? 'เกิดข้อผิดพลาด', 'ปิด', { duration: 5000 });
      },
    });
  }
}
