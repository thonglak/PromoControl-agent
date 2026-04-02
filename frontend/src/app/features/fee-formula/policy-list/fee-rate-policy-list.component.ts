import { Component, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { FeeFormulaApiService, FeeFormula, FeeRatePolicy } from '../fee-formula-api.service';
import { FeeRatePolicyFormDialogComponent } from './dialogs/fee-rate-policy-form-dialog.component';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService, ColumnDef } from '../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../shared/components/table-settings/table-settings-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';

const TABLE_ID = 'fee-policy-list';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'policy_name',          label: 'ชื่อมาตรการ',        visible: true },
  { key: 'override_rate',        label: 'อัตรา override',     visible: true },
  { key: 'override_buyer_share', label: 'สัดส่วนผู้ซื้อ',      visible: true },
  { key: 'conditions',           label: 'เงื่อนไข',           visible: true },
  { key: 'effective_dates',      label: 'ช่วงเวลา',           visible: true },
  { key: 'priority',             label: 'ลำดับ',              visible: true },
  { key: 'is_active',            label: 'สถานะ',              visible: true },
  { key: 'actions',              label: 'จัดการ',              visible: true, locked: true },
];

@Component({
  selector: 'app-fee-rate-policy-list',
  standalone: true,
  imports: [
    ThaiDatePipe,
    PageHeaderComponent,
    CommonModule,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatButtonModule, MatTooltipModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatDialogModule, MatSnackBarModule,
    SvgIconComponent,
  ],
  templateUrl: './fee-rate-policy-list.component.html',
})
export class FeeRatePolicyListComponent implements OnInit {
  private api     = inject(FeeFormulaApiService);
  private project = inject(ProjectService);
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);
  private tblCfg  = inject(TableConfigService);

  formulaId = 0;
  formula   = signal<FeeFormula | null>(null);

  // ── Sort / Paginator ──
  sortRef!: MatSort;
  @ViewChild(MatSort) set matSort(s: MatSort) {
    if (s) {
      this.sortRef = s;
      this.dataSource.sort = s;
      const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
      if (saved?.sortActive && saved?.sortDirection) {
        setTimeout(() => { s.active = saved.sortActive; s.direction = saved.sortDirection; });
      }
    }
  }
  @ViewChild(MatPaginator) set matPaginator(p: MatPaginator) { if (p) { this.dataSource.paginator = p; } }

  columnDefs       = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  dataSource = new MatTableDataSource<FeeRatePolicy>([]);
  loading    = signal(false);

  canWrite = computed(() => this.project.canEdit());

  ngOnInit(): void {
    this.formulaId = Number(this.route.snapshot.paramMap.get('formulaId'));
    this.loadFormula();
    this.loadData();
  }

  loadFormula(): void {
    this.api.getFormula(this.formulaId).subscribe({
      next: f => this.formula.set(f),
    });
  }

  loadData(): void {
    this.loading.set(true);
    this.api.getPolicies(this.formulaId).subscribe({
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

  toggleActive(policy: FeeRatePolicy): void {
    this.api.togglePolicy(policy.id).subscribe({
      next: updated => {
        policy.is_active = updated.is_active;
        this.snack.open(updated.is_active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', 'ปิด', { duration: 2000 });
      },
      error: err => this.snack.open(err.error?.error ?? 'เปลี่ยนสถานะไม่สำเร็จ', 'ปิด', { duration: 3000 }),
    });
  }

  openCreate(): void {
    this.dialog.open(FeeRatePolicyFormDialogComponent, {
      width: '650px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'create', formulaId: this.formulaId, formula: this.formula() },
    }).afterClosed().subscribe(r => { if (r) { this.snack.open('สร้างมาตรการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); this.loadFormula(); } });
  }

  openEdit(policy: FeeRatePolicy): void {
    this.dialog.open(FeeRatePolicyFormDialogComponent, {
      width: '650px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'edit', formulaId: this.formulaId, formula: this.formula(), policy },
    }).afterClosed().subscribe(r => { if (r) { this.snack.open('อัปเดตมาตรการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); } });
  }

  confirmDelete(policy: FeeRatePolicy): void {
    if (!confirm(`ยืนยันลบมาตรการ "${policy.policy_name}"?`)) return;
    this.api.deletePolicy(policy.id).subscribe({
      next: () => { this.snack.open('ลบมาตรการสำเร็จ', 'ปิด', { duration: 3000 }); this.loadData(); this.loadFormula(); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 5000 }),
    });
  }

  goBack(): void {
    this.router.navigate(['/fee-formulas']);
  }

  // ── Helpers ──
  formatConditions(conditions: any): string {
    if (!conditions || (typeof conditions === 'object' && Object.keys(conditions).length === 0)) return 'ทั้งหมด';
    const parts: string[] = [];
    if (conditions.max_base_price) {
      parts.push('ราคาไม่เกิน ฿' + Number(conditions.max_base_price).toLocaleString('th-TH'));
    }
    if (conditions.project_types && conditions.project_types.length > 0) {
      parts.push('ประเภท: ' + conditions.project_types.join(', '));
    }
    return parts.length > 0 ? parts.join(' | ') : 'ทั้งหมด';
  }

  formatConditionChips(conditions: any): { label: string; class: string }[] {
    if (!conditions || (typeof conditions === 'object' && Object.keys(conditions).length === 0)) {
      return [{ label: 'ทั้งหมด', class: 'bg-slate-100 text-slate-500' }];
    }
    const chips: { label: string; class: string }[] = [];
    if (conditions.max_base_price) {
      chips.push({ label: 'ราคาไม่เกิน ฿' + Number(conditions.max_base_price).toLocaleString('th-TH'), class: 'bg-amber-50 text-amber-700' });
    }
    if (conditions.project_types && conditions.project_types.length > 0) {
      chips.push({ label: 'ประเภท: ' + conditions.project_types.join(', '), class: 'bg-blue-50 text-blue-700' });
    }
    return chips.length > 0 ? chips : [{ label: 'ทั้งหมด', class: 'bg-slate-100 text-slate-500' }];
  }

  formatRate(decimal: number): string {
    return (decimal * 100).toFixed(2) + '%';
  }

  formatShare(decimal: number | null): string {
    if (decimal === null || decimal === undefined) return 'ใช้ค่าเดิม';
    return Math.round(decimal * 100) + '%';
  }

  formatDate(d: string): string {
    return formatThaiDate(d, 'auto');
  }

  baseFieldLabel(bf: string): string {
    switch (bf) {
      case 'appraisal_price': return 'ราคาประเมิน';
      case 'base_price':      return 'ราคาขาย';
      case 'net_price':       return 'ราคาสุทธิ';
      case 'manual_input':    return 'กำหนดเอง';
      default:                return bf;
    }
  }
}
