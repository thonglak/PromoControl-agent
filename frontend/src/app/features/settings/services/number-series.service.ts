import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface NumberSeries {
  id: number;
  project_id: number;
  document_type: string;
  prefix: string;
  separator: string;
  year_format: string;
  year_separator: string;
  running_digits: number;
  reset_cycle: string;
  next_number: number;
  last_reset_date: string | null;
  sample_output: string;
  is_active: boolean;
}

export interface NumberSeriesUpdate {
  prefix?: string;
  separator?: string;
  year_format?: string;
  year_separator?: string;
  running_digits?: number;
  reset_cycle?: string;
  next_number?: number;
  is_active?: boolean;
}

export interface NumberSeriesPreviewRequest {
  prefix: string;
  separator: string;
  year_format: string;
  year_separator: string;
  running_digits: number;
  reset_cycle: string;
  next_number: number;
  reference_date: string;
}

export interface NumberSeriesPreviewResponse {
  pattern_display: string;
  samples: { label: string; number: string }[];
  reset_sample?: { label: string; number: string };
}

export interface NumberSeriesLog {
  id: number;
  generated_number: string;
  reference_id: number;
  reference_table: string;
  generated_by: number;
  generated_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class NumberSeriesService {
  private http = inject(HttpClient);

  /** รายการ series ทั้งหมดของโครงการ */
  getList(projectId: number): Observable<NumberSeries[]> {
    const params = new HttpParams().set('project_id', projectId);
    return this.http
      .get<{ data: NumberSeries[] }>('/api/number-series', { params })
      .pipe(map(r => r.data));
  }

  /** รายละเอียด series */
  getById(id: number): Observable<NumberSeries> {
    return this.http
      .get<{ data: NumberSeries }>(`/api/number-series/${id}`)
      .pipe(map(r => r.data));
  }

  /** แก้ไข series (pattern, next_number, is_active) */
  update(id: number, data: NumberSeriesUpdate): Observable<NumberSeries> {
    return this.http
      .put<{ message: string; data: NumberSeries }>(`/api/number-series/${id}`, data)
      .pipe(map(r => r.data));
  }

  /** Preview เลขที่จาก pattern ที่กำหนด */
  preview(config: NumberSeriesPreviewRequest): Observable<NumberSeriesPreviewResponse> {
    return this.http
      .post<{ data: NumberSeriesPreviewResponse }>('/api/number-series/preview', config)
      .pipe(map(r => r.data));
  }

  /** ประวัติการออกเลขที่ */
  getLogs(id: number, page: number, pageSize: number): Observable<PaginatedResponse<NumberSeriesLog>> {
    const params = new HttpParams()
      .set('page', page)
      .set('page_size', pageSize);
    return this.http
      .get<PaginatedResponse<NumberSeriesLog>>(`/api/number-series/${id}/logs`, { params });
  }
}
