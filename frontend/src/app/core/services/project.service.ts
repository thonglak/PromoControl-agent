import { Injectable, computed, signal } from '@angular/core';

export interface Project {
  id: number | string;
  code: string;
  name: string;
  project_type: string;
  status: string;
  access_level: 'view' | 'edit';
  allow_over_budget?: boolean | number;
  unit_count?: number;
}

const STORAGE_KEY = 'selected_project';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  /** โครงการที่ user เลือกอยู่ — restore จาก localStorage เมื่อ refresh */
  readonly selectedProject = signal<Project | null>(this.restoreFromStorage());

  readonly accessLevel = computed(() => this.selectedProject()?.access_level ?? null);
  readonly canEdit      = computed(() => this.accessLevel() === 'edit');

  selectProject(project: Project): void {
    this.selectedProject.set(project);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }

  clearProject(): void {
    this.selectedProject.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private restoreFromStorage(): Project | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Project) : null;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}
