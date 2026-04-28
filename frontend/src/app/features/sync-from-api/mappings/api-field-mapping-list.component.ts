import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SyncFromApiService, MappingPreset } from '../sync-from-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import {
  MappingPresetFormDialogComponent,
  MappingPresetFormDialogData,
} from './dialogs/mapping-preset-form-dialog.component';

@Component({
  selector: 'app-api-field-mapping-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    SvgIconComponent,
    SectionCardComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">

      <!-- หัวหน้า -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="page-title m-0">จับคู่ Field</h1>
          <p class="text-caption mt-1" style="color: var(--color-gray-500)">
            จัดการ Preset สำหรับจับคู่ข้อมูลจาก API snapshot กับ project_units
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button mat-stroked-button (click)="fileInput.click()" class="flex items-center gap-2">
            <app-icon name="arrow-up-tray" class="w-4 h-4" />
            Import
          </button>
          <input #fileInput type="file" accept=".json" hidden (change)="onImportFile($event)" />
          <button mat-flat-button color="primary" (click)="openCreate()" class="flex items-center gap-2">
            <app-icon name="plus" class="w-4 h-4" />
            สร้าง Preset ใหม่
          </button>
        </div>
      </div>

      <!-- ตาราง -->
      <app-section-card [noPadding]="true">

        @if (loading()) {
          <div class="flex justify-center items-center py-16">
            <mat-spinner diameter="40" />
          </div>
        } @else {

          <table mat-table [dataSource]="presets()" class="w-full">

            <!-- ชื่อ Preset -->
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                ชื่อ Preset
              </th>
              <td mat-cell *matCellDef="let p" class="!text-sm !text-slate-800 !font-medium">
                {{ p.name }}
              </td>
            </ng-container>

            <!-- Target Table -->
            <ng-container matColumnDef="target_table">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                Target Table
              </th>
              <td mat-cell *matCellDef="let p" class="!text-sm !text-slate-600 !font-mono">
                {{ p.target_table }}
              </td>
            </ng-container>

            <!-- Project ID Mode -->
            <ng-container matColumnDef="project_id_mode">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                Project ID Mode
              </th>
              <td mat-cell *matCellDef="let p">
                @switch (p.project_id_mode) {
                  @case ('from_snapshot') {
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      snapshot
                    </span>
                  }
                  @case ('from_field') {
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"
                          [matTooltip]="p.project_id_field ?? ''">
                      field
                    </span>
                  }
                  @case ('none') {
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                      none
                    </span>
                  }
                  @default {
                    <span class="text-slate-400 text-xs">—</span>
                  }
                }
              </td>
            </ng-container>

            <!-- จำนวน Fields -->
            <ng-container matColumnDef="columns_count">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                จำนวน Fields
              </th>
              <td mat-cell *matCellDef="let p" class="!text-sm !text-slate-600">
                {{ p.columns_count }} field{{ p.columns_count !== 1 ? 's' : '' }}
              </td>
            </ng-container>

            <!-- Default -->
            <ng-container matColumnDef="is_default">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-center">
                Default
              </th>
              <td mat-cell *matCellDef="let p" class="!text-center">
                @if (!!Number(p.is_default)) {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    <app-icon name="check" class="w-3 h-3" />
                    Default
                  </span>
                }
              </td>
            </ng-container>

            <!-- วันที่สร้าง -->
            <ng-container matColumnDef="created_at">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50">
                วันที่สร้าง
              </th>
              <td mat-cell *matCellDef="let p" class="!text-sm !text-slate-500">
                {{ p.created_at | date:'dd/MM/yyyy HH:mm' }}
              </td>
            </ng-container>

            <!-- Actions -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef
                  class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !text-center">
                จัดการ
              </th>
              <td mat-cell *matCellDef="let p" class="!text-center">
                <div class="flex justify-center gap-1">
                  <button mat-icon-button matTooltip="Export"
                          class="!text-slate-500 hover:!text-green-600"
                          (click)="doExport(p)">
                    <app-icon name="arrow-down-tray" class="w-4 h-4" />
                  </button>
                  <button mat-icon-button matTooltip="แก้ไข"
                          class="!text-slate-500 hover:!text-blue-600"
                          (click)="openEdit(p)">
                    <app-icon name="pencil-square" class="w-4 h-4" />
                  </button>
                  <button mat-icon-button matTooltip="ลบ"
                          class="!text-slate-500 hover:!text-red-600"
                          (click)="confirmDelete(p)">
                    <app-icon name="trash" class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns; sticky: true"></tr>
            <tr mat-row *matRowDef="let row; columns: columns;"
                class="hover:bg-primary-100 transition-colors even:bg-slate-50/40"></tr>

            <!-- ไม่มีข้อมูล -->
            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell text-center py-12 text-slate-400" [attr.colspan]="columns.length">
                <app-icon name="inbox" class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p>ยังไม่มี Mapping Preset</p>
              </td>
            </tr>

          </table>

        }
      </app-section-card>
    </div>
  `,
})
export class ApiFieldMappingListComponent implements OnInit {
  private api     = inject(SyncFromApiService);
  private project = inject(ProjectService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);

  readonly Number = Number;

  loading  = signal(false);
  presets  = signal<MappingPreset[]>([]);
  columns  = ['name', 'target_table', 'project_id_mode', 'columns_count', 'is_default', 'created_at', 'actions'];

  readonly projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  ngOnInit(): void {
    this.loadPresets();
  }

  loadPresets(): void {
    if (!this.projectId()) return;
    this.loading.set(true);
    this.api.getMappingPresets(this.projectId()).subscribe({
      next: data => { this.presets.set(data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  openCreate(): void {
    this.dialog.open(MappingPresetFormDialogComponent, {
      width: '90vw',
      maxWidth: '90vw',
      maxHeight: '90vh',
      disableClose: true,
      data: { mode: 'create', projectId: this.projectId() } satisfies MappingPresetFormDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadPresets(); });
  }

  openEdit(preset: MappingPreset): void {
    this.dialog.open(MappingPresetFormDialogComponent, {
      width: '90vw',
      maxWidth: '90vw',
      maxHeight: '90vh',
      disableClose: true,
      data: { mode: 'edit', projectId: this.projectId(), preset } satisfies MappingPresetFormDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadPresets(); });
  }

  doExport(preset: MappingPreset): void {
    this.api.exportMappingPreset(preset.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mapping-${preset.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.snack.open('Export สำเร็จ', 'ปิด', { duration: 2000 });
      },
      error: () => this.snack.open('Export ไม่สำเร็จ', 'ปิด', { duration: 3000 }),
    });
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.api.importMappingPreset(this.projectId(), file).subscribe({
      next: () => {
        this.snack.open('Import สำเร็จ', 'ปิด', { duration: 3000 });
        this.loadPresets();
      },
      error: err => this.snack.open(err.error?.error ?? 'Import ไม่สำเร็จ', 'ปิด', { duration: 4000 }),
    });

    // Reset input เพื่อให้เลือกไฟล์เดิมซ้ำได้
    input.value = '';
  }

  confirmDelete(preset: MappingPreset): void {
    if (!confirm(`ยืนยันลบ Mapping Preset "${preset.name}"?`)) return;
    this.api.deleteMappingPreset(preset.id).subscribe({
      next: () => {
        this.snack.open('ลบสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadPresets();
      },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 3000 }),
    });
  }
}
