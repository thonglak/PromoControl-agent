import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { ThemeService } from '../../core/services/theme.service';
import { SvgIconComponent } from '../../shared/components/svg-icon/svg-icon.component';
import { ProjectFormDialogComponent } from '../master-data/projects/dialogs/project-form-dialog.component';

import { DecimalPipe } from "@angular/common";
import type { Project } from '../../core/services/project.service';

@Component({
  selector: 'app-project-selection-page',
  standalone: true,
  imports: [MatButtonModule, MatProgressSpinnerModule, MatDialogModule, SvgIconComponent, DecimalPipe],
  templateUrl: './project-selection-page.component.html',
})
export class ProjectSelectionPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  readonly theme = inject(ThemeService);

  readonly currentUser = this.auth.currentUser;
  readonly loading = signal(true);
  readonly projects = signal<Project[]>([]);
  readonly canCreateProject = computed(() => {
    const role = this.currentUser()?.role;
    return role === 'admin' || role === 'manager';
  });

  // ── Chip color maps (using CSS variable references) ──────────────────────

  private readonly typeChipMap: Record<string, { bg: string; color: string }> = {
    condo:     { bg: 'var(--color-info-subtle)',    color: 'var(--color-info)' },
    house:     { bg: 'var(--color-success-subtle)', color: 'var(--color-success)' },
    townhouse: { bg: 'var(--color-warning-subtle)', color: 'var(--color-warning)' },
    mixed:     { bg: 'var(--color-neutral-subtle)', color: 'var(--color-gray-500)' },
  };

  private readonly statusChipMap: Record<string, { bg: string; color: string }> = {
    active:    { bg: 'var(--color-success-subtle)', color: 'var(--color-success)' },
    inactive:  { bg: 'var(--color-neutral-subtle)', color: 'var(--color-gray-500)' },
    completed: { bg: 'var(--color-info-subtle)',    color: 'var(--color-info)' },
  };

  private readonly typeLabelMap: Record<string, string> = {
    condo: 'คอนโด', house: 'บ้านเดี่ยว', townhouse: 'ทาวน์เฮาส์', mixed: 'หลายประเภท',
  };

  private readonly statusLabelMap: Record<string, string> = {
    active: 'ดำเนินการ', inactive: 'ปิดใช้งาน', completed: 'เสร็จสิ้น',
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.initProjects(user.projects as unknown as Project[]);
    } else {
      this.auth.me().subscribe({
        next: (u) => this.initProjects(u.projects as unknown as Project[]),
        error: () => {
          this.loading.set(false);
          this.snackBar.open('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่', 'ปิด', { duration: 4000 });
        },
      });
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  selectProject(project: Project): void {
    this.projectService.selectProject(project);
    this.router.navigate(['/dashboard']);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {},
      error: () => this.auth.clearSession(),
    });
  }

  openCreateProject(): void {
    this.dialog
      .open(ProjectFormDialogComponent, {
        data: { mode: 'create' },
        width: '500px',
        maxHeight: '90vh',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.snackBar.open('สร้างโครงการสำเร็จ', 'ปิด', { duration: 3000 });
        this.refreshProjects();
      });
  }

  private refreshProjects(): void {
    this.loading.set(true);
    this.auth.me().subscribe({
      next: (u) => {
        this.projects.set((u.projects as unknown as Project[]) ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่', 'ปิด', { duration: 4000 });
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  typeChipBg(type: string): string { return this.typeChipMap[type]?.bg ?? 'var(--color-neutral-subtle)'; }
  typeChipColor(type: string): string { return this.typeChipMap[type]?.color ?? 'var(--color-gray-500)'; }
  typeLabel(type: string): string { return this.typeLabelMap[type] ?? type; }

  statusChipBg(status: string): string { return this.statusChipMap[status]?.bg ?? 'var(--color-neutral-subtle)'; }
  statusChipColor(status: string): string { return this.statusChipMap[status]?.color ?? 'var(--color-gray-500)'; }
  statusLabel(status: string): string { return this.statusLabelMap[status] ?? status; }

  // ── Private ───────────────────────────────────────────────────────────────

  private initProjects(projects: Project[]): void {
    this.projects.set(projects);
    this.loading.set(false);
    if (projects.length === 1) {
      this.selectProject(projects[0]);
    }
  }
}
