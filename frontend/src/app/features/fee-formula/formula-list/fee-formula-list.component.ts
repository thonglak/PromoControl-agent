import { Component, OnInit, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import {
  FeeFormulaApiService, FeeFormula,
  FeeFormulaJson, FeeFormulaExportFile,
} from '../fee-formula-api.service';
import { FeeFormulaFormDialogComponent } from './dialogs/fee-formula-form-dialog.component';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService, ColumnDef } from '../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../shared/components/table-settings/table-settings-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

const TABLE_ID = 'fee-formula-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'promotion_item', label: 'รายการ',           visible: true },
  { key: 'base_field',     label: 'ฐานคำนวณ',        visible: true },
  { key: 'default_rate',   label: 'อัตรา',            visible: true },
  { key: 'buyer_share',    label: 'สัดส่วนผู้ซื้อ',    visible: true },
  { key: 'policies',       label: 'Policy',           visible: true },
  { key: 'actions',        label: 'จัดการ',            visible: true, locked: true },
];

@Component({
  selector: 'app-fee-formula-list',
  standalone: true,
  imports: [
    PageHeaderComponent,
    CommonModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatButtonModule, MatTooltipModule, MatProgressSpinnerModule,
    MatDialogModule, MatSnackBarModule, SvgIconComponent,
  ],
  templateUrl: './fee-formula-list.component.html',
})
export class FeeFormulaListComponent implements OnInit {
  private api     = inject(FeeFormulaApiService);
  private project = inject(ProjectService);
  private router  = inject(Router);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);
  private tblCfg  = inject(TableConfigService);

  // ── Sort / Paginator ──
  sortRef!: MatSort;
  @ViewChild(MatSort) set matSort(s: MatSort) {
    if (s) {
      this.sortRef = s;
      this.dataSource.sort = s;
      const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
      if (saved?.sortActive && saved?.sortDirection) {
        // Defer to avoid ExpressionChangedAfterItHasBeenCheckedError on aria-sort
        setTimeout(() => { s.active = saved.sortActive; s.direction = saved.sortDirection; });
      }
    }
  }
  @ViewChild(MatPaginator) set matPaginator(p: MatPaginator) { if (p) { this.dataSource.paginator = p; } }

  // ── Table config ──
  columnDefs       = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  dataSource = new MatTableDataSource<FeeFormula>([]);
  loading    = signal(false);
  exporting  = signal(false);
  importing  = signal(false);

  canWrite = computed(() => this.project.canEdit());
  projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  @ViewChild('importInput') importInput!: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.api.getFormulas(this.projectId()).subscribe({
      next: items => { this.dataSource.data = items; this.loading.set(false); },
      error: () => { this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 }); this.loading.set(false); },
    });
  }

  onSortChange(sort: Sort): void {
    this.tblCfg.saveFilters(TABLE_ID, { sortActive: sort.active, sortDirection: sort.direction });
  }

  openTableSettings(): void {
    this.dialog.open(TableSettingsDialogComponent, {
      width: '400px', maxHeight: '90vh',
      data: { columns: this.columnDefs(), tableId: TABLE_ID },
    }).afterClosed().subscribe(result => {
      if (!result) return;
      if (result === 'reset') { this.tblCfg.resetConfig(TABLE_ID); this.columnDefs.set([...DEFAULT_COLUMNS]); }
      else { this.columnDefs.set(result); this.tblCfg.saveConfig(TABLE_ID, result); }
    });
  }

  openCreate(): void {
    this.dialog.open(FeeFormulaFormDialogComponent, {
      width: '600px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'create' },
    }).afterClosed().subscribe(r => { if (r) { this.snack.open('สร้างสูตรสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); } });
  }

  openEdit(item: FeeFormula): void {
    this.dialog.open(FeeFormulaFormDialogComponent, {
      width: '600px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'edit', formula: item },
    }).afterClosed().subscribe(r => { if (r) { this.snack.open('อัปเดตสูตรสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); } });
  }

  confirmDelete(item: FeeFormula): void {
    if (!confirm(`ยืนยันลบสูตร "${item.promotion_item_name}"?`)) return;
    this.api.deleteFormula(item.id).subscribe({
      next: () => { this.snack.open('ลบสูตรสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 5000 }),
    });
  }

  viewPolicies(item: FeeFormula): void {
    this.router.navigate(['/fee-formulas', item.id, 'policies']);
  }

  // ── Helpers ──
  baseFieldLabel(bf: string): string {
    switch (bf) {
      case 'appraisal_price': return 'ราคาประเมิน';
      case 'base_price':      return 'ราคาขาย';
      case 'net_price':       return 'ราคาสุทธิ';
      case 'manual_input':    return 'กำหนดเอง';
      case 'expression':      return 'นิพจน์';
      default:                return bf;
    }
  }

  baseFieldClass(bf: string): string {
    switch (bf) {
      case 'appraisal_price': return 'bg-blue-50 text-blue-700';
      case 'base_price':      return 'bg-green-50 text-green-700';
      case 'net_price':       return 'bg-amber-50 text-amber-700';
      case 'manual_input':    return 'bg-purple-50 text-purple-700';
      case 'expression':      return 'bg-indigo-50 text-indigo-700';
      default:                return 'bg-slate-100 text-slate-600';
    }
  }

  formatRate(decimal: number): string {
    return (decimal * 100).toFixed(2) + '%';
  }

  formatShare(decimal: number): string {
    return Math.round(decimal * 100) + '%';
  }

  // ── Export / Import JSON ───────────────────────────────────────────────

  /** ส่งออกสูตรทั้งโครงการเป็นไฟล์ JSON (รวม policies) */
  exportJson(): void {
    const pid = this.projectId();
    if (pid <= 0) {
      this.snack.open('กรุณาเลือกโครงการก่อน', 'ปิด', { duration: 3000 });
      return;
    }
    this.exporting.set(true);
    this.api.exportJson(pid).subscribe({
      next: res => {
        this.exporting.set(false);
        if (!res.items || res.items.length === 0) {
          this.snack.open('ไม่มีสูตรให้ส่งออก', 'ปิด', { duration: 3000 });
          return;
        }
        const project = this.project.selectedProject();
        const payload: FeeFormulaExportFile = {
          format:              'fee-formulas.v1',
          exported_at:         new Date().toISOString(),
          source_project_id:   project ? Number(project.id) : undefined,
          source_project_name: project?.name,
          count:               res.items.length,
          items:               res.items,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const safe = (project?.name ?? 'project').replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_').slice(0, 60);
        a.href     = url;
        a.download = `fee-formulas_${safe}_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.snack.open(`ส่งออก ${res.items.length} สูตรสำเร็จ`, 'ปิด', { duration: 3000 });
      },
      error: err => {
        this.exporting.set(false);
        this.snack.open(err?.error?.error ?? 'ส่งออกไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
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
      } catch {
        this.snack.open('ไฟล์ JSON ไม่ถูกต้อง', 'ปิด', { duration: 3000 });
      }
    };
    reader.onerror = () => this.snack.open('อ่านไฟล์ไม่สำเร็จ', 'ปิด', { duration: 3000 });
    reader.readAsText(file);
  }

  /** รองรับทั้ง wrapper format (`{format, items}`) และ array ดิบ */
  private normalizeImport(parsed: unknown): FeeFormulaJson[] {
    const raw = Array.isArray(parsed)
      ? parsed
      : (parsed as FeeFormulaExportFile)?.items;
    if (!Array.isArray(raw)) return [];

    return raw
      .map((row): FeeFormulaJson | null => {
        const code = String((row as any)?.promotion_item_code ?? '').trim();
        const baseField = String((row as any)?.base_field ?? '');
        if (!code || !baseField) return null;
        const policies = Array.isArray((row as any)?.policies) ? (row as any).policies : [];
        return {
          promotion_item_code: code,
          promotion_item_name: (row as any)?.promotion_item_name,
          base_field:          baseField as FeeFormulaJson['base_field'],
          manual_input_label:  (row as any)?.manual_input_label ?? null,
          formula_expression:  (row as any)?.formula_expression ?? null,
          default_rate:        Number((row as any)?.default_rate ?? 0),
          buyer_share:         Number((row as any)?.buyer_share ?? 1),
          description:         (row as any)?.description ?? null,
          policies,
        };
      })
      .filter((r): r is FeeFormulaJson => r !== null);
  }

  private confirmAndImport(items: FeeFormulaJson[]): void {
    const polTotal = items.reduce((sum, it) => sum + (it.policies?.length ?? 0), 0);
    if (!confirm(`ต้องการนำเข้า ${items.length} สูตร (พร้อม ${polTotal} policies) เข้าโครงการนี้?\n\nหมายเหตุ: รายการที่ซ้ำกับสูตรเดิมจะถูกข้าม`)) return;

    this.importing.set(true);
    this.api.importJson({ project_id: this.projectId(), items }).subscribe({
      next: res => {
        this.importing.set(false);
        const skipped = res.skipped?.length ?? 0;
        const errors  = res.errors?.length ?? 0;
        const parts   = [`สร้างสูตร ${res.created} รายการ`, `policies ${res.created_policies} รายการ`];
        if (skipped > 0) parts.push(`ข้าม ${skipped}`);
        if (errors > 0)  parts.push(`ผิดพลาด ${errors}`);
        this.snack.open(parts.join(' · '), 'ปิด', { duration: 6000 });
        this.loadData();
      },
      error: err => {
        this.importing.set(false);
        this.snack.open(err?.error?.error ?? 'นำเข้าไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }
}
