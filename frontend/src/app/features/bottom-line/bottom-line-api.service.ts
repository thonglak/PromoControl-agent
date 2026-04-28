import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// ── Upload response ──
export interface UploadResult {
  file_name: string;
  sheets: string[];
  total_rows: number;
  detected_columns: Record<string, string>;
  preview_rows: Record<string, any>[];
  mapping_used: { id: number; preset_name: string } | null;
  temp_file: string;
}

// ── Import request / response ──
export interface MappingConfig {
  unit_code_column: string;
  bottom_line_price_column: string;
  appraisal_price_column: string;
  standard_budget_column?: string;
  base_price_column?: string;
  header_row: number;
  data_start_row: number;
  sheet_name: string;
}

export interface PreviewResult {
  total_rows: number;
  detected_columns: Record<string, string>;
  preview_rows: Array<{ row: number; unit_code: string; bottom_line_price: number; appraisal_price: number; standard_budget?: number; base_price?: number }>;
}

export interface ImportRequest {
  project_id: number;
  temp_file: string;
  file_name: string;
  mapping: MappingConfig;
  save_mapping_as?: string;
  set_as_default?: boolean;
  note?: string;
}

export interface ImportResult {
  import_key: string;
  status: 'completed' | 'failed';
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  updated_rows: number;
  backup_table: string;
  dynamic_table: string;
}

// ── History / Detail ──
export interface BottomLineRecord {
  id: number;
  import_key: string;
  project_id: number;
  file_name: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  updated_rows: number;
  backup_table_name: string;
  mapping_preset_id: number | null;
  status: 'completed' | 'failed' | 'rolled_back';
  note: string | null;
  imported_by: number;
  imported_by_name: string;
  imported_at: string;
  rows?: DynamicRow[];
}

export interface DynamicRow {
  id: number;
  row_number: number;
  unit_code: string;
  bottom_line_price: number;
  appraisal_price: number;
  matched_unit_id: number | null;
  old_unit_cost: number | null;
  old_appraisal: number | null;
  status: 'matched' | 'unmatched' | 'updated' | 'skipped';
}

export interface HistoryResponse {
  items: BottomLineRecord[];
  total: number;
  page: number;
  per_page: number;
}

// ── Mapping Presets ──
export interface MappingPreset {
  id: number;
  project_id: number;
  preset_name: string;
  mapping_config: MappingConfig;
  is_default: boolean;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface MappingPresetPayload {
  project_id: number;
  preset_name: string;
  mapping_config: MappingConfig;
  is_default?: boolean;
}

@Injectable({ providedIn: 'root' })
export class BottomLineApiService {
  private http = inject(HttpClient);

  // ── Upload ──
  upload(file: File, projectId: number, mappingId?: number): Observable<UploadResult> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('project_id', String(projectId));
    if (mappingId) fd.append('mapping_id', String(mappingId));
    return this.http.post<UploadResult>('/api/bottom-lines/upload', fd);
  }

  // ── Import ──
  import(req: ImportRequest): Observable<ImportResult> {
    return this.http.post<ImportResult>('/api/bottom-lines/import', req);
  }

  // ── Preview (re-parse with new mapping) ──
  preview(tempFile: string, mapping: MappingConfig): Observable<PreviewResult> {
    return this.http.post<PreviewResult>("/api/bottom-lines/preview", { temp_file: tempFile, mapping });
  }

  // ── History ──
  getHistory(projectId: number, filters: { status?: string; date_from?: string; date_to?: string; page?: number; per_page?: number } = {}): Observable<HistoryResponse> {
    let p = new HttpParams().set('project_id', projectId);
    if (filters.status)    p = p.set('status', filters.status);
    if (filters.date_from) p = p.set('date_from', filters.date_from);
    if (filters.date_to)   p = p.set('date_to', filters.date_to);
    if (filters.page)      p = p.set('page', filters.page);
    if (filters.per_page)  p = p.set('per_page', filters.per_page);
    return this.http.get<HistoryResponse>('/api/bottom-lines', { params: p });
  }

  // ── Detail ──
  getDetail(importKey: string): Observable<BottomLineRecord> {
    return this.http.get<{ data: BottomLineRecord }>('/api/bottom-lines/' + importKey).pipe(map(r => r.data));
  }

  // ── Rollback ──
  rollback(importKey: string): Observable<{ message: string; restored_rows: number }> {
    return this.http.post<{ message: string; restored_rows: number }>('/api/bottom-lines/' + importKey + '/rollback', {});
  }

  // ── Mapping Presets ──
  getMappings(projectId: number): Observable<MappingPreset[]> {
    return this.http.get<{ data: MappingPreset[] }>('/api/bottom-line-mappings', { params: { project_id: projectId } }).pipe(map(r => r.data));
  }

  createMapping(payload: MappingPresetPayload): Observable<MappingPreset> {
    return this.http.post<{ data: MappingPreset }>('/api/bottom-line-mappings', payload).pipe(map(r => r.data));
  }

  updateMapping(id: number, payload: MappingPresetPayload): Observable<MappingPreset> {
    return this.http.put<{ data: MappingPreset }>('/api/bottom-line-mappings/' + id, payload).pipe(map(r => r.data));
  }

  deleteMapping(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>('/api/bottom-line-mappings/' + id);
  }
}
