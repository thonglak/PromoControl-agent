import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  PromotionItemApiService,
  PromotionItemExportFile,
  PromotionItemJson,
  ImportJsonResult,
} from '../promotion-item-api.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

export interface ImportJsonDialogData {
  projectId: number;
  projectName?: string;
}

@Component({
  selector: 'app-import-json-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule, MatDialogModule, MatProgressSpinnerModule,
    MatTableModule, MatTooltipModule, SvgIconComponent,
  ],
  templateUrl: './import-json-dialog.component.html',
})
export class ImportJsonDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ImportJsonDialogComponent>);
  private readonly api       = inject(PromotionItemApiService);
  private readonly snack     = inject(MatSnackBar);
  readonly data: ImportJsonDialogData = inject(MAT_DIALOG_DATA);

  // ── State ──
  fileName  = signal<string | null>(null);
  rawError  = signal<string | null>(null);
  parsed    = signal<PromotionItemExportFile | null>(null);
  saving    = signal(false);
  result    = signal<ImportJsonResult | null>(null);

  // คอลัมน์สำหรับ preview ตาราง
  readonly previewColumns = ['code', 'name', 'category', 'value_mode', 'eligibility'];

  itemCount     = computed(() => this.parsed()?.items.length ?? 0);
  previewItems  = computed(() => this.parsed()?.items.slice(0, 20) ?? []);
  hasMore       = computed(() => (this.parsed()?.items.length ?? 0) > 20);

  // สรุปแยกตามหมวด
  categoryStats = computed(() => {
    const items = this.parsed()?.items ?? [];
    const stats = { discount: 0, premium: 0, expense_support: 0 };
    for (const it of items) {
      if (it.category in stats) stats[it.category as keyof typeof stats]++;
    }
    return stats;
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    this.rawError.set(null);
    this.parsed.set(null);
    this.result.set(null);
    this.fileName.set(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        this.validateAndSet(parsed);
      } catch {
        this.rawError.set('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง');
      }
    };
    reader.onerror = () => this.rawError.set('อ่านไฟล์ไม่สำเร็จ');
    reader.readAsText(file, 'UTF-8');

    // เคลียร์ค่าใน input เพื่อให้เลือกไฟล์เดิมซ้ำได้
    input.value = '';
  }

  private validateAndSet(raw: any): void {
    if (!raw || typeof raw !== 'object') {
      this.rawError.set('โครงสร้างไฟล์ไม่ถูกต้อง');
      return;
    }
    if (raw.format !== 'promotion-items.v1') {
      this.rawError.set('ไฟล์ไม่ใช่รูปแบบรายการโปรโมชั่น (format ไม่ตรง)');
      return;
    }
    if (!Array.isArray(raw.items) || raw.items.length === 0) {
      this.rawError.set('ไม่พบรายการในไฟล์');
      return;
    }
    if (raw.items.length > 500) {
      this.rawError.set('นำเข้าได้สูงสุดครั้งละ 500 รายการ');
      return;
    }

    // ทำความสะอาด/normalize เบื้องต้น (ไม่ validate ลึก ปล่อยให้ backend ตรวจ)
    const items: PromotionItemJson[] = raw.items.map((r: any) => ({
      code:                      r.code ?? undefined,
      name:                      String(r.name ?? '').trim(),
      category:                  r.category,
      default_value:             Number(r.default_value ?? 0),
      max_value:                 r.max_value ?? null,
      default_used_value:        r.default_used_value ?? null,
      discount_convert_value:    r.discount_convert_value ?? null,
      value_mode:                r.value_mode ?? 'fixed',
      is_unit_standard:          !!r.is_unit_standard,
      is_active:                 r.is_active === undefined ? true : !!r.is_active,
      sort_order:                Number(r.sort_order ?? 0),
      eligible_start_date:       r.eligible_start_date ?? null,
      eligible_end_date:         r.eligible_end_date ?? null,
      eligible_house_model_names: Array.isArray(r.eligible_house_model_names) ? r.eligible_house_model_names : [],
      eligible_unit_codes:       Array.isArray(r.eligible_unit_codes) ? r.eligible_unit_codes : [],
    }));

    this.parsed.set({
      format:              'promotion-items.v1',
      exported_at:         String(raw.exported_at ?? ''),
      source_project_id:   raw.source_project_id,
      source_project_name: raw.source_project_name,
      count:               items.length,
      items,
    });
  }

  submit(): void {
    const file = this.parsed();
    if (!file || this.saving()) return;
    this.saving.set(true);

    this.api.importJson({
      project_id: this.data.projectId,
      items:      file.items,
    }).subscribe({
      next: res => {
        this.saving.set(false);
        this.result.set(res);
        let msg = `นำเข้าสำเร็จ ${res.created} รายการ`;
        if (res.skipped.length > 0) msg += ` · ข้าม ${res.skipped.length}`;
        if (res.errors.length > 0)  msg += ` · ผิดพลาด ${res.errors.length}`;
        this.snack.open(msg, 'ปิด', { duration: 6000 });
      },
      error: err => {
        this.saving.set(false);
        const msg = err?.error?.error ?? 'เกิดข้อผิดพลาดระหว่างนำเข้า';
        this.snack.open(msg, 'ปิด', { duration: 5000 });
      },
    });
  }

  close(): void {
    // ถ้านำเข้าสำเร็จอย่างน้อย 1 รายการ → ส่ง true เพื่อให้หน้า list reload
    this.dialogRef.close(this.result()?.created ? true : false);
  }

  reset(): void {
    this.fileName.set(null);
    this.parsed.set(null);
    this.rawError.set(null);
    this.result.set(null);
  }

  categoryLabel(c: string): string {
    return c === 'discount' ? 'ส่วนลด' : c === 'premium' ? 'ของสมนาคุณ' : 'สนับสนุนค่าใช้จ่าย';
  }
  categoryClass(c: string): string {
    return c === 'discount' ? 'bg-amber-50 text-amber-700'
         : c === 'premium'  ? 'bg-blue-50 text-blue-700'
         : 'bg-purple-50 text-purple-700';
  }
  modeLabel(m: string): string {
    return m === 'fixed' ? 'คงที่' : m === 'actual' ? 'ตามจริง' : m === 'manual' ? 'กำหนดเอง' : 'คำนวณอัตโนมัติ';
  }

  trackByIdx = (i: number) => i;
}
