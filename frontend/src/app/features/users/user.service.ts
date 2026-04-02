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
}
