import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface ImportConfigColumn {
  id?: number;
  sort_order: number;
  source_column: string;
  target_field: string;
  field_label: string;
  data_type: 'string' | 'number' | 'date' | 'decimal';
  is_required: boolean;
  is_key_field: boolean;
}

export interface ImportConfig {
  id: number;
  config_name: string;
  import_type: string;
  project_id: number;
  project_name?: string;
  target_table: string;
  file_type: 'xlsx' | 'xls' | 'csv';
  sheet_name: string | null;
  header_row: number;
  data_start_row: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  columns?: ImportConfigColumn[];
}

export interface ImportConfigPayload {
  config_name: string;
  import_type: string;
  project_id: number;
  target_table: string;
  file_type: 'xlsx' | 'xls' | 'csv';
  sheet_name?: string | null;
  header_row: number;
  data_start_row: number;
  is_default?: boolean;
  columns: ImportConfigColumn[];
}

export interface ImportConfigListResponse {
  data: ImportConfig[];
  total: number;
  page: number;
  per_page: number;
}

export interface DetectedColumn {
  header: string;
  samples: (string | number)[];
}

export interface PreviewResponse {
  file_info: {
    file_name: string;
    sheets: string[];
    total_rows: number;
  };
  detected_columns: Record<string, DetectedColumn>;
  preview_rows: Record<string, string | number>[];
  column_totals: Record<string, { sum: number; count: number; min: number; max: number }>;
  mapping_used: { id: number; config_name: string } | null;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ImportConfigApiService {
  private http = inject(HttpClient);

  getList(projectId: number, importType?: string): Observable<ImportConfig[]> {
    let params = new HttpParams().set('project_id', projectId);
    if (importType) params = params.set('import_type', importType);
    return this.http
      .get<{ data: ImportConfig[] }>('/api/import-configs', { params })
      .pipe(map(r => r.data));
  }

  getById(id: number): Observable<ImportConfig> {
    return this.http
      .get<{ data: ImportConfig }>(`/api/import-configs/${id}`)
      .pipe(map(r => r.data));
  }

  create(payload: ImportConfigPayload): Observable<ImportConfig> {
    return this.http
      .post<{ data: ImportConfig }>('/api/import-configs', payload)
      .pipe(map(r => r.data));
  }

  update(id: number, payload: ImportConfigPayload): Observable<ImportConfig> {
    return this.http
      .put<{ data: ImportConfig }>(`/api/import-configs/${id}`, payload)
      .pipe(map(r => r.data));
  }

  delete(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/import-configs/${id}`);
  }

  setDefault(id: number): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`/api/import-configs/${id}/set-default`, {});
  }

  preview(file: File, projectId: number, configId?: number): Observable<PreviewResponse> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('project_id', String(projectId));
    if (configId) fd.append('config_id', String(configId));
    return this.http.post<PreviewResponse>('/api/import-configs/preview', fd);
  }
}
