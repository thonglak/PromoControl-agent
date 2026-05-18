import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface BudgetMovement {
  id: number; movement_no: string; project_id: number; unit_id: number;
  movement_type: string; budget_source_type: string; amount: number;
  status: 'pending' | 'approved' | 'rejected';
  unit_code?: string; created_by_name?: string; approved_by_name?: string;
  note?: string; created_at: string;
}

export interface SourceSummary { allocated: number; used: number; remaining: number; returned?: number; }

export interface UnitBudgetSummary {
  unit_id: number; unit_code: string;
  UNIT_STANDARD: SourceSummary; PROJECT_POOL: SourceSummary;
  MANAGEMENT_SPECIAL: SourceSummary;
  total_allocated: number; total_used: number; total_remaining: number;
  recent_movements?: any[]; pending_count?: number;
}

export interface PoolBalance {
  pool_budget_amount: number; total_allocated_from_pool: number;
  total_returned_to_pool: number; pool_remaining: number;
  total_units_with_pool_allocation: number;
}

export interface UnitAllocation {
  id: number; unit_id: number; project_id: number;
  budget_source_type: string; allocated_amount: number;
  movement_id: number; note: string; created_by_name?: string;
}


export interface VoidSpecialBudgetRequest {
  project_id: number;
  unit_id: number;
  budget_source_type: 'MANAGEMENT_SPECIAL';
  note: string;
}

export interface ReturnSpecialBudgetRequest {
  project_id: number;
  unit_id: number;
  budget_source_type: 'MANAGEMENT_SPECIAL';
  amount: number;
  note: string;
}

export interface TransferSpecialBudgetRequest {
  from_unit_id: number;
  to_unit_id: number;
  budget_source_type: 'MANAGEMENT_SPECIAL';
  amount: number;
  note: string;
}

export interface TransferSpecialBudgetResponse {
  transfer_out: BudgetMovement;
  transfer_in: BudgetMovement;
  message: string;
}


export interface UnitBudgetSettingItem {
  id: number;
  code: string;
  name: string;
  value: number;
}

export interface UnitBudgetSettingRow {
  unit_id: number;
  unit_code: string;
  house_model_id: number | null;
  house_model_name: string | null;
  current_budget: number;
  calculated_budget: number;
  diff: number;
  item_count: number;
  items: UnitBudgetSettingItem[];
}

export interface UnitBudgetSettingsPreviewResponse {
  data: UnitBudgetSettingRow[];
  meta: { project_id: number; count: number };
}

export interface UnitBudgetSettingsApplyResponse {
  message: string;
  data: { updated: number };
}
@Injectable({ providedIn: 'root' })
export class BudgetService {
  private http = inject(HttpClient);

  // ── Movements ──
  getMovements(params: Record<string, any> = {}): Observable<{ data: BudgetMovement[]; total: number; page: number; per_page: number }> {
    let p = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p = p.set(k, v); });
    return this.http.get<any>('/api/budget-movements', { params: p });
  }

  getUnitSummary(unitId: number, projectId: number): Observable<UnitBudgetSummary> {
    return this.http.get<{ data: UnitBudgetSummary }>(`/api/budget-movements/summary/${unitId}`, { params: { project_id: projectId } }).pipe(map(r => r.data));
  }

  getPoolBalance(projectId: number): Observable<PoolBalance> {
    return this.http.get<{ data: PoolBalance }>('/api/budget-movements/pool-balance', { params: { project_id: projectId } }).pipe(map(r => r.data));
  }

  createMovement(data: any): Observable<BudgetMovement> {
    return this.http.post<{ data: BudgetMovement }>('/api/budget-movements', data).pipe(map(r => r.data));
  }

  approveMovement(id: number): Observable<any> {
    return this.http.post<any>(`/api/budget-movements/${id}/approve`, {});
  }

  rejectMovement(id: number, reason: string): Observable<any> {
    return this.http.post<any>(`/api/budget-movements/${id}/reject`, { reason });
  }

  // ── Allocations ──
  getUnitAllocations(unitId: number, projectId: number): Observable<{ unit_id: number; allocations: UnitAllocation[] }> {
    return this.http.get<{ data: any }>(`/api/unit-budget-allocations/${unitId}`, { params: { project_id: projectId } }).pipe(map(r => r.data));
  }

  createAllocation(data: any): Observable<any> {
    return this.http.post<any>('/api/unit-budget-allocations', data);
  }

  updateAllocation(id: number, data: any): Observable<any> {
    return this.http.put<any>(`/api/unit-budget-allocations/${id}`, data);
  }

  deleteAllocation(id: number): Observable<any> {
    return this.http.delete<any>(`/api/unit-budget-allocations/${id}`);
  }
  // ── Return Special Budget ──
  returnSpecialBudget(data: ReturnSpecialBudgetRequest): Observable<{ message: string; data: { movement: BudgetMovement; balance: any; status: string } }> {
    return this.http.post<{ message: string; data: { movement: BudgetMovement; balance: any; status: string } }>('/api/budget-movements/return-special', data);
  }

  // ── Void Special Budget ──
  voidSpecialBudget(data: VoidSpecialBudgetRequest): Observable<{ message: string; data: { movement: BudgetMovement; balance: any; status: string } }> {
    return this.http.post<{ message: string; data: { movement: BudgetMovement; balance: any; status: string } }>('/api/budget-movements/void-special', data);
  }
  // ── Transfer Special Budget ──
  transferSpecialBudget(params: TransferSpecialBudgetRequest): Observable<{ data: TransferSpecialBudgetResponse }> {
    return this.http.post<{ data: TransferSpecialBudgetResponse }>('/api/budget-movements/transfer-special', params);
  }

  // ── Unit Budget Settings (คำนวณงบยูนิตจากรายการโปรโมชั่นมาตรฐาน) ──
  previewUnitBudgetSettings(projectId: number): Observable<UnitBudgetSettingsPreviewResponse> {
    return this.http.get<UnitBudgetSettingsPreviewResponse>(
      '/api/unit-budget-settings/preview',
      { params: { project_id: projectId } }
    );
  }

  applyUnitBudgetSettings(projectId: number, unitIds?: number[]): Observable<UnitBudgetSettingsApplyResponse> {
    const body: any = { project_id: projectId };
    if (unitIds && unitIds.length > 0) body.unit_ids = unitIds;
    return this.http.post<UnitBudgetSettingsApplyResponse>('/api/unit-budget-settings/apply', body);
  }
}
