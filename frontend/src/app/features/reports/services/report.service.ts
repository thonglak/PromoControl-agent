import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// ── Interfaces ──────────────────────────────────────────────────────────────

// Sales Report
export interface SalesReportFilter {
  date_from?: string;
  date_to?: string;
  house_model_id?: number | null;
  transaction_status?: string; // 'all' | 'active' | 'cancelled'
  page?: number;
  per_page?: number;
}

export interface SalesPromotionItem {
  name: string;
  effective_category: string;
  used_value: number;
}

export interface SalesItem {
  sale_no: string;
  sale_date: string;
  unit_code: string;
  house_model_name: string;
  base_price: number;
  total_discount: number;
  net_price: number;
  net_after_promo: number;
  unit_cost: number;
  total_promo_cost: number;
  total_expense_support: number;
  total_promo_burden: number;
  profit: number;
  profit_margin_percent: number;
  status: string;
  unit_status: string;
  transfer_date: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  promotion_items: SalesPromotionItem[];
}

export interface SalesSummary {
  total_transactions: number;
  total_transactions_active: number;
  total_transactions_cancelled: number;
  total_base_price: number;
  total_discount: number;
  total_net_price: number;
  total_promo_cost: number;
  total_expense_support: number;
  total_promo_burden: number;
  total_unit_cost: number;
  total_cost: number;
  total_profit: number;
  avg_profit_margin_percent: number;
  management_budget_remaining: number;
}

export interface SalesReport {
  summary: SalesSummary;
  items: SalesItem[];
  pagination: Pagination;
}

// Budget Report
export interface BudgetReportFilter {
  budget_source_type?: string;
  movement_type?: string;
  movement_status?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

export interface BudgetSourceSummary {
  source: string;
  label: string;
  allocated: number;
  used: number;
  returned: number;
  remaining: number;
}

export interface BudgetSummary {
  total_allocated: number;
  total_used: number;
  total_returned: number;
  total_voided: number;
  total_remaining: number;
  utilization_percent: number;
  by_source: BudgetSourceSummary[];
}

export interface BudgetMovement {
  movement_no: string;
  movement_type: string;
  budget_source_type: string;
  amount: number;
  unit_code: string | null;
  sale_no: string | null;
  note: string | null;
  status: string;
  created_at: string;
  created_by_name: string | null;
}

export interface BudgetReport {
  summary: BudgetSummary;
  movements: BudgetMovement[];
  pagination: Pagination;
}

// Promotion Usage Report
export interface PromotionUsageFilter {
  promotion_category?: string;
  effective_category?: string;
  date_from?: string;
  date_to?: string;
}

export interface TopUsedItem {
  item_name: string;
  times_used: number;
  total_value: number;
}

export interface PromotionUsageSummary {
  total_items_used: number;
  total_discount_amount: number;
  total_premium_amount: number;
  total_expense_support_amount: number;
  total_converted_to_discount: number;
  top_used_items: TopUsedItem[];
}

export interface PromotionUsageItem {
  item_code: string;
  item_name: string;
  promotion_category: string;
  times_used: number;
  total_used_value: number;
  avg_used_value: number;
  min_used_value: number;
  max_used_value: number;
  total_converted: number;
}

export interface PromotionUsageReport {
  summary: PromotionUsageSummary;
  items: PromotionUsageItem[];
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);

  // ── Sales Report ────────────────────────────────────────────────────────

  getSalesReport(projectId: number, filters: SalesReportFilter): Observable<SalesReport> {
    const params = this.buildParams({ project_id: projectId, ...filters });
    return this.http
      .get<{ data: SalesReport }>('/api/reports/sales', { params })
      .pipe(map(r => r.data));
  }

  exportSalesCSV(projectId: number, filters: SalesReportFilter): Observable<Blob> {
    const params = this.buildParams({ project_id: projectId, ...filters });
    return this.http.get('/api/reports/sales/export', {
      params,
      responseType: 'blob',
    });
  }

  // ── Budget Report ───────────────────────────────────────────────────────

  getBudgetReport(projectId: number, filters: BudgetReportFilter): Observable<BudgetReport> {
    const params = this.buildParams({ project_id: projectId, ...filters });
    return this.http
      .get<{ data: BudgetReport }>('/api/reports/budget', { params })
      .pipe(map(r => r.data));
  }

  exportBudgetCSV(projectId: number, filters: BudgetReportFilter): Observable<Blob> {
    const params = this.buildParams({ project_id: projectId, ...filters });
    return this.http.get('/api/reports/budget/export', {
      params,
      responseType: 'blob',
    });
  }

  // ── Promotion Usage Report ──────────────────────────────────────────────

  getPromotionUsageReport(projectId: number, filters: PromotionUsageFilter): Observable<PromotionUsageReport> {
    const params = this.buildParams({ project_id: projectId, ...filters });
    return this.http
      .get<{ data: PromotionUsageReport }>('/api/reports/promotion-usage', { params })
      .pipe(map(r => r.data));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private buildParams(obj: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v != null && v !== '') {
        p = p.set(k, String(v));
      }
    });
    return p;
  }

  /** Trigger browser download from Blob response */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
