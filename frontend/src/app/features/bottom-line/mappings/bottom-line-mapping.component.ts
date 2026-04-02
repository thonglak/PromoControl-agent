import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BottomLineApiService, MappingPreset } from '../bottom-line-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { MappingFormDialogComponent, MappingFormDialogData } from './dialogs/mapping-form-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';

@Component({
  selector: 'app-bottom-line-mapping',
  standalone: true,
  imports: [
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, MatTableModule, MatButtonModule, MatSlideToggleModule,
    MatDialogModule, MatSnackBarModule, MatProgressSpinnerModule,
    MatTooltipModule, SvgIconComponent,
  ],
  templateUrl: './bottom-line-mapping.component.html',
})
export class BottomLineMappingComponent implements OnInit {
  private api     = inject(BottomLineApiService);
  private project = inject(ProjectService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);

  loading  = signal(false);
  presets  = signal<MappingPreset[]>([]);
  columns  = ['preset_name', 'config_summary', 'is_default', 'created_by_name', 'actions'];
  projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  ngOnInit(): void { this.loadPresets(); }

  loadPresets(): void {
    if (!this.projectId()) return;
    this.loading.set(true);
    this.api.getMappings(this.projectId()).subscribe({
      next: d => { this.presets.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  configSummary(p: MappingPreset): string {
    const c = p.mapping_config;
    if (!c) return '—';
    return `Unit=${c.unit_code_column || '?'}, BL=${c.bottom_line_price_column || '?'}, App=${c.appraisal_price_column || '?'}`;
  }

  openCreate(): void {
    this.dialog.open(MappingFormDialogComponent, {
      width: '520px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'create', projectId: this.projectId() } satisfies MappingFormDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadPresets(); });
  }

  openEdit(preset: MappingPreset): void {
    this.dialog.open(MappingFormDialogComponent, {
      width: '520px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'edit', projectId: this.projectId(), preset } satisfies MappingFormDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadPresets(); });
  }

  toggleDefault(preset: MappingPreset): void {
    const newDefault = !preset.is_default;
    this.api.updateMapping(preset.id, {
      project_id: this.projectId(),
      preset_name: preset.preset_name,
      mapping_config: preset.mapping_config,
      is_default: newDefault,
    }).subscribe({
      next: () => { this.loadPresets(); },
      error: err => this.snack.open(err.error?.error ?? 'เกิดข้อผิดพลาด', 'ปิด', { duration: 3000 }),
    });
  }

  confirmDelete(preset: MappingPreset): void {
    if (!confirm('ยืนยันลบ Mapping Preset "' + preset.preset_name + '"?')) return;
    this.api.deleteMapping(preset.id).subscribe({
      next: () => { this.snack.open('ลบสำเร็จ', 'ปิด', { duration: 3000 }); this.loadPresets(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 3000 }),
    });
  }
}
