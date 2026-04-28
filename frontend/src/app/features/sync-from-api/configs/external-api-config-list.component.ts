import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { SyncFromApiService, ExternalApiConfig } from '../sync-from-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import {
  ExternalApiConfigFormDialogComponent,
  ExternalApiConfigFormDialogData,
} from './dialogs/external-api-config-form-dialog.component';

@Component({
  selector: 'app-external-api-config-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule, MatButtonModule, MatDialogModule,
    MatSnackBarModule, MatTooltipModule, MatProgressSpinnerModule,
    MatSlideToggleModule,
    SvgIconComponent, PageHeaderComponent, SectionCardComponent,
  ],
  templateUrl: './external-api-config-list.component.html',
})
export class ExternalApiConfigListComponent implements OnInit {
  private api     = inject(SyncFromApiService);
  private project = inject(ProjectService);
  private auth    = inject(AuthService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);

  loading    = signal(false);
  dataSource = new MatTableDataSource<ExternalApiConfig>([]);

  projectId  = computed(() => Number(this.project.selectedProject()?.id ?? 0));
  canWrite   = computed(() => ['admin', 'manager'].includes(this.auth.currentUser()?.role ?? ''));

  displayedColumns = ['name', 'api_url', 'is_active', 'actions'];

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    if (!this.projectId()) return;
    this.loading.set(true);
    this.api.getConfigs(this.projectId()).subscribe({
      next: data => { this.dataSource.data = data; this.loading.set(false); },
      error: () => { this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 }); this.loading.set(false); },
    });
  }

  openCreate(): void {
    const dialogData: ExternalApiConfigFormDialogData = {
      mode:      'create',
      projectId: this.projectId(),
    };
    this.dialog
      .open(ExternalApiConfigFormDialogComponent, { width: '480px', data: dialogData })
      .afterClosed()
      .subscribe(result => { if (result) { this.snack.open('เพิ่ม Config เรียบร้อย', 'ปิด', { duration: 3000 }); this.loadData(); } });
  }

  openEdit(config: ExternalApiConfig): void {
    const dialogData: ExternalApiConfigFormDialogData = {
      mode:      'edit',
      projectId: this.projectId(),
      config,
    };
    this.dialog
      .open(ExternalApiConfigFormDialogComponent, { width: '480px', data: dialogData })
      .afterClosed()
      .subscribe(result => { if (result) { this.snack.open('บันทึกเรียบร้อย', 'ปิด', { duration: 3000 }); this.loadData(); } });
  }

  confirmDelete(config: ExternalApiConfig): void {
    if (!confirm(`ยืนยันการลบ "${config.name}"?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    this.api.deleteConfig(config.id).subscribe({
      next: r => { this.snack.open(r.message ?? 'ลบเรียบร้อย', 'ปิด', { duration: 3000 }); this.loadData(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 4000 }),
    });
  }

  activeLabel(config: ExternalApiConfig): string {
    return !!Number(config.is_active) ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
  }

  isActive(config: ExternalApiConfig): boolean {
    return !!Number(config.is_active);
  }
}
