import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type UserRole = 'admin' | 'manager' | 'sales' | 'finance' | 'viewer';

export interface UserProject {
  id: number;
  code: string;
  name: string;
  access_level: 'view' | 'edit';
}

export interface UserListItem {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  projects: UserProject[];
}

export interface AllProject {
  id: number;
  code: string;
  name: string;
  project_type: string;
  status: string;
}

export interface ProjectAssignment {
  project_id: number;
  access_level: 'view' | 'edit';
}

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string;
}

export interface UpdateUserDto {
  name: string;
  role: UserRole;
  phone?: string | null;
  is_active: boolean;
}

/** ผู้ใช้จาก por_users (back_db) — สำหรับ browse + bulk import */
export interface PorUser {
  use_id: string;
  use_username: string;
  name: string;
  nickname: string | null;
  email: string | null;
  mobile: string | null;
  department: string | null;
  position: string | null;
  company: string | null;
  avatar: string | null;
  code: string | null;
  already_added: boolean;
}

export interface BrowseSourceQuery {
  q?: string;
  page?: number;
  per_page?: number;
}

export interface BrowseSourceResponse {
  data: PorUser[];
  meta: { total: number; page: number; per_page: number; last_page: number };
}

export interface BulkImportDto {
  default_role: UserRole;
  use_ids: string[];
}

export interface BulkImportResult {
  created: number;
  skipped: { use_id: string; reason: string }[];
  errors:  { use_id: string; reason: string }[];
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);

  /** GET /api/users → backend returns { data: UserListItem[] } */
  getUsers(): Observable<UserListItem[]> {
    return this.http.get<{ data: UserListItem[] }>('/api/users')
      .pipe(map(r => r.data));
  }

  /** POST /api/users → backend returns { message, data: UserListItem } */
  createUser(data: CreateUserDto): Observable<UserListItem> {
    return this.http.post<{ message: string; data: UserListItem }>('/api/users', data)
      .pipe(map(r => r.data));
  }

  /** PUT /api/users/{id} → backend returns { message, data: UserListItem } */
  updateUser(id: number, data: UpdateUserDto): Observable<UserListItem> {
    return this.http.put<{ message: string; data: UserListItem }>(`/api/users/${id}`, data)
      .pipe(map(r => r.data));
  }

  /** DELETE /api/users/{id} → backend returns { message } */
  deleteUser(id: number): Observable<unknown> {
    return this.http.delete(`/api/users/${id}`);
  }

  /** PUT /api/users/{id}/projects → backend returns { message, data } */
  assignProjects(id: number, projects: ProjectAssignment[]): Observable<unknown> {
    return this.http.put(`/api/users/${id}/projects`, { projects });
  }

  /** PUT /api/users/{id}/reset-password → backend returns { message } */
  resetPassword(id: number, new_password: string): Observable<unknown> {
    return this.http.put(`/api/users/${id}/reset-password`, { new_password });
  }

  /** GET /api/projects — สำหรับ assign dialog */
  getAllProjects(): Observable<AllProject[]> {
    return this.http.get<AllProject[] | { data: AllProject[] }>('/api/projects').pipe(
      map(r => Array.isArray(r) ? r : (r as { data: AllProject[] }).data)
    );
  }

  /** GET /api/users/browse-source — ค้นรายชื่อจาก back.por_users */
  browseSource(q: BrowseSourceQuery = {}): Observable<BrowseSourceResponse> {
    const params: Record<string, string> = {};
    if (q.q !== undefined && q.q !== '') params['q']        = q.q;
    if (q.page !== undefined)              params['page']     = String(q.page);
    if (q.per_page !== undefined)          params['per_page'] = String(q.per_page);
    return this.http.get<BrowseSourceResponse>('/api/users/browse-source', { params });
  }

  /** POST /api/users/bulk-import — เพิ่มผู้ใช้ทีละหลายคนจาก por_users */
  bulkImportFromPortal(dto: BulkImportDto): Observable<BulkImportResult> {
    return this.http
      .post<{ message: string; data: BulkImportResult }>('/api/users/bulk-import', dto)
      .pipe(map(r => r.data));
  }
}
