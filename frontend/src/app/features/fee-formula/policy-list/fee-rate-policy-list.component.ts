import { Component, OnInit, ViewChild, ElementRef, inject, signal, computed } from '@angular/core';
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

import {
  FeeFormulaApiService, FeeFormula, FeeRatePolicy,
  FeeRatePolicyJson, FeeRatePoliciesExportFile,
} from '../fee-formula-api.service';
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
  exporting  = signal(false);
  importing  = signal(false);

  @ViewChild('importInput') importInput!: ElementRef<HTMLInputElement>;

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

  // ── Export / Import (per formula) ───────────────────────────────────────

  /** ส่งออกมาตรการของสูตรนี้เป็นไฟล์ JSON */
  exportJson(): void {
    if (this.formulaId <= 0) return;
    this.exporting.set(true);
    this.api.exportPoliciesJson(this.formulaId).subscribe({
      next: res => {
        this.exporting.set(false);
        if (!res.items || res.items.length === 0) {
          this.snack.open('ไม่มีมาตรการให้ส่งออก', 'ปิด', { duration: 3000 });
          return;
        }
        const payload: FeeRatePoliciesExportFile = {
          format:              'fee-rate-policies.v1',
          exported_at:         new Date().toISOString(),
          count:               res.items.length,
          fee_formula_id:      res.fee_formula_id,
          promotion_item_code: res.promotion_item_code,
          promotion_item_name: res.promotion_item_name,
          items:               res.items,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const safe = (res.promotion_item_code ?? 'formula').replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_').slice(0, 60);
        a.href     = url;
        a.download = `fee-policies_${safe}_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.snack.open(`ส่งออก ${res.items.length} มาตรการสำเร็จ`, 'ปิด', { duration: 3000 });
      },
      error: err => {
        this.exporting.set(false);
        this.snack.open(err?.error?.error ?? 'ส่งออกไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  triggerImport(): void {
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
        const fileCode = this.extractCodeFromFile(parsed);
        const fileName = this.extractNameFromFile(parsed);
        this.confirmAndImport(items, fileCode, fileName);
      } catch {
        this.snack.open('ไฟล์ JSON ไม่ถูกต้อง', 'ปิด', { duration: 3000 });
      }
    };
    reader.onerror = () => this.snack.open('อ่านไฟล์ไม่สำเร็จ', 'ปิด', { duration: 3000 });
    reader.readAsText(file);
  }

  private extractCodeFromFile(parsed: unknown): string | null {
    const code = (parsed as FeeRatePoliciesExportFile)?.promotion_item_code;
    return code && typeof code === 'string' && code.trim() !== '' ? code.trim() : null;
  }

  private extractNameFromFile(parsed: unknown): string | null {
    const name = (parsed as FeeRatePoliciesExportFile)?.promotion_item_name;
    return name && typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
  }

  /** รองรับทั้ง wrapper format (`{format, items}`) และ array ดิบ */
  private normalizeImport(parsed: unknown): FeeRatePolicyJson[] {
    const raw = Array.isArray(parsed)
      ? parsed
      : (parsed as FeeRatePoliciesExportFile)?.items;
    if (!Array.isArray(raw)) return [];

    return raw
      .map((row): FeeRatePolicyJson | null => {
        const name = String((row as any)?.policy_name ?? '').trim();
        if (!name) return null;
        return {
          policy_name:           name,
          override_rate:         Number((row as any).override_rate ?? 0),
          override_buyer_share:  (row as any).override_buyer_share != null ? Number((row as any).override_buyer_share) : null,
          override_expression:   (row as any).override_expression ?? null,
          condition_expression:  (row as any).condition_expression ?? null,
          note:                  (row as any).note ?? null,
          conditions:            (row as any).conditions ?? {},
          effective_from:        (row as any).effective_from ?? null,
          effective_to:          (row as any).effective_to ?? null,
          is_active:             !!(row as any).is_active,
          priority:              Number((row as any).priority ?? 0),
        };
      })
      .filter((x): x is FeeRatePolicyJson => x !== null);
  }

  /**
   * confirm + import — เลือก mode ตามว่า code ในไฟล์ตรงกับสูตรปัจจุบันไหม
   * - ตรง / ไม่มี code → ใส่เข้าสูตรปัจจุบัน (by formula_id) ตามเดิม
   * - ไม่ตรง → ถาม user: resolve โดย code (default) / ใส่เข้าสูตรนี้อยู่ดี / ยกเลิก
   */
  private confirmAndImport(items: FeeRatePolicyJson[], fileCode: string | null, fileName: string | null): void {
    const currentCode = this.formula()?.promotion_item_code ?? '';
    const currentName = this.formula()?.promotion_item_name ?? '';

    // ไม่มี code ในไฟล์ → import ตามเดิม (by formula_id)
    if (!fileCode) {
      if (!confirm(`นำเข้า ${items.length} มาตรการเข้าสูตร "${currentName}" ?\n(มาตรการชื่อซ้ำจะถูกข้าม)`)) return;
      this.runImportByFormula(items);
      return;
    }

    // code ตรงกับสูตรปัจจุบัน → import ตามเดิม
    if (fileCode === currentCode) {
      if (!confirm(`นำเข้า ${items.length} มาตรการจากไฟล์ "${fileName ?? fileCode}" → สูตร "${currentName}" ?\n(มาตรการชื่อซ้ำจะถูกข้าม)`)) return;
      this.runImportByFormula(items);
      return;
    }

    // code ต่าง → ถาม user
    const projectId = Number(this.project.selectedProject()?.id ?? 0);
    if (projectId <= 0) {
      this.snack.open('กรุณาเลือกโครงการก่อน', 'ปิด', { duration: 3000 });
      return;
    }

    const msg =
      `ไฟล์มาจากสูตร: ${fileName ?? '-'} (${fileCode})\n` +
      `สูตรปัจจุบัน: ${currentName} (${currentCode})\n\n` +
      `รหัสไม่ตรงกัน — ต้องการลิงค์โดยรหัส (resolve) เพื่อใส่เข้าสูตรของรหัส "${fileCode}" ในโครงการนี้ใช่ไหม?\n\n` +
      `[ตกลง] = ลิงค์โดยรหัส (resolve)\n` +
      `[ยกเลิก] = ใส่เข้าสูตรปัจจุบัน "${currentName}" อยู่ดี`;

    if (confirm(msg)) {
      this.runImportByCode(projectId, fileCode, items);
    } else {
      // user เลือก "ยกเลิก" — ถามอีกครั้งก่อนใส่ผิดสูตร
      if (!confirm(`ยืนยันใส่ ${items.length} มาตรการเข้าสูตร "${currentName}" (รหัสต่างกัน)?`)) return;
      this.runImportByFormula(items);
    }
  }

  private runImportByFormula(items: FeeRatePolicyJson[]): void {
    this.importing.set(true);
    this.api.importPoliciesJson({ fee_formula_id: this.formulaId, items }).subscribe({
      next: res => this.handleImportResult(res, this.formula()?.promotion_item_name ?? ''),
      error: err => this.handleImportError(err),
    });
  }

  private runImportByCode(projectId: number, code: string, items: FeeRatePolicyJson[]): void {
    this.importing.set(true);
    this.api.importPoliciesJsonByCode({ project_id: projectId, promotion_item_code: code, items }).subscribe({
      next: res => {
        this.handleImportResult(res, `${res.promotion_item_name} (${res.promotion_item_code})`);
        // ถ้า import เข้าสูตรอื่นที่ไม่ใช่หน้าปัจจุบัน → ไม่ reload table นี้ก็ได้
        // (loadData() ใน handleImportResult ก็ไม่กระทบเพราะกรอง by formulaId เดิมอยู่แล้ว)
      },
      error: err => this.handleImportError(err),
    });
  }

  private handleImportResult(res: { created: number; skipped: any[]; errors: any[] }, target: string): void {
    this.importing.set(false);
    const parts: string[] = [];
    if (res.created > 0) parts.push(`สร้าง ${res.created}`);
    if (res.skipped.length > 0) parts.push(`ข้าม ${res.skipped.length}`);
    if (res.errors.length > 0) parts.push(`error ${res.errors.length}`);
    const msg = (parts.length > 0 ? parts.join(', ') : 'ไม่มีรายการที่นำเข้า') + ` → ${target}`;
    this.snack.open(msg, 'ปิด', { duration: 5000 });

    if (res.skipped.length > 0 || res.errors.length > 0) {
      console.warn('[import policies] skipped:', res.skipped, 'errors:', res.errors);
    }
    this.loadData();
  }

  private handleImportError(err: any): void {
    this.importing.set(false);
    this.snack.open(err?.error?.error ?? 'นำเข้าไม่สำเร็จ', 'ปิด', { duration: 5000 });
  }
}
