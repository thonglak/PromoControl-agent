import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface EligibleHouseModel { id: number; house_model_id: number; house_model_name: string; }
export interface EligibleUnit { id: number; unit_id: number; unit_code: string; }

export interface PromotionItem {
  id: number;
  code: string;
  name: string;
  category: 'discount' | 'premium' | 'expense_support';
  default_value: number;
  max_value: number | null;
  default_used_value: number | null;
  discount_convert_value: number | null;
  value_mode: 'fixed' | 'actual' | 'manual' | 'calculated';
  is_unit_standard: boolean;
  is_active: boolean;
  sort_order: number;
  eligible_start_date: string | null;
  eligible_end_date: string | null;
  eligible_house_models: EligibleHouseModel[];
  eligible_units: EligibleUnit[];
  has_fee_formula: boolean;
  fee_formula?: any;
}

export interface PromotionItemPayload {
  code?: string;
  name: string;
  category: string;
  default_value: number;
  max_value?: number | null;
  default_used_value?: number | null;
  value_mode: string;
  is_unit_standard: boolean;
  is_active?: boolean;
  sort_order: number;
  eligible_start_date?: string | null;
  eligible_end_date?: string | null;
  eligible_house_model_ids?: number[];
  eligible_unit_ids?: number[];
}

@Injectable({ providedIn: 'root' })
export class PromotionItemApiService {
  private http = inject(HttpClient);

  getList(projectId: number, filters: { category?: string; value_mode?: string; is_unit_standard?: string; search?: string } = {}): Observable<PromotionItem[]> {
    let p = new HttpParams().set("project_id", projectId);
    if (filters.category)         p = p.set('category', filters.category);
    if (filters.value_mode)       p = p.set('value_mode', filters.value_mode);
    if (filters.is_unit_standard) p = p.set('is_unit_standard', filters.is_unit_standard);
    if (filters.search)           p = p.set('search', filters.search);
    return this.http.get<{ data: PromotionItem[] }>('/api/promotion-items', { params: p }).pipe(map(r => r.data));
  }

  getById(id: number): Observable<PromotionItem> {
    return this.http.get<{ data: PromotionItem }>('/api/promotion-items/' + id).pipe(map(r => r.data));
  }

  create(payload: PromotionItemPayload): Observable<PromotionItem> {
    return this.http.post<{ data: PromotionItem }>('/api/promotion-items', payload).pipe(map(r => r.data));
  }

  update(id: number, payload: PromotionItemPayload): Observable<PromotionItem> {
    return this.http.put<{ data: PromotionItem }>('/api/promotion-items/' + id, payload).pipe(map(r => r.data));
  }

  delete(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>('/api/promotion-items/' + id);
  }

  // ── Browse + Bulk import จาก caldiscount.freebies ──

  browseSource(q: BrowseFreebiesQuery): Observable<BrowseFreebiesResponse> {
    let p = new HttpParams().set('project_id', q.project_id);
    if (q.q !== undefined && q.q !== '')             p = p.set('q', q.q);
    if (q.pj_code !== undefined && q.pj_code !== '') p = p.set('pj_code', q.pj_code);
    if (q.page !== undefined)                        p = p.set('page', q.page);
    if (q.per_page !== undefined)                    p = p.set('per_page', q.per_page);
    return this.http.get<BrowseFreebiesResponse>('/api/promotion-items/browse-source', { params: p });
  }

  bulkImport(dto: BulkImportFreebiesDto): Observable<BulkImportFreebiesResult> {
    return this.http
      .post<{ message: string; data: BulkImportFreebiesResult }>('/api/promotion-items/bulk-import', dto)
      .pipe(map(r => r.data));
  }

  /** ดึง list distinct pj_code จาก freebies (สำหรับ filter dropdown) */
  getSourceProjects(): Observable<SourceProject[]> {
    return this.http
      .get<{ data: SourceProject[] }>('/api/promotion-items/source-projects')
      .pipe(map(r => r.data));
  }

  /** นำเข้ารายการโปรโมชั่นจากไฟล์ JSON (export มาจากโครงการอื่นได้) */
  importJson(dto: ImportJsonDto): Observable<ImportJsonResult> {
    return this.http
      .post<{ message: string; data: ImportJsonResult }>('/api/promotion-items/import-json', dto)
      .pipe(map(r => r.data));
  }
}

export interface SourceProject {
  code: string;
  total: number;
}

export interface FreebieSource {
  fre_code: string;
  fre_name: string;
  fre_pj_code: string | null;
  fre_calculation_type: 'fixed' | 'formula';
  fre_formula: string | null;
  fre_fixed_value: string | null;
  fre_amt_convert_to_dc: string | null;
  fre_remark: string | null;
  fre_ordering: string | null;
  suggested_value_mode: 'fixed' | 'manual' | 'calculated';
  already_added: boolean;
}

export interface BrowseFreebiesQuery {
  project_id: number;
  q?: string;
  pj_code?: string;
  page?: number;
  per_page?: number;
}

export interface BrowseFreebiesResponse {
  data: FreebieSource[];
  meta: { total: number; page: number; per_page: number; last_page: number };
}

export interface BulkImportFreebiesDto {
  project_id: number;
  default_category: 'discount' | 'premium' | 'expense_support';
  fre_codes: string[];
}

export interface BulkImportFreebiesResult {
  created: number;
  calculated_count: number;
  skipped: { fre_code: string; reason: string }[];
  errors:  { fre_code: string; reason: string }[];
}

// ── Export / Import JSON ──────────────────────────────────────────────────

/** รายการโปรโมชั่นในไฟล์ JSON ที่ export มา (ส่งกลับเข้ามา import ในโครงการเดียวกันหรือโครงการอื่น) */
export interface PromotionItemJson {
  code?: string;
  name: string;
  category: 'discount' | 'premium' | 'expense_support';
  default_value: number;
  max_value: number | null;
  default_used_value: number | null;
  discount_convert_value: number | null;
  value_mode: 'fixed' | 'actual' | 'manual' | 'calculated';
  is_unit_standard: boolean;
  is_active: boolean;
  sort_order: number;
  eligible_start_date: string | null;
  eligible_end_date: string | null;
  eligible_house_model_names: string[];
  eligible_unit_codes: string[];
}

export interface PromotionItemExportFile {
  format: 'promotion-items.v1';
  exported_at: string;
  source_project_id?: number;
  source_project_name?: string;
  count: number;
  items: PromotionItemJson[];
}

export interface ImportJsonDto {
  project_id: number;
  items: PromotionItemJson[];
}

export interface ImportJsonResult {
  created: number;
  skipped: { ref: string; reason: string }[];
  errors:  { ref: string; reason: string }[];
}
