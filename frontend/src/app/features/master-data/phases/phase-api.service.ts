import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Phase {
  id: number;
  project_id: number;
  name: string;
  sort_order: number;
  unit_count: number;
  created_at: string;
  updated_at: string;
}

export interface PhasePayload {
  project_id: number;
  name: string;
  sort_order?: number;
}

@Injectable({ providedIn: 'root' })
export class PhaseApiService {
  private http = inject(HttpClient);

  getAll(projectId: number): Observable<Phase[]> {
    const params = new HttpParams().set('project_id', projectId);
    return this.http
      .get<{ data: Phase[] }>('/api/phases', { params })
      .pipe(map(r => r.data));
  }

  create(data: PhasePayload): Observable<Phase> {
    return this.http
      .post<{ data: Phase }>('/api/phases', data)
      .pipe(map(r => r.data));
  }

  update(id: number, data: Partial<PhasePayload>): Observable<Phase> {
    return this.http
      .put<{ data: Phase }>(`/api/phases/${id}`, data)
      .pipe(map(r => r.data));
  }

  delete(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/phases/${id}`);
  }
}
