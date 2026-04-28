import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PhaseApiService, Phase } from '../phase-api.service';
import { PhaseFormDialogComponent, PhaseFormDialogData } from '../dialogs/phase-form-dialog.component';
import { ProjectService } from '../../../../core/services/project.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../../shared/components/section-card/section-card.component';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-phase-list',
  standalone: true,
  imports: [
    CommonModule, MatTableModule, MatButtonModule, MatTooltipModule, MatProgressSpinnerModule,
    PageHeaderComponent, SectionCardComponent, SvgIconComponent, EmptyStateComponent,
  ],
  templateUrl: './phase-list.component.html',
})
export class PhaseListComponent implements OnInit {
  private api     = inject(PhaseApiService);
  private project = inject(ProjectService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);

  phases  = signal<Phase[]>([]);
  loading = signal(false);

  displayedColumns = ['sort_order', 'name', 'unit_count', 'actions'];

  get projectId(): number {
    return Number(this.project.selectedProject()?.id ?? 0);
  }

  get canEdit(): boolean {
    return this.project.canEdit();
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getAll(this.projectId).subscribe({
      next: data => { this.phases.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.dialog.open(PhaseFormDialogComponent, {
      data: { mode: 'create', projectId: this.projectId } as PhaseFormDialogData,
      width: '480px',
      disableClose: true,
    }).afterClosed().subscribe(result => {
      if (result) { this.snack.open('สร้าง Phase สำเร็จ', 'ปิด', { duration: 3000 }); this.load(); }
    });
  }

  openEdit(phase: Phase): void {
    this.dialog.open(PhaseFormDialogComponent, {
      data: { mode: 'edit', projectId: this.projectId, phase } as PhaseFormDialogData,
      width: '480px',
      disableClose: true,
    }).afterClosed().subscribe(result => {
      if (result) { this.snack.open('อัปเดต Phase สำเร็จ', 'ปิด', { duration: 3000 }); this.load(); }
    });
  }

  confirmDelete(phase: Phase): void {
    if (!confirm(`ยืนยันลบ "${phase.name}"?`)) return;
    this.api.delete(phase.id).subscribe({
      next: () => { this.snack.open('ลบ Phase สำเร็จ', 'ปิด', { duration: 2000 }); this.load(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 4000 }),
    });
  }
}
