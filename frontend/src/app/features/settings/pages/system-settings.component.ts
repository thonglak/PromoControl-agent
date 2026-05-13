import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import {
  SystemSettingsService, SystemSetting, SettingSchema, SYSTEM_SETTINGS_SCHEMA,
} from '../services/system-settings.service';

interface SettingRow {
  schema: SettingSchema;
  current: any;
  description: string | null;
  updated_at: string | null;
}

@Component({
  selector: 'app-system-settings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatProgressSpinnerModule, MatSnackBarModule,
    PageHeaderComponent, SectionCardComponent, SvgIconComponent, ThaiDatePipe,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <app-page-header title="ตั้งค่าระบบ" subtitle="ค่าตัวแปรทั่วทั้งระบบ — แก้ไขได้โดย admin/manager" />

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

  readonly loading = signal(true);
  readonly saving = signal<string | null>(null);

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
}
