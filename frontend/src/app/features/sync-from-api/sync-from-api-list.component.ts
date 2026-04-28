import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  SyncFromApiService,
  ExternalApiConfig,
  SyncFromApiSnapshot,
} from './sync-from-api.service';
import { ProjectService } from '../../core/services/project.service';
import { AuthService } from '../../core/services/auth.service';
import { SvgIconComponent } from '../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../shared/components/section-card/section-card.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { RenameSnapshotDialogComponent, RenameSnapshotDialogData } from './dialogs/rename-snapshot-dialog.component';

@Component({
  selector: 'app-sync-from-api-list',
  standalone: true,
  imports: [
    CommonModule, DecimalPipe, ReactiveFormsModule, ThaiDatePipe, RouterLink,
    MatTableModule, MatButtonModule,
    MatFormFieldModule, MatSelectModule,
    MatDialogModule, MatSnackBarModule, MatTooltipModule, MatProgressSpinnerModule,
    SvgIconComponent, PageHeaderComponent, SectionCardComponent,
  ],
  templateUrl: './sync-from-api-list.component.html',
})
export class SyncFromApiListComponent implements OnInit {
  private api     = inject(SyncFromApiService);
  private project = inject(ProjectService);
  private auth    = inject(AuthService);
  private router  = inject(Router);
  private snack   = inject(MatSnackBar);
  private dialog  = inject(MatDialog);
  private fb      = inject(FormBuilder);

  projectId  = computed(() => Number(this.project.selectedProject()?.id ?? 0));
  canWrite   = computed(() => ['admin', 'manager'].includes(this.auth.currentUser()?.role ?? ''));

  // ── Active configs สำหรับ dropdown ────────────────────────────────────────
  configs        = signal<ExternalApiConfig[]>([]);
  activeConfigs  = computed(() => this.configs().filter(c => !!Number(c.is_active)));

  // ── Snapshot list ─────────────────────────────────────────────────────────
  dataSource = new MatTableDataSource<SyncFromApiSnapshot>([]);
  loading    = signal(false);
  fetching   = signal(false);

  displayedColumns = ['code', 'config_name', 'api_url', 'total_rows', 'status', 'created_at', 'fetched_by_name', 'actions'];

  filterForm = this.fb.group({
    config_id: [null as number | null],
  });

  ngOnInit(): void {
    this.loadConfigs();
    this.loadSnapshots();
  }

  loadConfigs(): void {
    if (!this.projectId()) return;
    this.api.getConfigs(this.projectId()).subscribe({
      next: data => this.configs.set(data),
    });
  }

  loadSnapshots(): void {
    if (!this.projectId()) return;
    this.loading.set(true);
    this.api.getSnapshots(this.projectId()).subscribe({
      next: data => { this.dataSource.data = data; this.loading.set(false); },
      error: () => { this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 }); this.loading.set(false); },
    });
  }

  fetchData(): void {
    const configId = this.filterForm.value.config_id;
    if (!configId) {
      this.snack.open('กรุณาเลือก Config ก่อนดึงข้อมูล', 'ปิด', { duration: 3000 });
      return;
    }
    this.fetching.set(true);
    this.api.fetchSnapshot(configId).subscribe({
      next: result => {
        this.fetching.set(false);
        this.snack.open(`ดึงข้อมูลสำเร็จ — ${result.total_rows} รายการ`, 'ปิด', { duration: 4000 });
        this.loadSnapshots();
      },
      error: err => {
        this.fetching.set(false);
        this.snack.open(err.error?.error ?? 'ดึงข้อมูลไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  viewDetail(snapshot: SyncFromApiSnapshot): void {
    this.router.navigate(['/sync-from-api', snapshot.id]);
  }

  confirmDelete(snapshot: SyncFromApiSnapshot): void {
    if (!confirm(`ยืนยันการลบ Snapshot "${snapshot.code}"?\n\nข้อมูลที่ดึงมาจะถูกลบถาวร`)) return;
    this.api.deleteSnapshot(snapshot.id).subscribe({
      next: r => { this.snack.open(r.message ?? 'ลบเรียบร้อย', 'ปิด', { duration: 3000 }); this.loadSnapshots(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 4000 }),
    });
  }

  renameSnapshot(snapshot: SyncFromApiSnapshot): void {
    const ref = this.dialog.open(RenameSnapshotDialogComponent, {
      width: '400px',
      data: { snapshotId: snapshot.id, currentName: snapshot.name || snapshot.code } as RenameSnapshotDialogData,
    });
    ref.afterClosed().subscribe(newCode => {
      if (!newCode) return;
      this.api.updateSnapshot(snapshot.id, { name: newCode }).subscribe({
        next: () => {
          this.snack.open('แก้ไขชื่อสำเร็จ', 'ปิด', { duration: 3000 });
          this.loadSnapshots();
        },
        error: err => this.snack.open(err.error?.error ?? 'แก้ไขชื่อไม่สำเร็จ', 'ปิด', { duration: 4000 }),
      });
    });
  }

  statusLabel(status: string): string {
    const m: Record<string, string> = { completed: 'สำเร็จ', failed: 'ล้มเหลว' };
    return m[status] ?? status;
  }

  statusClass(status: string): string {
    return status === 'completed' ? 'bg-green-50 text-green-700'
         : status === 'failed'    ? 'bg-red-50 text-red-700'
         : 'bg-amber-50 text-amber-700';
  }
}
