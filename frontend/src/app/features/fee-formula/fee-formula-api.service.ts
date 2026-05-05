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
  base_field: 'appraisal_price' | 'base_price' | 'net_price' | 'manual_input' | 'expression';
  manual_input_label: string | null;
  formula_expression: string | null;
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
  override_expression: string | null;
  condition_expression: string | null;
  note: string | null;
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

export interface ExpressionVariableUsed {
  name: string;
  label: string;
  unit: string;
  scope: string;
  value: number;
}

export interface ExpressionDetail {
  expression: string;
  substituted: string | null;
  variables_used: ExpressionVariableUsed[];
  error: string | null;
  override_expression?: string;
  override_substituted?: string;
  override_variables_used?: ExpressionVariableUsed[];
  override_result?: number;
  override_error?: string | null;
}

export interface PolicyConditionResult {
  condition: string;
  threshold: any;
  actual: any;
  passed: boolean;
}

export interface PolicyCheck {
  id: number;
  policy_name: string;
  priority: number;
  effective_from: string;
  effective_to: string;
  override_rate: number;
  override_buyer_share: number | null;
  override_expression: string | null;
  matched: boolean;
  is_applied: boolean;
  reason: string;
  conditions_met: PolicyConditionResult[];
}

export interface TestResultItem {
  promotion_item_id: number;
  promotion_item_name: string;
  category: string;
  formula: { base_field: string; base_amount: number; default_rate: number; buyer_share: number; normal_value: number; formula_expression?: string | null };
  expression_detail?: ExpressionDetail | null;
  applied_policy: { id: number; policy_name: string } | null;
  effective_rate: number;
  effective_buyer_share: number;
  calculated_value: number;
  savings: number;
  all_policies_checked?: PolicyCheck[];
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

  // ── Variables (สำหรับ expression mode) ──
  getVariables(): Observable<{ name: string; label: string; scope: string; unit: string }[]> {
    return this.http.get<{ data: any[] }>('/api/fee-formulas/variables').pipe(map(r => r.data));
  }

  validateExpression(expression: string): Observable<{ valid: boolean; error?: string; used_variables?: string[]; unknown_variables?: string[] }> {
    return this.http.post<any>('/api/fee-formulas/validate-expression', { expression });
  }

  validateBooleanExpression(expression: string): Observable<{ valid: boolean; error?: string; used_variables?: string[]; unknown_variables?: string[] }> {
    return this.http.post<any>('/api/fee-formulas/validate-boolean-expression', { expression });
  }

  // ── Tester ──
  test(params: any): Observable<TestResult> {
    return this.http.post<TestResult>('/api/fee-formulas/test', params);
  }
  testBatch(params: any): Observable<{ results: BatchResultItem[] }> {
    return this.http.post<{ results: BatchResultItem[] }>('/api/fee-formulas/test-batch', params);
  }

  // ── Export / Import JSON ──
  exportJson(projectId: number): Observable<{ count: number; items: FeeFormulaJson[] }> {
    return this.http.get<{ count: number; items: FeeFormulaJson[] }>('/api/fee-formulas/export-json', {
      params: { project_id: projectId },
    });
  }

  importJson(payload: { project_id: number; items: FeeFormulaJson[] }): Observable<ImportFormulaResult> {
    return this.http
      .post<{ message: string; data: ImportFormulaResult }>('/api/fee-formulas/import-json', payload)
      .pipe(map(r => r.data));
  }
}

// ── Export / Import JSON types ────────────────────────────────────────────

export interface FeeRatePolicyJson {
  policy_name: string;
  override_rate: number;
  override_buyer_share: number | null;
  override_expression: string | null;
  condition_expression: string | null;
  note?: string | null;
  conditions: Record<string, any>;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  priority: number;
}

export interface FeeFormulaJson {
  promotion_item_code: string;
  promotion_item_name?: string;
  base_field: 'appraisal_price' | 'base_price' | 'net_price' | 'manual_input' | 'expression';
  manual_input_label: string | null;
  formula_expression: string | null;
  default_rate: number;
  buyer_share: number;
  description: string | null;
  policies: FeeRatePolicyJson[];
}

export interface FeeFormulaExportFile {
  format: 'fee-formulas.v1';
  exported_at: string;
  source_project_id?: number;
  source_project_name?: string;
  count: number;
  items: FeeFormulaJson[];
}

export interface ImportFormulaResult {
  created: number;
  created_policies: number;
  skipped: { ref: string; reason: string }[];
  errors:  { ref: string; reason: string }[];
}
