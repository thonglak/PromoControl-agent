import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// ── External API Config ────────────────────────────────────────────────────────

export interface ExternalApiConfig {
  id: number;
  project_id: number;
  name: string;
  api_url: string;
  is_active: boolean | number;
  created_at: string;
  updated_at: string;
}

export interface ExternalApiConfigCreatePayload {
  project_id: number;
  name: string;
  api_url: string;
  is_active: boolean;
}

export interface ExternalApiConfigUpdatePayload {
  name: string;
  api_url: string;
  is_active: boolean;
}

// ── Sync From API Snapshot ─────────────────────────────────────────────────────

export interface SyncFromApiSnapshot {
  id: number;
  code: string;
  name: string | null;
  project_id: number;
  config_id: number;
  config_name: string;
  api_url: string;
  total_rows: number;
  status: 'completed' | 'failed';
  error_message: string | null;
  fetched_by: number;
  fetched_by_name: string;
  created_at: string;
}

export interface SnapshotDetailResponse {
  snapshot: SyncFromApiSnapshot;
  data: Record<string, unknown>[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface FetchResult {
  status: string;
  code: string;
  snapshot_id: number;
  total_rows: number;
  table_name: string;
  error_message?: string;
}

// ── Sync Target Tables ─────────────────────────────────────────────────────────

export interface SyncTargetTable {
  id: number;
  table_name: string;
  label: string;
  default_upsert_key: string;
  is_active: boolean | number;
  created_at: string;
  updated_at: string;
}

export interface TargetTableColumn {
  field: string;
  type: string;
  label: string;
}

// ── Mapping Presets ────────────────────────────────────────────────────────────

export interface MappingPreset {
  id: number;
  project_id: number;
  name: string;
  target_table: string;
  upsert_key: string;
  project_id_mode: 'from_snapshot' | 'from_field' | 'none';
  project_id_field: string | null;
  is_default: boolean | number;
  columns_count: number;
  created_at: string;
  updated_at: string;
}

export interface MappingColumn {
  id?: number;
  preset_id?: number;
  source_field: string;
  target_field: string;
  transform_type: 'none' | 'number' | 'date' | 'status_map' | 'fk_lookup';
  transform_value?: string | null;
  sort_order: number;
}

export interface MappingPresetDetail extends MappingPreset {
  columns: MappingColumn[];
}

export interface TargetField {
  field: string;
  type: string;
  label: string;
}

export interface SourceField {
  field: string;
  sample: string | null;
}

@Injectable({ providedIn: 'root' })
export class SyncFromApiService {
  private http = inject(HttpClient);

  // ── External API Configs ──────────────────────────────────────────────────

  getConfigs(projectId: number): Observable<ExternalApiConfig[]> {
    const params = new HttpParams().set('project_id', projectId);
    return this.http
      .get<{ data: ExternalApiConfig[] }>('/api/external-api-configs', { params })
      .pipe(map(r => r.data));
  }

  createConfig(payload: ExternalApiConfigCreatePayload): Observable<ExternalApiConfig> {
    return this.http
      .post<{ data: ExternalApiConfig }>('/api/external-api-configs', payload)
      .pipe(map(r => r.data));
  }

  updateConfig(id: number, payload: ExternalApiConfigUpdatePayload): Observable<ExternalApiConfig> {
    return this.http
      .put<{ data: ExternalApiConfig }>(`/api/external-api-configs/${id}`, payload)
      .pipe(map(r => r.data));
  }

  deleteConfig(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/external-api-configs/${id}`);
  }

  // ── Sync From API Snapshots ───────────────────────────────────────────────

  getSnapshots(projectId: number): Observable<SyncFromApiSnapshot[]> {
    const params = new HttpParams().set('project_id', projectId);
    return this.http
      .get<{ items: SyncFromApiSnapshot[] }>('/api/sync-from-api', { params })
      .pipe(map(r => r.items));
  }

  fetchSnapshot(configId: number): Observable<FetchResult> {
    return this.http
      .post<{ data: FetchResult }>('/api/sync-from-api/fetch', { config_id: configId })
      .pipe(map(r => r.data));
  }

  getSnapshotDetail(id: number, page = 1, perPage = 25): Observable<SnapshotDetailResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('per_page', perPage);
    return this.http.get<SnapshotDetailResponse>(`/api/sync-from-api/${id}`, { params });
  }

  deleteSnapshot(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/sync-from-api/${id}`);
  }

  updateSnapshot(id: number, payload: { name: string }): Observable<{ id: number; name: string; code: string }> {
    return this.http
      .put<{ data: { id: number; name: string; code: string } }>(`/api/sync-from-api/${id}`, payload)
      .pipe(map(r => r.data));
  }

  // ── Mapping Presets ──────────────────────────────────────────────────────

  getMappingPresets(projectId: number): Observable<MappingPreset[]> {
    const params = new HttpParams().set('project_id', projectId);
    return this.http
      .get<{ data: MappingPreset[] }>('/api/api-field-mappings', { params })
      .pipe(map(r => r.data));
  }

  getMappingPreset(id: number): Observable<MappingPresetDetail> {
    return this.http
      .get<{ data: MappingPresetDetail }>(`/api/api-field-mappings/${id}`)
      .pipe(map(r => r.data));
  }

  createMappingPreset(payload: {
    project_id: number;
    name: string;
    target_table?: string;
    upsert_key?: string;
    project_id_mode?: 'from_snapshot' | 'from_field' | 'none';
    project_id_field?: string | null;
    is_default?: boolean;
    columns: MappingColumn[];
  }): Observable<MappingPresetDetail> {
    return this.http
      .post<{ data: MappingPresetDetail }>('/api/api-field-mappings', payload)
      .pipe(map(r => r.data));
  }

  updateMappingPreset(id: number, payload: {
    name: string;
    target_table?: string;
    upsert_key?: string;
    project_id_mode?: 'from_snapshot' | 'from_field' | 'none';
    project_id_field?: string | null;
    is_default?: boolean;
    columns: MappingColumn[];
  }): Observable<MappingPresetDetail> {
    return this.http
      .put<{ data: MappingPresetDetail }>(`/api/api-field-mappings/${id}`, payload)
      .pipe(map(r => r.data));
  }

  deleteMappingPreset(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/api-field-mappings/${id}`);
  }

  exportMappingPreset(id: number): Observable<Blob> {
    return this.http.get(`/api/api-field-mappings/${id}/export`, { responseType: 'blob' });
  }

  importMappingPreset(projectId: number, file: File): Observable<MappingPresetDetail> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('project_id', String(projectId));
    return this.http
      .post<{ data: MappingPresetDetail }>('/api/api-field-mappings/import', fd)
      .pipe(map(r => r.data));
  }

  getTargetFields(targetTable: string = 'project_units'): Observable<TargetField[]> {
    const params = new HttpParams().set('target_table', targetTable);
    return this.http
      .get<{ data: TargetField[] }>('/api/api-field-mappings/target-fields', { params })
      .pipe(map(r => r.data));
  }

  getSyncTargetTables(): Observable<SyncTargetTable[]> {
    return this.http
      .get<{ data: SyncTargetTable[] }>('/api/sync-target-tables')
      .pipe(map(r => r.data));
  }

  createSyncTargetTable(payload: { table_name: string; label: string; default_upsert_key: string; is_active?: boolean }): Observable<SyncTargetTable> {
    return this.http
      .post<{ data: SyncTargetTable }>('/api/sync-target-tables', payload)
      .pipe(map(r => r.data));
  }

  updateSyncTargetTable(id: number, payload: { label?: string; default_upsert_key?: string; is_active?: boolean }): Observable<SyncTargetTable> {
    return this.http
      .put<{ data: SyncTargetTable }>(`/api/sync-target-tables/${id}`, payload)
      .pipe(map(r => r.data));
  }

  deleteSyncTargetTable(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/sync-target-tables/${id}`);
  }

  getTargetTableColumns(id: number): Observable<TargetTableColumn[]> {
    return this.http
      .get<{ data: TargetTableColumn[] }>(`/api/sync-target-tables/${id}/columns`)
      .pipe(map(r => r.data));
  }

  getSourceFields(snapshotId: number): Observable<SourceField[]> {
    const params = new HttpParams().set('snapshot_id', snapshotId);
    return this.http
      .get<{ data: SourceField[] }>('/api/api-field-mappings/source-fields', { params })
      .pipe(map(r => r.data));
  }

  // ── Sync Snapshot → project_units ─────────────────────────────────────────

  syncSnapshot(snapshotId: number, presetId: number): Observable<SyncResult> {
    return this.http
      .post<{ data: SyncResult }>(`/api/sync-from-api/${snapshotId}/sync`, { preset_id: presetId })
      .pipe(map(r => r.data));
  }

  // ── Sync House Models ────────────────────────────────────────────────────

  syncHouseModels(snapshotId: number, presetId: number): Observable<SyncHouseModelsResult> {
    return this.http
      .post<{ data: SyncHouseModelsResult }>(`/api/sync-from-api/${snapshotId}/sync-house-models`, {
        preset_id: presetId,
      })
      .pipe(map(r => r.data));
  }

  // ── Test API (debug) ─────────────────────────────────────────────────────

  testApi(payload: { config_id?: number; url?: string }): Observable<TestApiResult> {
    return this.http
      .post<{ data: TestApiResult }>('/api/sync-from-api/test', payload)
      .pipe(map(r => r.data));
  }
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface SyncHouseModelsResult {
  models_created: number;
  models_existing: number;
  units_linked: number;
}

export interface TestApiResult {
  token_status: 'ok' | 'missing';
  message: string;
  api_url: string;
  config_name: string | null;
  http_code: number | null;
  curl_error: string | null;
  response_size: number;
  response: string | null;
  row_count: number;
  columns: string[];
  preview_rows: Record<string, unknown>[];
}
