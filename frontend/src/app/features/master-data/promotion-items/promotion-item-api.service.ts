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
}
