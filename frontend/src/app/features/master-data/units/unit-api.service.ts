import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Unit {
  id: number;
  project_id: number;
  house_model_id?: number | null;
  house_model_code?: string | null;
  house_model_name?: string | null;
  unit_code: string;
  unit_number?: string | null;
  floor?: number | null;
  building?: string | null;
  base_price: number;
  unit_cost: number;
  appraisal_price?: number | null;
  area_sqm?: number | null;
  unit_type_id?: number | null;
  unit_type_name?: string | null;
  unit_type_label?: string | null;
  land_area_sqw?: number | null;
  standard_budget: number;
  status: 'available' | 'reserved' | 'sold' | 'transferred';
  sale_date?: string | null;
  transfer_date?: string | null;
  remark?: string | null;
}

export interface UnitPayload {
  project_id?: number;
  house_model_id?: number | null;
  unit_code: string;
  unit_number?: string | null;
  floor?: number | null;
  building?: string | null;
  base_price: number;
  unit_cost: number;
  appraisal_price?: number | null;
  unit_type_id?: number | null;
  unit_type_name?: string | null;
  unit_type_label?: string | null;
  land_area_sqw?: number | null;
  standard_budget: number;
  status?: string;
  remark?: string | null;
}

export interface BulkCreateRow {
  unit_code: string;
  unit_number?: string;
  floor?: number;
  building?: string;
  base_price?: number;
  unit_cost?: number;
  standard_budget?: number;
  house_model_id?: number;
}

export interface BulkCreateResult {
  created: number;
  errors: Array<{ row: number; unit_code: string; error: string }>;
}

@Injectable({ providedIn: 'root' })
export class UnitApiService {
  private http = inject(HttpClient);

  getList(projectId: number, filters: { houseModelId?: number; status?: string; search?: string } = {}): Observable<Unit[]> {
    let params = new HttpParams().set('project_id', projectId);
    if (filters.houseModelId) params = params.set('house_model_id', filters.houseModelId);
    if (filters.status)       params = params.set('status', filters.status);
    if (filters.search)       params = params.set('search', filters.search);
    return this.http
      .get<{ data: Unit[] }>('/api/units', { params })
      .pipe(map(r => r.data));
  }

  create(payload: UnitPayload): Observable<Unit> {
    return this.http
      .post<{ message: string; data: Unit }>('/api/units', payload)
      .pipe(map(r => r.data));
  }

  update(id: number, payload: Partial<UnitPayload>): Observable<Unit> {
    return this.http
      .put<{ message: string; data: Unit }>('/api/units/' + id, payload)
      .pipe(map(r => r.data));
  }

  delete(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>('/api/units/' + id);
  }

  bulkCreate(projectId: number, rows: BulkCreateRow[]): Observable<BulkCreateResult> {
    return this.http
      .post<{ message: string; data: BulkCreateResult }>('/api/units/bulk', { project_id: projectId, units: rows })
      .pipe(map(r => r.data));
  }

  previewRecalculate(dto: RecalculateDto): Observable<RecalculatePreview> {
    return this.http
      .post<{ data: RecalculatePreview }>('/api/units/preview-recalculate', dto)
      .pipe(map(r => r.data));
  }

  bulkRecalculate(dto: RecalculateDto): Observable<RecalculateResult> {
    return this.http
      .post<{ message: string; data: RecalculateResult }>('/api/units/bulk-recalculate', dto)
      .pipe(map(r => r.data));
  }
}

export interface PriceRule {
  enabled: boolean;
  /** percent = X × %; fixed = ค่าตรง; base_minus_budget = base_price − standard_budget (เฉพาะ cost_rule) */
  mode: 'percent' | 'fixed' | 'base_minus_budget';
  /** ใช้เมื่อ mode = 'percent' */
  percent?: number;
  /** ใช้เมื่อ mode = 'fixed' (บาท) */
  amount?: number;
  /** เฉพาะ appraisal_rule + mode='percent' */
  source?: 'base_price' | 'unit_cost';
}

export interface RecalculateDto {
  project_id: number;
  scope: 'zero_only' | 'all';
  cost_rule: PriceRule;
  appraisal_rule: PriceRule;
}

export interface RecalculateResult {
  updated: number;
  cost_changed: number;
  appraisal_changed: number;
}

export interface RecalculatePreviewSample {
  unit_code: string;
  base_price: number;
  current_cost: number;
  new_cost: number | null;
  current_appraisal: number | null;
  new_appraisal: number | null;
}

export interface RecalculatePreview {
  count: number;
  samples: RecalculatePreviewSample[];
}
