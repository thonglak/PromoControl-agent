import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** แหล่งข้อมูลค่ารายยูนิต (value_mode=unit_table) */
export interface ValueSource {
  id: number;
  source_key: string;
  label: string;
  description: string | null;
  source_table: string;
  item_column: string;
  unit_column: string;
  amount_column: string;
  is_active: number;
  is_system: number;
  usage_count: number;
  schema_ok: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ValueSourcePayload {
  source_key?: string;
  label: string;
  description?: string | null;
  source_table?: string;
  item_column?: string;
  unit_column?: string;
  amount_column?: string;
  is_active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ValueSourceApiService {
  private http = inject(HttpClient);
  private base = '/api/promotion-value-sources';

  list(): Observable<ValueSource[]> {
    return this.http.get<{ data: ValueSource[] }>(this.base).pipe(map(r => r.data));
  }

  create(payload: ValueSourcePayload): Observable<ValueSource> {
    return this.http.post<{ data: ValueSource }>(this.base, payload).pipe(map(r => r.data));
  }

  update(id: number, payload: ValueSourcePayload): Observable<ValueSource> {
    return this.http.put<{ data: ValueSource }>(`${this.base}/${id}`, payload).pipe(map(r => r.data));
  }

  delete(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
