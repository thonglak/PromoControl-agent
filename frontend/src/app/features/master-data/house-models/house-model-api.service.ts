import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface HouseModel {
  id: number;
  project_id: number;
  code: string;
  name: string;
  area_sqm: number;
  unit_count: number;
}

export interface HouseModelPayload {
  project_id?: number;
  code: string;
  name: string;
  area_sqm: number;
}

@Injectable({ providedIn: 'root' })
export class HouseModelApiService {
  private http = inject(HttpClient);

  getList(projectId: number, search = ''): Observable<HouseModel[]> {
    let params = new HttpParams().set('project_id', projectId);
    if (search) params = params.set('search', search);
    return this.http
      .get<{ data: HouseModel[] }>('/api/house-models', { params })
      .pipe(map(r => r.data));
  }

  create(payload: HouseModelPayload): Observable<HouseModel> {
    return this.http
      .post<{ message: string; data: HouseModel }>('/api/house-models', payload)
      .pipe(map(r => r.data));
  }

  update(id: number, payload: Partial<HouseModelPayload>): Observable<HouseModel> {
    return this.http
      .put<{ message: string; data: HouseModel }>(`/api/house-models/${id}`, payload)
      .pipe(map(r => r.data));
  }

  delete(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/house-models/${id}`);
  }
}
