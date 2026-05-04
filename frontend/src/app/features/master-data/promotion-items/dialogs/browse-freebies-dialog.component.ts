import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { PromotionItemApiService, FreebieSource, SourceProject } from '../promotion-item-api.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { TableConfigService } from '../../../../shared/services/table-config.service';

const FILTER_KEY = 'browse-freebies-dialog';

interface BrowseFreebiesFilterState {
  q?: string;
  pj_code?: string;
  category?: 'discount' | 'premium' | 'expense_support';
  per_page?: number;
}

export interface BrowseFreebiesDialogData {
  projectId: number;
  projectName?: string;
}

type Category = 'discount' | 'premium' | 'expense_support';

@Component({
  selector: 'app-browse-freebies-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatCheckboxModule, MatTableModule,
    MatTooltipModule, MatProgressSpinnerModule, MatPaginatorModule,
    SvgIconComponent,
  ],
  templateUrl: './browse-freebies-dialog.component.html',
})
export class BrowseFreebiesDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<BrowseFreebiesDialogComponent>);
  private readonly api       = inject(PromotionItemApiService);
  private readonly snack     = inject(MatSnackBar);
  private readonly tblCfg    = inject(TableConfigService);
  readonly data: BrowseFreebiesDialogData = inject(MAT_DIALOG_DATA);

  readonly searchCtrl   = new FormControl<string>('', { nonNullable: true });
  readonly pjCodeCtrl   = new FormControl<string>('', { nonNullable: true });
  readonly categoryCtrl = new FormControl<Category>('premium', { nonNullable: true });

  sourceProjects = signal<SourceProject[]>([]);

  readonly categories: { value: Category; label: string }[] = [
    { value: 'premium',         label: 'ของสมนาคุณ (Premium)' },
    { value: 'discount',        label: 'ส่วนลด (Discount)' },
    { value: 'expense_support', label: 'สนับสนุนค่าใช้จ่าย (Expense Support)' },
  ];

  readonly displayedColumns = ['select', 'code', 'name', 'pj_code', 'value_mode', 'fixed_value', 'convert'];

  loading = signal(false);
  saving  = signal(false);
  rows    = signal<FreebieSource[]>([]);
  total   = signal(0);
  page    = signal(1);
  perPage = signal(20);

  selected = signal<Set<string>>(new Set());

  selectedCount = computed(() => this.selected().size);

  selectableRows = computed(() => this.rows().filter(r => !r.already_added));

  allInPageSelected = computed(() => {
    const s = this.selected();
    const sel = this.selectableRows();
    return sel.length > 0 && sel.every(r => s.has(r.fre_code));
  });

  somePageSelected = computed(() => {
    const s = this.selected();
    const sel = this.selectableRows();
    const n = sel.filter(r => s.has(r.fre_code)).length;
    return n > 0 && n < sel.length;
  });

  /** เตือนผู้ใช้ตอน submit ถ้าเลือก calculated เยอะ */
  selectedCalculatedCount = computed(() => {
    const s = this.selected();
    return this.rows().filter(r => s.has(r.fre_code) && r.suggested_value_mode === 'calculated').length;
  });

  ngOnInit(): void {
    // Restore filter จาก localStorage
    const saved = this.tblCfg.loadFilters<BrowseFreebiesFilterState>(FILTER_KEY);
    if (saved) {
      if (saved.q !== undefined)        this.searchCtrl.setValue(saved.q,        { emitEvent: false });
      if (saved.pj_code !== undefined)  this.pjCodeCtrl.setValue(saved.pj_code,  { emitEvent: false });
      if (saved.category !== undefined) this.categoryCtrl.setValue(saved.category, { emitEvent: false });
      if (saved.per_page !== undefined) this.perPage.set(saved.per_page);
    }

    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.page.set(1);
        this.persistFilter();
        this.fetch();
      });
    this.pjCodeCtrl.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(() => {
        this.page.set(1);
        this.persistFilter();
        this.fetch();
      });
    this.categoryCtrl.valueChanges
      .pipe(distinctUntilChanged())
      .subscribe(() => this.persistFilter());

    this.api.getSourceProjects().subscribe({
      next: list => this.sourceProjects.set(list),
    });
    this.fetch();
  }

  private persistFilter(): void {
    this.tblCfg.saveFilters(FILTER_KEY, {
      q:        this.searchCtrl.value,
      pj_code:  this.pjCodeCtrl.value,
      category: this.categoryCtrl.value,
      per_page: this.perPage(),
    });
  }

  private fetch(): void {
    this.loading.set(true);
    this.api.browseSource({
      project_id: this.data.projectId,
      q: this.searchCtrl.value,
      pj_code: this.pjCodeCtrl.value,
      page: this.page(),
      per_page: this.perPage(),
    }).subscribe({
      next: res => {
        this.rows.set(res.data);
        this.total.set(res.meta.total);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 });
      },
    });
  }

  onPageChange(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    if (e.pageSize !== this.perPage()) {
      this.perPage.set(e.pageSize);
      this.persistFilter();
    }
    this.fetch();
  }

  isSelected(code: string): boolean {
    return this.selected().has(code);
  }

  toggleRow(row: FreebieSource): void {
    if (row.already_added) return;
    const s = new Set(this.selected());
    if (s.has(row.fre_code)) s.delete(row.fre_code);
    else                     s.add(row.fre_code);
    this.selected.set(s);
  }

  togglePage(): void {
    const s = new Set(this.selected());
    const allSelected = this.allInPageSelected();
    for (const r of this.selectableRows()) {
      if (allSelected) s.delete(r.fre_code);
      else             s.add(r.fre_code);
    }
    this.selected.set(s);
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  modeLabel(m: string): string {
    return m === 'fixed' ? 'คงที่' : m === 'manual' ? 'กำหนดเอง' : 'คำนวณอัตโนมัติ';
  }

  modeClass(m: string): string {
    return m === 'fixed' ? 'bg-slate-100 text-slate-600'
         : m === 'manual' ? 'bg-amber-50 text-amber-700'
         : 'bg-blue-50 text-blue-700';
  }

  formatMoney(v: string | null): string {
    if (v === null || v === '') return '—';
    const n = Number(v);
    return isNaN(n) || n === 0 ? '—' : '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 0 });
  }

  submit(): void {
    if (this.selectedCount() === 0 || this.saving()) return;

    if (this.selectedCalculatedCount() > 0) {
      const ok = confirm(
        `รายการที่เลือก ${this.selectedCalculatedCount()} รายการมีโหมด "คำนวณอัตโนมัติ" ` +
        `(formula ของระบบเก่า) ระบบเรายังไม่รองรับโดยตรง — ต้องเพิ่ม fee_formula ให้ภายหลัง\n\n` +
        `ต้องการนำเข้าต่อหรือไม่?`
      );
      if (!ok) return;
    }

    this.saving.set(true);
    this.api.bulkImport({
      project_id: this.data.projectId,
      default_category: this.categoryCtrl.value,
      fre_codes: Array.from(this.selected()),
    }).subscribe({
      next: res => {
        this.saving.set(false);
        let msg = `นำเข้าสำเร็จ ${res.created} รายการ`;
        if (res.calculated_count > 0) msg += ` · ต้องเพิ่ม formula ${res.calculated_count}`;
        if (res.skipped.length > 0)   msg += ` · ข้าม ${res.skipped.length}`;
        if (res.errors.length > 0)    msg += ` · ผิดพลาด ${res.errors.length}`;
        this.snack.open(msg, 'ปิด', { duration: 6000 });
        this.dialogRef.close(true);
      },
      error: err => {
        this.saving.set(false);
        const msg = err?.error?.error ?? 'เกิดข้อผิดพลาด';
        this.snack.open(msg, 'ปิด', { duration: 4000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  /** ล้าง filter ทั้งหมด — กลับไปค่าเริ่มต้น */
  resetFilters(): void {
    this.searchCtrl.setValue('', { emitEvent: false });
    this.pjCodeCtrl.setValue('',  { emitEvent: false });
    this.categoryCtrl.setValue('premium', { emitEvent: false });
    this.tblCfg.resetFilters(FILTER_KEY);
    this.page.set(1);
    this.fetch();
  }

  hasActiveFilter(): boolean {
    return !!(this.searchCtrl.value || this.pjCodeCtrl.value);
  }

  trackByCode = (_: number, r: FreebieSource) => r.fre_code;
}
