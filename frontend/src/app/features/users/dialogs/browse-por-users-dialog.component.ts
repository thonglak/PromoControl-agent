import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { UserService, PorUser, UserRole } from '../user.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

@Component({
  selector: 'app-browse-por-users-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatCheckboxModule, MatTableModule, MatIconModule,
    MatTooltipModule, MatProgressSpinnerModule, MatPaginatorModule,
    SvgIconComponent,
  ],
  templateUrl: './browse-por-users-dialog.component.html',
})
export class BrowsePorUsersDialogComponent implements OnInit {
  private readonly dialogRef   = inject(MatDialogRef<BrowsePorUsersDialogComponent>);
  private readonly userService = inject(UserService);
  private readonly snackBar    = inject(MatSnackBar);

  readonly searchCtrl = new FormControl<string>('', { nonNullable: true });
  readonly roleCtrl   = new FormControl<UserRole>('viewer', { nonNullable: true });

  readonly roles: { value: UserRole; label: string }[] = [
    { value: 'admin',   label: 'ผู้ดูแลระบบ (Admin)' },
    { value: 'manager', label: 'ผู้จัดการ (Manager)' },
    { value: 'sales',   label: 'พนักงานขาย (Sales)' },
    { value: 'finance', label: 'การเงิน (Finance)' },
    { value: 'viewer',  label: 'ผู้ดู (Viewer)' },
  ];

  readonly displayedColumns = ['select', 'name', 'username', 'email', 'department', 'position', 'company'];

  loading  = signal(false);
  saving   = signal(false);
  rows     = signal<PorUser[]>([]);
  total    = signal(0);
  page     = signal(1);   // 1-based
  perPage  = signal(20);

  /** use_id ที่เลือก (ข้าม page ได้) */
  selected = signal<Set<string>>(new Set());

  selectedCount = computed(() => this.selected().size);

  /** เฉพาะแถวในหน้านี้ที่ "ยังไม่เพิ่ม" → ใช้คำนวณ select-all */
  selectableRows = computed(() => this.rows().filter(r => !r.already_added));

  allInPageSelected = computed(() => {
    const s = this.selected();
    const sel = this.selectableRows();
    return sel.length > 0 && sel.every(r => s.has(r.use_id));
  });

  somePageSelected = computed(() => {
    const s = this.selected();
    const sel = this.selectableRows();
    const n = sel.filter(r => s.has(r.use_id)).length;
    return n > 0 && n < sel.length;
  });

  ngOnInit(): void {
    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.page.set(1);
        this.fetch();
      });
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.userService
      .browseSource({ q: this.searchCtrl.value, page: this.page(), per_page: this.perPage() })
      .subscribe({
        next: res => {
          this.rows.set(res.data);
          this.total.set(res.meta.total);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snackBar.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 });
        },
      });
  }

  onPageChange(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.perPage.set(e.pageSize);
    this.fetch();
  }

  isSelected(useId: string): boolean {
    return this.selected().has(useId);
  }

  toggleRow(row: PorUser): void {
    if (row.already_added) return;
    const s = new Set(this.selected());
    if (s.has(row.use_id)) {
      s.delete(row.use_id);
    } else {
      s.add(row.use_id);
    }
    this.selected.set(s);
  }

  togglePage(): void {
    const s = new Set(this.selected());
    const allSelected = this.allInPageSelected();
    for (const r of this.selectableRows()) {
      if (allSelected) {
        s.delete(r.use_id);
      } else {
        s.add(r.use_id);
      }
    }
    this.selected.set(s);
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  submit(): void {
    if (this.selectedCount() === 0 || this.saving()) return;

    this.saving.set(true);
    this.userService
      .bulkImportFromPortal({
        default_role: this.roleCtrl.value,
        use_ids: Array.from(this.selected()),
      })
      .subscribe({
        next: res => {
          this.saving.set(false);
          const skipped = res.skipped.length;
          const errors  = res.errors.length;
          let msg = `เพิ่มผู้ใช้สำเร็จ ${res.created} คน`;
          if (skipped > 0) msg += ` · ข้าม ${skipped}`;
          if (errors > 0)  msg += ` · ผิดพลาด ${errors}`;
          this.snackBar.open(msg, 'ปิด', { duration: 5000 });
          this.dialogRef.close(true);
        },
        error: err => {
          this.saving.set(false);
          const msg = err?.error?.error ?? 'เกิดข้อผิดพลาด';
          this.snackBar.open(msg, 'ปิด', { duration: 4000 });
        },
      });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  trackByUseId = (_: number, r: PorUser) => r.use_id;
}
