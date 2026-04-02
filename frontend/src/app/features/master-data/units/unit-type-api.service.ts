import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface UnitType {
  id: number; project_id: number; name: string; sort_order: number; is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class UnitTypeApiService {
  private http = inject(HttpClient);

  getAll(projectId: number, activeOnly = false): Observable<UnitType[]> {
    let p = new HttpParams().set('project_id', projectId);
    if (activeOnly) p = p.set('active_only', 'true');
    return this.http.get<{ data: UnitType[] }>('/api/unit-types', { params: p }).pipe(map(r => r.data));
  }

  create(data: any): Observable<UnitType> {
    return this.http.post<{ data: UnitType }>('/api/unit-types', data).pipe(map(r => r.data));
  }

  update(id: number, data: any): Observable<UnitType> {
    return this.http.put<{ data: UnitType }>('/api/unit-types/' + id, data).pipe(map(r => r.data));
  }

  delete(id: number): Observable<any> {
    return this.http.delete('/api/unit-types/' + id);
  }
}
