import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface LegacyReconciliation {
  project_id: string;
  legacy_total_budget_remaining: number;
  legacy_total_profit: number;
  as_of_date: string;       // 'YYYY-MM-DD'
  note: string | null;
  updated_at: string;
  updated_by: string;
  updated_by_name: string;
}

export interface LegacyReconciliationPayload {
  legacy_total_budget_remaining: number;
  legacy_total_profit: number;
  as_of_date: string;
  note?: string | null;
}

@Injectable({ providedIn: 'root' })
export class LegacyReconciliationService {
  private http = inject(HttpClient);

  /** ดึงข้อมูลกระทบยอดระบบเก่าของโครงการ */
  get(projectId: number): Observable<LegacyReconciliation | null> {
    return this.http
      .get<{ data: LegacyReconciliation | null }>(`/api/projects/${projectId}/legacy-reconciliation`)
      .pipe(map(r => r.data));
  }

  /** บันทึก/อัปเดตข้อมูลกระทบยอดระบบเก่า (admin/manager) */
  save(projectId: number, payload: LegacyReconciliationPayload): Observable<LegacyReconciliation> {
    return this.http
      .put<{ data: LegacyReconciliation }>(`/api/projects/${projectId}/legacy-reconciliation`, payload)
      .pipe(map(r => r.data));
  }

  /** ลบข้อมูลกระทบยอดระบบเก่า (admin เท่านั้น) */
  delete(projectId: number): Observable<void> {
    return this.http
      .delete<{ success: true }>(`/api/projects/${projectId}/legacy-reconciliation`)
      .pipe(map(() => undefined));
  }
}
