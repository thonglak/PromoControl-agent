import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { MonitorLinkFormDialogComponent, MonitorLinkFormData } from '../dialogs/monitor-link-form-dialog.component';
import {
  SystemSettingsService, SystemSetting, SettingSchema, SYSTEM_SETTINGS_SCHEMA,
} from '../services/system-settings.service';

interface SettingRow {
  schema: SettingSchema;
  current: any;
  description: string | null;
  updated_at: string | null;
}

interface MonitorLinkProject {
  project_id: number;
  project_code: string;
  project_name: string;
}

interface MonitorLink {
  id: number;
  token: string;
  name: string;
  projects: MonitorLinkProject[];
  created_at: string | null;
  created_by_name: string | null;
}

@Component({
  selector: 'app-system-settings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatTooltipModule, MatDialogModule,
    PageHeaderComponent, SectionCardComponent, SvgIconComponent, ThaiDatePipe,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <app-page-header title="ตั้งค่าระบบ" subtitle="ค่าตัวแปรทั่วทั้งระบบ — แก้ไขได้โดย admin/manager" />

      <!-- Monitor Links Section (admin only) -->
      @if (canManageMonitor()) {
        <div class="mb-6">
          <app-section-card title="ลิงค์ Monitor (สาธารณะ)" icon="link">
            <div class="flex items-start justify-between gap-2 mb-3">
              <p class="text-xs text-slate-500 flex-1">
                ลิงค์สำหรับดู KPI ของหลายโครงการพร้อมกันผ่านมือถือ — ใครก็ตามที่ได้รับลิงค์เข้าดูได้โดยไม่ต้อง login
              </p>
              <button mat-flat-button color="primary" (click)="openMonitorLinkDialog()" class="shrink-0">
                <app-icon name="plus" class="w-4 h-4 mr-1" /> สร้างลิงค์ใหม่
              </button>
            </div>

            @if (monitorLoading()) {
              <div class="py-4"><mat-spinner diameter="24" /></div>
            } @else if (monitorLinks().length === 0) {
              <p class="text-sm text-slate-400 text-center py-6">ยังไม่มีลิงค์ Monitor — กดปุ่ม "สร้างลิงค์ใหม่"</p>
            } @else {
              <div class="flex flex-col gap-3">
                @for (link of monitorLinks(); track link.id) {
                  <div class="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-semibold text-slate-800">{{ link.name }}</p>
                        <p class="text-[11px] text-slate-400 mt-0.5">
                          {{ link.projects.length }} โครงการ
                          @if (link.created_at) { · สร้างเมื่อ {{ link.created_at | thaiDate }} }
                          @if (link.created_by_name) { · โดย {{ link.created_by_name }} }
                        </p>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button mat-icon-button matTooltip="แก้ไข" (click)="openMonitorLinkDialog(link)" class="!w-8 !h-8">
                          <app-icon name="pencil-square" class="w-4 h-4 text-slate-500" />
                        </button>
                        <button mat-icon-button matTooltip="ลบ" (click)="onDeleteLink(link)" class="!w-8 !h-8">
                          <app-icon name="trash" class="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>

                    <!-- Projects in this link -->
                    <div class="flex flex-wrap gap-1 mt-2">
                      @for (p of link.projects; track p.project_id) {
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]">
                          <span class="font-mono mr-1">{{ p.project_code }}</span>
                          {{ p.project_name }}
                        </span>
                      }
                    </div>

                    <!-- URL row -->
                    <div class="flex flex-wrap items-center gap-2 mt-2 bg-white rounded border border-slate-200 px-2 py-1.5">
                      <code class="font-mono text-[11px] break-all flex-1 min-w-0 text-slate-700">{{ buildUrl(link.token) }}</code>
                      <button mat-icon-button matTooltip="คัดลอก" (click)="copyUrl(link.token)" class="!w-7 !h-7 shrink-0">
                        <app-icon name="clipboard" class="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <a mat-icon-button matTooltip="เปิดในแท็บใหม่" [href]="buildUrl(link.token)" target="_blank" rel="noopener" class="!w-7 !h-7 shrink-0">
                        <app-icon name="arrow-top-right-on-square" class="w-3.5 h-3.5 text-slate-500" />
                      </a>
                    </div>
                  </div>
                }
              </div>
            }
          </app-section-card>
        </div>
      }

      @if (loading()) {
        <div class="section-card text-center py-12">
          <mat-spinner diameter="32" class="mx-auto mb-2" />
          <p class="text-sm" style="color: var(--color-gray-500)">กำลังโหลด...</p>
        </div>
      } @else if (rows().length === 0) {
        <div class="section-card text-center py-12">
          <p class="text-sm" style="color: var(--color-gray-500)">ยังไม่มีค่าตั้งค่าในระบบ</p>
        </div>
      } @else {
        <div class="flex flex-col gap-6">
          @for (g of groups(); track g.name) {
            <app-section-card [title]="g.name" icon="cog">
              <div class="space-y-5">
                @for (row of g.rows; track row.schema.key) {
                  <div class="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-start">
                    <!-- Label + description -->
                    <div class="md:col-span-6">
                      <p class="font-medium text-sm" style="color: var(--color-text-primary)">{{ row.schema.label }}</p>
                      @if (row.description || row.schema.description) {
                        <p class="text-xs mt-1" style="color: var(--color-text-secondary)">
                          {{ row.description || row.schema.description }}
                        </p>
                      }
                      @if (row.updated_at) {
                        <p class="text-xs mt-1" style="color: var(--color-gray-400)">
                          แก้ไขล่าสุด: {{ row.updated_at | thaiDate }}
                        </p>
                      }
                    </div>

                    <!-- Input -->
                    <div class="md:col-span-4">
                      <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
                        <mat-label>ค่า</mat-label>
                        <input matInput
                          type="number"
                          [value]="editValue(row.schema.key)"
                          [min]="row.schema.min ?? null"
                          [max]="row.schema.max ?? null"
                          [step]="row.schema.step ?? 1"
                          (input)="onInput(row.schema.key, $any($event.target).value)"
                          class="text-right tabular-nums num">
                        @if (row.schema.unit) {
                          <span matTextSuffix>&nbsp;{{ row.schema.unit }}</span>
                        }
                      </mat-form-field>
                    </div>

                    <!-- Save button -->
                    <div class="md:col-span-2 flex md:justify-end">
                      <button mat-flat-button color="primary"
                        [disabled]="!isDirty(row) || saving() === row.schema.key"
                        (click)="onSave(row)"
                        class="!h-10">
                        @if (saving() === row.schema.key) {
                          <mat-spinner diameter="18" class="inline-block mr-2" />
                        }
                        บันทึก
                      </button>
                    </div>
                  </div>
                }
              </div>
            </app-section-card>
          }
        </div>
      }
    </div>
  `,
})
export class SystemSettingsComponent implements OnInit {
  private svc = inject(SystemSettingsService);
  private snack = inject(MatSnackBar);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly saving = signal<string | null>(null);

  // ─── Monitor links state ──────────────────────────────────
  readonly monitorLinks = signal<MonitorLink[]>([]);
  readonly monitorLoading = signal(false);

  readonly canManageMonitor = computed(() => this.auth.currentUser()?.role === 'admin');

  /** server-side rows ที่โหลดมา (พร้อม metadata) */
  private serverRows = signal<SystemSetting[]>([]);

  /** ค่าใน input (edit-in-progress) — key → value (string สำหรับ input type=number) */
  private edited = signal<Map<string, string>>(new Map());

  /** rows สำหรับ render — ผูก schema กับค่า server ปัจจุบัน */
  readonly rows = computed<SettingRow[]>(() => {
    const byKey = new Map(this.serverRows().map(r => [r.setting_key, r]));
    return SYSTEM_SETTINGS_SCHEMA
      .filter(schema => byKey.has(schema.key))
      .map(schema => {
        const r = byKey.get(schema.key)!;
        return {
          schema,
          current: r.setting_value,
          description: r.description,
          updated_at: r.updated_at,
        };
      });
  });

  /** จัดกลุ่มตาม schema.group */
  readonly groups = computed(() => {
    const map = new Map<string, SettingRow[]>();
    for (const row of this.rows()) {
      const g = row.schema.group;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(row);
    }
    return Array.from(map.entries()).map(([name, rows]) => ({ name, rows }));
  });

  ngOnInit(): void {
    if (this.canManageMonitor()) this.loadMonitorLinks();

    this.svc.list().subscribe({
      next: rows => {
        this.serverRows.set(rows);
        // seed edited จาก current value
        const init = new Map<string, string>();
        for (const r of rows) init.set(r.setting_key, String(r.setting_value ?? ''));
        this.edited.set(init);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('โหลดค่าตั้งค่าไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  editValue(key: string): string {
    return this.edited().get(key) ?? '';
  }

  onInput(key: string, value: string): void {
    const next = new Map(this.edited());
    next.set(key, value);
    this.edited.set(next);
  }

  isDirty(row: SettingRow): boolean {
    const edited = this.edited().get(row.schema.key);
    if (edited == null) return false;
    if (row.schema.type === 'percent' || row.schema.type === 'number') {
      return Number(edited) !== Number(row.current);
    }
    return edited !== String(row.current);
  }

  onSave(row: SettingRow): void {
    const raw = this.edited().get(row.schema.key);
    if (raw == null || raw === '') {
      this.snack.open('กรุณาระบุค่า', 'ปิด', { duration: 3000 });
      return;
    }
    let value: any = raw;
    if (row.schema.type === 'percent' || row.schema.type === 'number') {
      value = Number(raw);
      if (Number.isNaN(value)) {
        this.snack.open('ค่าต้องเป็นตัวเลข', 'ปิด', { duration: 3000 });
        return;
      }
      if (row.schema.min != null && value < row.schema.min) {
        this.snack.open(`ค่าต้องไม่น้อยกว่า ${row.schema.min}`, 'ปิด', { duration: 3000 });
        return;
      }
      if (row.schema.max != null && value > row.schema.max) {
        this.snack.open(`ค่าต้องไม่เกิน ${row.schema.max}`, 'ปิด', { duration: 3000 });
        return;
      }
    }

    this.saving.set(row.schema.key);
    this.svc.update(row.schema.key, value).subscribe({
      next: updated => {
        this.saving.set(null);
        // sync serverRows ให้ updated_at ใหม่
        this.serverRows.update(rows => rows.map(r => r.setting_key === updated.setting_key ? updated : r));
        const next = new Map(this.edited());
        next.set(updated.setting_key, String(updated.setting_value));
        this.edited.set(next);
        this.snack.open('บันทึกค่าตั้งค่าเรียบร้อย', 'ปิด', { duration: 2500 });
      },
      error: err => {
        this.saving.set(null);
        this.snack.open(err?.error?.error || 'บันทึกไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  // ─── Monitor link actions ─────────────────────────────────
  loadMonitorLinks(): void {
    this.monitorLoading.set(true);
    this.http.get<{ data: MonitorLink[] }>('/api/monitor-links').subscribe({
      next: res => {
        this.monitorLinks.set(res.data ?? []);
        this.monitorLoading.set(false);
      },
      error: () => this.monitorLoading.set(false),
    });
  }

  openMonitorLinkDialog(link?: MonitorLink): void {
    const data: MonitorLinkFormData = link
      ? { id: link.id, name: link.name, projectIds: link.projects.map(p => p.project_id) }
      : {};
    const ref = this.dialog.open(MonitorLinkFormDialogComponent, {
      data, width: '480px', maxWidth: '95vw',
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.loadMonitorLinks();
        this.snack.open(link ? 'แก้ไขลิงค์เรียบร้อย' : 'สร้างลิงค์เรียบร้อย', 'ปิด', { duration: 2500 });
      }
    });
  }

  onDeleteLink(link: MonitorLink): void {
    if (!confirm(`ยืนยันลบลิงค์ "${link.name}"? ผู้ที่มีลิงค์ปัจจุบันจะเข้าดูข้อมูลไม่ได้อีก`)) return;

    this.http.delete(`/api/monitor-links/${link.id}`).subscribe({
      next: () => {
        this.loadMonitorLinks();
        this.snack.open('ลบลิงค์เรียบร้อย', 'ปิด', { duration: 2500 });
      },
      error: err => {
        this.snack.open(err?.error?.error || 'ลบไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  buildUrl(token: string): string {
    return `${window.location.origin}/monitor/${token}`;
  }

  copyUrl(token: string): void {
    navigator.clipboard?.writeText(this.buildUrl(token)).then(
      () => this.snack.open('คัดลอกลิงค์เรียบร้อย', 'ปิด', { duration: 2000 }),
      () => this.snack.open('คัดลอกไม่สำเร็จ', 'ปิด', { duration: 3000 }),
    );
  }
}
