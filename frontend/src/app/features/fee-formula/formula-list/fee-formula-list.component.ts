import { Component, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
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

import { FeeFormulaApiService, FeeFormula } from '../fee-formula-api.service';
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

  canWrite = computed(() => this.project.canEdit());
  projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

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
}
