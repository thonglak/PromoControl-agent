import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Phase {
  id: number;
  name: string;
  sort_order: number;
}

export interface DashboardData {
  sold_units: number;
  sold_net_price: number;
  avg_price_sold: number;
  remaining_units: number;
  stock_value: number;
  avg_price_remaining: number;
  total_units: number;
  approved_project_value: number;
}

export interface DiscountResult {
  net_after_discount: number;
  avg_after_discount: number;
  total_discount_amount: number;
  discount_percent: number;
  project_net_sales: number;
  avg_price_project: number;
  approved_project_value: number;
  value_achieved: number;
  value_difference: number;
  difference_percent: number;
  remaining_units: number;
  stock_value: number;
  sold_net_price: number;
  total_units: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private http = inject(HttpClient);

  getPhases(projectId: number): Observable<Phase[]> {
    const params = new HttpParams().set('project_id', projectId);
    return this.http
      .get<{ data: Phase[] }>('/api/phases', { params })
      .pipe(map(r => r.data));
  }

  getDashboard(projectId: number, phaseId?: number | null): Observable<DashboardData> {
    let params = new HttpParams().set('project_id', projectId);
    if (phaseId != null) {
      params = params.set('phase', phaseId);
    }
    return this.http
      .get<{ data: DashboardData }>('/api/dashboard', { params })
      .pipe(map(r => r.data));
  }

  calculateDiscount(projectId: number, discount: number, phaseId?: number | null): Observable<DiscountResult> {
    const body: Record<string, unknown> = { project_id: projectId, discount };
    if (phaseId != null) {
      body['phase'] = phaseId;
    }
    return this.http
      .post<{ data: DiscountResult }>('/api/dashboard/calculate-discount', body)
      .pipe(map(r => r.data));
  }
}
