import { Component, OnInit, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

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

interface ExternalApiConfigJson {
  name: string;
  api_url: string;
  is_active: boolean;
}

interface ExternalApiConfigExportFile {
  format: 'external-api-configs.v1';
  exported_at: string;
  source_project_id?: number;
  source_project_name?: string;
  count: number;
  items: ExternalApiConfigJson[];
}

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
  importing  = signal(false);
  dataSource = new MatTableDataSource<ExternalApiConfig>([]);

  projectId  = computed(() => Number(this.project.selectedProject()?.id ?? 0));
  canWrite   = computed(() => ['admin', 'manager'].includes(this.auth.currentUser()?.role ?? ''));

  displayedColumns = ['name', 'api_url', 'is_active', 'actions'];

  @ViewChild('importInput') importInput!: ElementRef<HTMLInputElement>;

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

  // ── Export / Import JSON ──────────────────────────────────────────────────

  /** ส่งออก API Config ทั้งหมดของโครงการเป็นไฟล์ JSON */
  exportJson(): void {
    const items = this.dataSource.data ?? [];
    if (items.length === 0) {
      this.snack.open('ไม่มี API Config ให้ส่งออก', 'ปิด', { duration: 3000 });
      return;
    }

    const project = this.project.selectedProject();
    const payload: ExternalApiConfigExportFile = {
      format:              'external-api-configs.v1',
      exported_at:         new Date().toISOString(),
      source_project_id:   project ? Number(project.id) : undefined,
      source_project_name: project?.name,
      count:               items.length,
      items: items.map(c => ({
        name:      c.name,
        api_url:   c.api_url,
        is_active: !!Number(c.is_active),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safe = (project?.name ?? 'project').replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_').slice(0, 60);
    a.href     = url;
    a.download = `api-configs_${safe}_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.snack.open(`ส่งออก ${items.length} รายการสำเร็จ`, 'ปิด', { duration: 3000 });
  }

  /** เปิดตัวเลือกไฟล์เพื่อนำเข้า JSON */
  triggerImport(): void {
    if (this.projectId() <= 0) {
      this.snack.open('กรุณาเลือกโครงการก่อน', 'ปิด', { duration: 3000 });
      return;
    }
    this.importInput.nativeElement.value = '';
    this.importInput.nativeElement.click();
  }

  /** อ่านไฟล์ที่เลือก แล้วยืนยันก่อนสร้าง config ทั้งหมด */
  onImportFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ''));
        const items  = this.normalizeImport(parsed);
        if (items.length === 0) {
          this.snack.open('ไฟล์ไม่มีรายการที่นำเข้าได้', 'ปิด', { duration: 3000 });
          return;
        }
        this.confirmAndImport(items);
      } catch (err) {
        this.snack.open('ไฟล์ JSON ไม่ถูกต้อง', 'ปิด', { duration: 3000 });
      }
    };
    reader.onerror = () => this.snack.open('อ่านไฟล์ไม่สำเร็จ', 'ปิด', { duration: 3000 });
    reader.readAsText(file);
  }

  /** ตรวจสอบรูปแบบไฟล์ — รองรับทั้ง wrapper format และ array ดิบ */
  private normalizeImport(parsed: unknown): ExternalApiConfigJson[] {
    const raw = Array.isArray(parsed)
      ? parsed
      : (parsed as ExternalApiConfigExportFile)?.items;
    if (!Array.isArray(raw)) return [];

    return raw
      .map((row): ExternalApiConfigJson | null => {
        const name    = String((row as any)?.name ?? '').trim();
        const apiUrl  = String((row as any)?.api_url ?? '').trim();
        if (!name || !apiUrl) return null;
        return {
          name,
          api_url:   apiUrl,
          is_active: !!(row as any)?.is_active,
        };
      })
      .filter((r): r is ExternalApiConfigJson => r !== null);
  }

  private confirmAndImport(items: ExternalApiConfigJson[]): void {
    const existingNames = new Set(this.dataSource.data.map(c => c.name));
    const dupCount = items.filter(it => existingNames.has(it.name)).length;

    const dupNote = dupCount > 0
      ? `\n\nหมายเหตุ: มี ${dupCount} รายการที่ชื่อซ้ำกับของเดิม จะถูกสร้างเป็นรายการใหม่`
      : '';

    if (!confirm(`ต้องการนำเข้า ${items.length} รายการเข้าโครงการนี้?${dupNote}`)) return;

    this.importing.set(true);
    const projectId = this.projectId();

    const calls = items.map(it =>
      this.api.createConfig({
        project_id: projectId,
        name:       it.name,
        api_url:    it.api_url,
        is_active:  it.is_active,
      }).pipe(
        map(()  => ({ ok: true,  name: it.name, error: '' })),
        catchError(err => of({
          ok:    false,
          name:  it.name,
          error: err?.error?.error ?? 'สร้างไม่สำเร็จ',
        })),
      ),
    );

    forkJoin(calls).subscribe(results => {
      this.importing.set(false);
      const success = results.filter(r => r.ok).length;
      const failed  = results.length - success;
      const msg = failed === 0
        ? `นำเข้าสำเร็จ ${success} รายการ`
        : `นำเข้าสำเร็จ ${success} รายการ ผิดพลาด ${failed} รายการ`;
      this.snack.open(msg, 'ปิด', { duration: 4000 });
      this.loadData();
    });
  }
}
