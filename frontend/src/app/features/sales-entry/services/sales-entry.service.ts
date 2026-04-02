import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface EligibleItem {
  id: number;
  code: string;
  name: string;
  category: 'discount' | 'premium' | 'expense_support';
  value_mode: 'fixed' | 'actual' | 'manual' | 'calculated';
  max_value: number | null;
  default_used_value: number | null;
  discount_convert_value: number | null;
  default_value: number | null;
  is_unit_standard: boolean;
  sort_order: number;
  calculated_value: number | null;
  effective_rate: number | null;
  effective_buyer_share: number | null;
  formula_display: string | null;
  fee_formula: {
    id: number;
    base_field: string;
    default_rate: number;
    buyer_share: number;
    manual_input_label: string | null;
    description: string | null;
    policies: {
      id: number;
      policy_name: string;
      override_rate: number;
      override_buyer_share: number | null;
      priority: number;
      effective_from: string;
      effective_to: string;
      conditions: Record<string, any>;
      is_matched: boolean;
      match_reason: string;
    }[];
  } | null;
  warnings: string[];
}

export interface EligibleResponse {
  panel_a: EligibleItem[];
  panel_b: EligibleItem[];
  unit: {
    id: number;
    unit_code: string;
    base_price: number;
    unit_cost: number;
    appraisal_price: number | null;
    standard_budget: number;
    house_model_id: number | null;
    status: string;
  };
}

export interface SalesTransaction {
  id: number;
  sale_no: string;
  project_id: number;
  unit_id: number;
  unit_code?: string;
  unit_status?: string;
  project_name?: string;
  base_price: number;
  net_price: number;
  total_discount: number;
  total_promo_cost: number;
  total_expense_support: number;
  total_promo_burden: number;
  total_cost: number;
  profit: number;
  customer_name: string;
  salesperson: string;
  sale_date: string;
  status: 'active' | 'cancelled';
  cancelled_at?: string;
  cancelled_by?: number;
  cancelled_by_name?: string;
  cancel_reason?: string;
  transfer_date?: string;
  transferred_by?: number;
  transferred_by_name?: string;
  transferred_at?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SalesTransactionDetail {
  sales_transaction: SalesTransaction;
  items: any[];
  budget_movements: any[];
}

export interface TransferResponse {
  transaction_id: number;
  unit_status: string;
  transfer_date: string;
  transferred_by: string;
  transferred_at: string;
}

@Injectable({ providedIn: 'root' })
export class SalesEntryService {
  private http = inject(HttpClient);

  getEligibleItems(projectId: number, unitId: number, saleDate: string): Observable<EligibleResponse> {
    const params = new HttpParams()
      .set('project_id', projectId)
      .set('unit_id', unitId)
      .set('sale_date', saleDate);
    return this.http
      .get<{ data: EligibleResponse }>('/api/promotion-items/eligible', { params })
      .pipe(map(r => r.data));
  }

  getTransactions(params: Record<string, any> = {}): Observable<{ data: SalesTransaction[]; total: number; page: number; per_page: number; summary?: { total_budget_remaining: number; total_budget_allocated: number; total_budget_used: number } }> {
    let p = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p = p.set(k, v); });
    return this.http.get<any>('/api/sales-transactions', { params: p });
  }

  getTransaction(id: number): Observable<SalesTransactionDetail> {
    return this.http
      .get<SalesTransactionDetail>(`/api/sales-transactions/${id}`);
  }

  createTransaction(data: any): Observable<any> {
    return this.http
      .post<{ message: string; data: any }>('/api/sales-transactions', data)
      .pipe(map(r => r.data));
  }

  updateTransaction(id: number, data: any): Observable<any> {
    return this.http
      .put<{ message: string; data: any }>(`/api/sales-transactions/${id}`, data)
      .pipe(map(r => r.data));
  }

  cancelSale(transactionId: number, reason: string): Observable<any> {
    return this.http.post<any>(`/api/sales-transactions/${transactionId}/cancel`, { reason });
  }

  markAsTransferred(transactionId: number, transferDate: string): Observable<TransferResponse> {
    return this.http.post<{ data: TransferResponse }>(
      `/api/sales-transactions/${transactionId}/transfer`,
      { transfer_date: transferDate }
    ).pipe(map(r => r.data));
  }
}
