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

export interface ReturnUnitBudgetToPoolRequest {
  project_id: number;
  unit_id: number;
  amount: number;
  remark?: string;
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


export interface UnitWithRemaining {
  unit_id: number; unit_code: string; sale_status: string;
  standard_budget: number; total_used: number; total_returned: number;
  budget_remain: number;
  /** งบ Pool ที่จัดสรรให้ยูนิต */
  pool_allocated: number;
  pool_used: number;
  /** งบ Pool คงเหลือ */
  pool_remain: number;
  /** งบผู้บริหารที่จัดสรรให้ยูนิต */
  mgmt_allocated: number;
  mgmt_used: number;
  /** งบผู้บริหารคงเหลือ */
  mgmt_remain: number;
  /** งบอื่นๆ รวม (Pool + ผู้บริหาร) */
  other_remain: number;
  is_returnable: boolean;
}

export interface UnitsWithRemainingResponse {
  project: { id: number; name: string; pool_balance: number };
  units: UnitWithRemaining[];
}

export interface BatchReturnResponse {
  message: string;
  data: {
    movements: { movement_id: number; unit_id: number; unit_code: string; amount: number }[];
    total_returned: number;
    pool_balance: number;
  };
}

export interface ReturnHistoryItem {
  id: number; unit_id: number; amount: number; note: string;
  created_at: string; created_by: number; unit_code: string;
  created_by_name: string;
}

export interface PaginatedReturnHistory {
  data: ReturnHistoryItem[]; total: number; page: number; per_page: number;
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

  transferBudget(data: any): Observable<any> {
    return this.http.post<any>('/api/budget-movements/transfer', data);
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

  // ── Return Unit Budget to Pool ──
  returnUnitBudgetToPool(data: ReturnUnitBudgetToPoolRequest): Observable<{ message: string; data: any }> {
    return this.http.post<{ message: string; data: any }>('/api/budget-movements/return-to-pool', data);
  }

  // ── Units With Remaining (สำหรับหน้า Unit Budget Return) ──
  getUnitsWithRemaining(projectId: number): Observable<UnitsWithRemainingResponse> {
    return this.http.get<UnitsWithRemainingResponse>(
      "/api/budget-movements/units-with-remaining",
      { params: { project_id: projectId } }
    );
  }

  // ── Batch Return Unit Budget to Pool ──
  batchReturnUnitBudgetToPool(projectId: number, unitIds: number[], remark: string = ""): Observable<BatchReturnResponse> {
    return this.http.post<BatchReturnResponse>("/api/budget-movements/batch-return-to-pool", {
      project_id: projectId,
      items: unitIds.map(id => ({ unit_id: id })),
      remark,
    });
  }

  // ── Return History ──
  getReturnHistory(projectId: number, page: number = 1): Observable<PaginatedReturnHistory> {
    return this.http.get<PaginatedReturnHistory>(
      "/api/budget-movements/return-history",
      { params: { project_id: projectId, page } }
    );
  }
}
