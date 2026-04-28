import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Project {
  id: number;
  code: string;
  name: string;
  project_type: 'condo' | 'house' | 'townhouse' | 'mixed';
  status: 'active' | 'inactive' | 'completed';
  location?: string;
  approval_required: boolean | number;
  allow_over_budget: boolean | number;
  pool_budget_amount: number;
  unit_count?: number;
}

export interface ProjectCreatePayload {
  code: string;
  name: string;
  project_type: string;
  location?: string;
  approval_required?: boolean;
  allow_over_budget?: boolean;
  pool_budget_amount?: number;
}

export interface ProjectUpdatePayload {
  name?: string;
  project_type?: string;
  status?: string;
  location?: string;
  approval_required?: boolean;
  allow_over_budget?: boolean;
  pool_budget_amount?: number;
}

@Injectable({ providedIn: 'root' })
export class ProjectApiService {
  private http = inject(HttpClient);

  getProjects(filters?: { search?: string; status?: string; project_type?: string }): Observable<Project[]> {
    let params = new HttpParams();
    if (filters?.search)       params = params.set('search',       filters.search);
    if (filters?.status)       params = params.set('status',       filters.status);
    if (filters?.project_type) params = params.set('project_type', filters.project_type);

    return this.http
      .get<{ data: Project[] }>('/api/projects', { params })
      .pipe(map(r => r.data));
  }

  createProject(payload: ProjectCreatePayload): Observable<Project> {
    return this.http
      .post<{ message: string; data: Project }>('/api/projects', payload)
      .pipe(map(r => r.data));
  }

  updateProject(id: number, payload: ProjectUpdatePayload): Observable<Project> {
    return this.http
      .put<{ message: string; data: Project }>(`/api/projects/${id}`, payload)
      .pipe(map(r => r.data));
  }

  deleteProject(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/projects/${id}`);
  }
}
