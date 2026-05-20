import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ValueSourceApiService, ValueSource } from './value-source-api.service';
import { ValueSourceFormDialogComponent } from './value-source-form-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-value-source-list',
  standalone: true,
  imports: [
    CommonModule, PageHeaderComponent, SvgIconComponent, EmptyStateComponent,
    MatButtonModule, MatTooltipModule, MatProgressSpinnerModule, MatDialogModule, MatSnackBarModule,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <app-page-header title="แหล่งข้อมูลของแถม (unit_table)"
        subtitle="กำหนดแหล่งข้อมูลที่รายการของแถมโหมด unit_table ใช้ดึงจำนวนเงินรายยูนิต">
        <button actions mat-flat-button color="primary" (click)="openForm('create')">
          <app-icon name="plus" class="w-4 h-4 mr-1" /> เพิ่มแหล่งข้อมูล
        </button>
      </app-page-header>

      <div class="flex items-start gap-2 p-3 mb-4 rounded-lg"
           style="background: var(--color-info-subtle, #EFF6FF); border: 1px solid #BFDBFE">
        <app-icon name="information-circle" class="w-5 h-5 flex-shrink-0 mt-0.5" style="color: #2563EB" />
        <span class="text-sm" style="color: #1E40AF">
          แหล่งข้อมูลคือตารางที่เก็บจำนวนเงินรายยูนิต — รายการของแถมที่ตั้งโหมดค่าเป็น
          "ดึงค่ารายยูนิตจากตาราง" จะเลือกใช้แหล่งข้อมูลจากที่นี่
        </span>
      </div>

      @if (loading()) {
        <div class="py-16 text-center"><mat-spinner diameter="32" class="!inline-block" /></div>
      } @else if (sources().length === 0) {
        <app-empty-state icon="document-text" title="ยังไม่มีแหล่งข้อมูล"
          description="เพิ่มแหล่งข้อมูลเพื่อให้ของแถมโหมด unit_table ดึงค่ารายยูนิตได้" />
      } @else {
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="overflow-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 text-left" style="color: var(--color-gray-600)">
                  <th class="px-4 py-2.5 font-semibold text-xs">รหัส / ชื่อ</th>
                  <th class="px-4 py-2.5 font-semibold text-xs">การเชื่อมต่อตาราง</th>
                  <th class="px-4 py-2.5 font-semibold text-xs">สถานะ</th>
                  <th class="px-4 py-2.5 font-semibold text-xs text-right">การใช้งาน</th>
                  <th class="px-4 py-2.5 font-semibold text-xs text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                @for (s of sources(); track s.id) {
                  <tr class="border-t border-slate-100 hover:bg-slate-50">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <span class="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{{ s.source_key }}</span>
                        @if (s.is_system) {
                          <span class="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">ระบบ</span>
                        }
                      </div>
                      <p class="text-slate-800 font-medium mt-1">{{ s.label }}</p>
                      @if (s.description) {
                        <p class="text-xs text-slate-400 mt-0.5">{{ s.description }}</p>
                      }
                    </td>
                    <td class="px-4 py-3">
                      <p class="font-mono text-xs text-slate-700">{{ s.source_table }}</p>
                      <p class="font-mono text-xs text-slate-400 mt-0.5">
                        {{ s.amount_column }} ← {{ s.item_column }} / {{ s.unit_column }}
                      </p>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex flex-col gap-1">
                        <span class="text-xs px-2 py-0.5 rounded-full w-fit"
                          [class]="s.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'">
                          {{ s.is_active ? 'เปิดใช้งาน' : 'ปิด' }}
                        </span>
                        @if (!s.schema_ok) {
                          <span class="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 w-fit"
                            matTooltip="ไม่พบตาราง/คอลัมน์นี้ในฐานข้อมูล — ของแถมจะ fallback เป็นค่า 0">
                            ตาราง/คอลัมน์ไม่ถูกต้อง
                          </span>
                        }
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right tabular-nums text-slate-600">
                      {{ s.usage_count }} รายการ
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center justify-end gap-1">
                        <button mat-icon-button (click)="openForm('edit', s)" matTooltip="แก้ไข"
                          class="!w-8 !h-8 text-slate-500 hover:text-blue-600">
                          <app-icon name="pencil-square" class="w-4 h-4" />
                        </button>
                        <button mat-icon-button (click)="remove(s)"
                          [disabled]="!!s.is_system || s.usage_count > 0"
                          [matTooltip]="deleteTooltip(s)"
                          class="!w-8 !h-8 text-slate-500 hover:text-red-600">
                          <app-icon name="trash" class="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
})
export class ValueSourceListComponent implements OnInit {
  private api    = inject(ValueSourceApiService);
  private dialog = inject(MatDialog);
  private snack  = inject(MatSnackBar);

  loading = signal(true);
  sources = signal<ValueSource[]>([]);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: rows => { this.sources.set(rows); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 });
      },
    });
  }

  openForm(mode: 'create' | 'edit', source?: ValueSource): void {
    this.dialog.open(ValueSourceFormDialogComponent, {
      width: '640px', maxWidth: '95vw', data: { mode, source },
    }).afterClosed().subscribe(ok => {
      if (ok) {
        this.snack.open(mode === 'create' ? 'เพิ่มแหล่งข้อมูลแล้ว' : 'บันทึกแล้ว', 'ปิด', { duration: 2500 });
        this.load();
      }
    });
  }

  remove(s: ValueSource): void {
    if (s.is_system || s.usage_count > 0) return;
    if (!confirm(`ลบแหล่งข้อมูล "${s.label}" ?`)) return;
    this.api.delete(s.id).subscribe({
      next: () => { this.snack.open('ลบแล้ว', 'ปิด', { duration: 2500 }); this.load(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 4000 }),
    });
  }

  deleteTooltip(s: ValueSource): string {
    if (s.is_system) return 'แหล่งข้อมูลของระบบ ลบไม่ได้';
    if (s.usage_count > 0) return 'มีรายการของแถมใช้อยู่ ลบไม่ได้';
    return 'ลบ';
  }
}
