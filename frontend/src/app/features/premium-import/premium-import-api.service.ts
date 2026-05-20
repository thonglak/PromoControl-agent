import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// ── Upload / preview ──────────────────────────────────────────────────────
export interface PremiumLabel {
  label: string;
  category: 'discount' | 'premium' | 'expense_support';
  column_index: number;
}

export interface PremiumSheet {
  sheet_name: string;
  project_code: string | null;
  project_id: number | null;
  project_name: string | null;
  data_rows: number;
  premium_labels: PremiumLabel[];
  sample_rows: any[];
  importable: boolean;
}

export interface PremiumUploadResult {
  file_name: string;
  sheets: PremiumSheet[];
  temp_file: string;
}

// ── Import (staging) ──────────────────────────────────────────────────────
export interface PremiumBatch {
  batch_id: number;
  sheet_name: string;
  project_id: number;
  project_code: string;
  total_rows: number;
  value_rows: number;
}

export interface PremiumImportResult {
  batches: PremiumBatch[];
  skipped: { sheet_name: string; reason: string }[];
}

// ── Validate ──────────────────────────────────────────────────────────────
/** เงื่อนไขการใช้งานของ plan item */
export interface PremiumPlanEligibility {
  scope: 'all' | 'house_model' | 'unit';
  house_models: string[];
  unit_count: number;
}

/** รายการของแถม 1 รายการที่จะถูกสร้าง (แผน) */
export interface PremiumPlanItem {
  key: string;
  label: string;
  category: 'discount' | 'premium' | 'expense_support';
  strategy: 'group' | 'unit_table';
  value: number | null;
  value_source: string | null;
  proposed_name: string;
  existing_item_id: number | null;
  existing_item_name: string | null;
  eligibility: PremiumPlanEligibility;
  house_model_ids: number[];
  unit_ids: number[];
  value_key: string;
}

export interface PremiumValidateResult {
  batch_id: number;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  ambiguous_rows: number;
  resolved_labels: string[];
  unresolved_labels: string[];
  plan: PremiumPlanItem[];
}

// ── Sync ──────────────────────────────────────────────────────────────────
export interface PremiumCreatedItem {
  label: string;
  name: string;
  strategy: 'group' | 'unit_table';
  value: number | null;
  promotion_item_id: number;
}

export interface PremiumSyncResult {
  batch_id: number;
  synced_units: number;
  skipped_units: number;
  created_items: PremiumCreatedItem[];
}

@Injectable({ providedIn: 'root' })
export class PremiumImportApiService {
  private http = inject(HttpClient);

  /** ดาวน์โหลดไฟล์ Excel ตัวอย่างสำหรับนำเข้าของแถม */
  downloadSample(): Observable<Blob> {
    return this.http.get('/api/premium-imports/sample', { responseType: 'blob' });
  }

  /** อัปโหลดไฟล์ Premium.xlsx → preview ทุกชีต */
  upload(file: File): Observable<PremiumUploadResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<PremiumUploadResult>('/api/premium-imports/upload', fd);
  }

  /** ยืนยันนำเข้าชีตที่เลือกลง staging */
  import(tempFile: string, fileName: string, sheetNames: string[]): Observable<PremiumImportResult> {
    return this.http.post<PremiumImportResult>('/api/premium-imports/import', {
      temp_file: tempFile,
      file_name: fileName,
      sheet_names: sheetNames,
    });
  }

  /** จับคู่ staging กับฐานข้อมูลจริง */
  validate(batchId: number): Observable<PremiumValidateResult> {
    return this.http.post<PremiumValidateResult>(`/api/premium-imports/${batchId}/validate`, {});
  }

  /**
   * เขียนข้อมูลลง project_units / promotion
   * @param nameOverrides map: plan item key → ชื่อรายการของแถมที่ผู้ใช้แก้
   */
  sync(batchId: number, nameOverrides: Record<string, string> = {}): Observable<PremiumSyncResult> {
    return this.http.post<PremiumSyncResult>(`/api/premium-imports/${batchId}/sync`, {
      name_overrides: nameOverrides,
    });
  }
}
