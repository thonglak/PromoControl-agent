import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface FeeFormula {
  id: number;
  promotion_item_id: number;
  promotion_item_name: string;
  promotion_item_code: string;
  promotion_item_category: string;
  item_max_value: number | null;
  base_field: 'appraisal_price' | 'base_price' | 'net_price' | 'manual_input';
  manual_input_label: string | null;
  default_rate: number;
  buyer_share: number;
  description: string | null;
  policies_count: number;
  active_policies_count: number;
  policies?: FeeRatePolicy[];
}

export interface FeeRatePolicy {
  id: number;
  fee_formula_id: number;
  policy_name: string;
  override_rate: number;
  override_buyer_share: number | null;
  conditions: any;
  effective_from: string;
  effective_to: string;
  is_active: boolean;
  priority: number;
  promotion_item_name?: string;
}

export interface TestResult {
  results: TestResultItem[];
  total_calculated: number;
  total_normal: number;
  total_savings: number;
}

export interface TestResultItem {
  promotion_item_id: number;
  promotion_item_name: string;
  category: string;
  formula: { base_field: string; base_amount: number; default_rate: number; buyer_share: number; normal_value: number };
  applied_policy: { id: number; policy_name: string } | null;
  effective_rate: number;
  effective_buyer_share: number;
  calculated_value: number;
  savings: number;
}

export interface BatchResultItem {
  unit_code: string;
  unit_id: number;
  base_amount: number;
  rate: number;
  buyer_share: number;
  calculated_value: number;
  matched_policy: string | null;
}

@Injectable({ providedIn: 'root' })
export class FeeFormulaApiService {
  private http = inject(HttpClient);

  // ── Formulas ──
  getFormulas(projectId?: number): Observable<FeeFormula[]> {
    return this.http.get<{ data: FeeFormula[] }>('/api/fee-formulas', { params: projectId ? { project_id: projectId } : {} }).pipe(map(r => r.data));
  }
  getFormula(id: number): Observable<FeeFormula> {
    return this.http.get<{ data: FeeFormula }>('/api/fee-formulas/' + id).pipe(map(r => r.data));
  }
  createFormula(payload: any): Observable<FeeFormula> {
    return this.http.post<{ data: FeeFormula }>('/api/fee-formulas', payload).pipe(map(r => r.data));
  }
  updateFormula(id: number, payload: any): Observable<FeeFormula> {
    return this.http.put<{ data: FeeFormula }>('/api/fee-formulas/' + id, payload).pipe(map(r => r.data));
  }
  deleteFormula(id: number): Observable<any> {
    return this.http.delete('/api/fee-formulas/' + id);
  }

  // ── Policies ──
  getPolicies(formulaId: number): Observable<FeeRatePolicy[]> {
    return this.http.get<{ data: FeeRatePolicy[] }>('/api/fee-rate-policies', { params: { fee_formula_id: formulaId } }).pipe(map(r => r.data));
  }
  createPolicy(payload: any): Observable<FeeRatePolicy> {
    return this.http.post<{ data: FeeRatePolicy }>('/api/fee-rate-policies', payload).pipe(map(r => r.data));
  }
  updatePolicy(id: number, payload: any): Observable<FeeRatePolicy> {
    return this.http.put<{ data: FeeRatePolicy }>('/api/fee-rate-policies/' + id, payload).pipe(map(r => r.data));
  }
  deletePolicy(id: number): Observable<any> {
    return this.http.delete('/api/fee-rate-policies/' + id);
  }
  togglePolicy(id: number): Observable<FeeRatePolicy> {
    return this.http.patch<{ data: FeeRatePolicy }>('/api/fee-rate-policies/' + id + '/toggle', {}).pipe(map(r => r.data));
  }

  // ── Tester ──
  test(params: any): Observable<TestResult> {
    return this.http.post<TestResult>('/api/fee-formulas/test', params);
  }
  testBatch(params: any): Observable<{ results: BatchResultItem[] }> {
    return this.http.post<{ results: BatchResultItem[] }>('/api/fee-formulas/test-batch', params);
  }
}
