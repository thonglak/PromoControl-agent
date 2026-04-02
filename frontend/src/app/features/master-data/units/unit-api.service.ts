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
  standard_budget: number;
  status: 'available' | 'reserved' | 'sold' | 'transferred';
  customer_name?: string | null;
  salesperson?: string | null;
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
  area_sqm?: number | null;
  unit_type_id?: number | null;
  unit_type_name?: string | null;
  unit_type_label?: string | null;
  standard_budget: number;
  status?: string;
  customer_name?: string | null;
  salesperson?: string | null;
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
}
