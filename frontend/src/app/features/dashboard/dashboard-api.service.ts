import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ProjectSummary {
  total_units: number;
  units_available: number;
  units_reserved: number;
  units_sold: number;
  units_transferred: number;
  total_sales_amount: number;
  total_discount: number;
  total_promo_cost: number;
  total_expense_support: number;
  total_promo_burden: number;
  total_profit: number;
  avg_profit_per_unit: number;
  avg_discount_per_unit: number;
  total_transactions_active: number;
  total_transactions_cancelled: number;
}

export interface BudgetSummary {
  pool_budget_amount: number;
  pool_used: number;
  pool_returned: number;
  pool_remaining: number;
  total_unit_standard_allocated: number;
  total_unit_standard_used: number;
  total_unit_standard_returned: number;
  total_unit_standard_remaining: number;
  management_special_allocated: number;
  management_special_used: number;
  management_special_remaining: number;
  campaign_support_allocated: number;
  campaign_support_used: number;
  campaign_support_remaining: number;
  total_budget_allocated: number;
  total_budget_used: number;
  total_budget_remaining: number;
  budget_utilization_percent: number;
}

export interface DashboardSummary {
  project_summary: ProjectSummary;
  budget_summary: BudgetSummary;
}

export interface RecentSale {
  sale_no: string;
  unit_code: string;
  base_price: number;
  net_price: number;
  profit: number;
  sale_date: string;
  created_at: string;
  status: 'active' | 'cancelled' | 'draft' | 'confirmed';
  unit_status: 'available' | 'reserved' | 'sold' | 'transferred';
}

export interface UnitStatusItem {
  status: string;
  label: string;
  count: number;
  color: string;
}

export interface BudgetUsageItem {
  source: string;
  label: string;
  allocated: number;
  used: number;
  returned: number;
}

export interface DashboardCharts {
  unit_status_chart: UnitStatusItem[];
  budget_usage_by_source: BudgetUsageItem[];
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private http = inject(HttpClient);

  getSummary(projectId: number): Observable<DashboardSummary> {
    const params = new HttpParams().set('project_id', projectId);
    return this.http
      .get<{ data: DashboardSummary }>('/api/dashboard/summary', { params })
      .pipe(map(r => r.data));
  }

  getRecentSales(projectId: number, limit: number = 10): Observable<RecentSale[]> {
    const params = new HttpParams()
      .set('project_id', projectId)
      .set('limit', limit);
    return this.http
      .get<{ data: RecentSale[] }>('/api/dashboard/recent-sales', { params })
      .pipe(map(r => r.data));
  }

  getCharts(projectId: number): Observable<DashboardCharts> {
    const params = new HttpParams().set('project_id', projectId);
    return this.http
      .get<{ data: DashboardCharts }>('/api/dashboard/charts', { params })
      .pipe(map(r => r.data));
  }
}
