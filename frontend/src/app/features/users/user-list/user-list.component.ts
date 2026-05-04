import { Component, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UserService, UserListItem, AllProject } from '../user.service';
import { AuthService } from '../../../core/services/auth.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { UserFormDialogComponent, UserFormDialogData } from '../dialogs/user-form-dialog.component';
import { AssignProjectsDialogComponent, AssignProjectsDialogData } from '../dialogs/assign-projects-dialog.component';
import { ResetPasswordDialogComponent, ResetPasswordDialogData } from '../dialogs/reset-password-dialog.component';
import { BrowsePorUsersDialogComponent } from '../dialogs/browse-por-users-dialog.component';
import { TableConfigService, ColumnDef } from '../../../shared/services/table-config.service';
import { TableSettingsDialogComponent } from '../../../shared/components/table-settings/table-settings-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';

const TABLE_ID = 'user-list-v2';
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'name',          label: 'ชื่อ',            visible: true },
  { key: 'email',         label: 'อีเมล',           visible: true },
  { key: 'role',          label: 'บทบาท',           visible: true },
  { key: 'projects',      label: 'โครงการ',          visible: true },
  { key: 'status',        label: 'สถานะ',            visible: true },
  { key: 'last_login_at', label: 'เข้าระบบล่าสุด',    visible: true },
  { key: 'actions',       label: 'จัดการ',            visible: true, locked: true },
];

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    StatusChipComponent,
    SectionCardComponent,
    PageHeaderComponent,
    CommonModule, ReactiveFormsModule, DatePipe,
    MatTableModule, MatSortModule, MatPaginatorModule,
    MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSlideToggleModule, MatTooltipModule, MatProgressSpinnerModule,
    MatDialogModule, SvgIconComponent,
  ],
  templateUrl: './user-list.component.html',
})
export class UserListComponent implements OnInit {
  private userService = inject(UserService);
  private auth        = inject(AuthService);
  private dialog      = inject(MatDialog);
  private snackBar    = inject(MatSnackBar);
  private tblCfg      = inject(TableConfigService);
  private fb          = inject(FormBuilder);

  // ── Sort / Paginator (setter pattern) ──
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

  // ── Table config ──
  columnDefs       = signal<ColumnDef[]>(this.tblCfg.getConfig(TABLE_ID, DEFAULT_COLUMNS));
  displayedColumns = computed(() => this.tblCfg.getVisibleKeys(this.columnDefs()));

  loading      = signal(true);
  allProjects  = signal<AllProject[]>([]);
  dataSource   = new MatTableDataSource<UserListItem>([]);

  /** ปกติแสดงเฉพาะผู้ใช้ที่ active (ปิดใช้งานแล้วถูกซ่อน) — toggle เพื่อแสดงทั้งหมด */
  showInactive = signal(false);

  // ── Filter form (reactive) ──
  filterForm = this.fb.group({
    search: [''],
    role:   [''],
  });

  readonly roles = [
    { value: 'admin',   label: 'ผู้ดูแลระบบ' },
    { value: 'manager', label: 'ผู้จัดการ' },
    { value: 'sales',   label: 'พนักงานขาย' },
    { value: 'finance', label: 'การเงิน' },
    { value: 'viewer',  label: 'ผู้ดู' },
  ];

  private readonly roleClassMap: Record<string, string> = {
    admin: 'bg-red-100 text-red-700', manager: 'bg-blue-100 text-blue-700',
    sales: 'bg-green-100 text-green-700', finance: 'bg-amber-100 text-amber-700',
    viewer: 'bg-slate-100 text-slate-500',
  };

  private readonly roleLabelMap: Record<string, string> = {
    admin: 'ผู้ดูแลระบบ', manager: 'ผู้จัดการ', sales: 'พนักงานขาย',
    finance: 'การเงิน', viewer: 'ผู้ดู',
  };

  // ── Lifecycle ──

  ngOnInit(): void {
    this.dataSource.filterPredicate = (user, filterJson) => {
      const f = JSON.parse(filterJson || '{}') as { search?: string; role?: string };
      const matchSearch = !f.search || user.name.toLowerCase().includes(f.search) || user.email.toLowerCase().includes(f.search);
      const matchRole = !f.role || user.role === f.role;
      return matchSearch && matchRole;
    };

    // Restore filters
    const saved = this.tblCfg.loadFilters<any>(TABLE_ID);
    if (saved) this.filterForm.patchValue({ search: saved.search || '', role: saved.role || '' }, { emitEvent: false });

    this.loadUsers();
    this.loadProjects();
  }

  // ── Data ──

  loadUsers(): void {
    this.loading.set(true);
    // ส่ง is_active=1 เมื่อ showInactive = false → ซ่อนคนที่ปิดใช้งาน (ลบไปแล้ว)
    const filters = this.showInactive() ? {} : { is_active: true };
    this.userService.getUsers(filters).subscribe({
      next: users => {
        this.dataSource.data = users;
        this.loading.set(false);
        this.applyFilter();
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('ไม่สามารถโหลดข้อมูลผู้ใช้ได้', 'ปิด', { duration: 4000 });
      },
    });
  }

  toggleShowInactive(value: boolean): void {
    this.showInactive.set(value);
    this.loadUsers();
  }

  private loadProjects(): void {
    this.userService.getAllProjects().subscribe({
      next: projects => this.allProjects.set(projects),
    });
  }

  // ── Filter / Sort ──

  onFilterChange(): void {
    this.applyFilter();
  }

  onSortChange(sort: Sort): void {
    const current = this.tblCfg.loadFilters<any>(TABLE_ID) ?? this.filterForm.value;
    this.tblCfg.saveFilters(TABLE_ID, { ...current, sortActive: sort.active, sortDirection: sort.direction });
    this.loadUsers();
  }

  private applyFilter(): void {
    const v = this.filterForm.value;
    this.dataSource.filter = JSON.stringify({ search: (v.search ?? '').toLowerCase().trim(), role: v.role ?? '' });
    this.dataSource.paginator?.firstPage();
    const sortState = this.sortRef ? { sortActive: this.sortRef.active, sortDirection: this.sortRef.direction } : {};
    this.tblCfg.saveFilters(TABLE_ID, { ...v, ...sortState });
  }

  hasActiveFilters(): boolean {
    const v = this.filterForm.value;
    return !!(v.search || v.role || this.sortRef?.active);
  }

  resetAll(): void {
    this.filterForm.reset({ search: '', role: '' });
    if (this.sortRef) { this.sortRef.active = ''; this.sortRef.direction = ''; }
    this.tblCfg.resetFilters(TABLE_ID);
    this.loadUsers();
  }

  // ── Table settings ──

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

  // ── Dialogs ──

  openCreateDialog(): void {
    this.dialog.open(UserFormDialogComponent, {
      width: '520px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'create' } satisfies UserFormDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadUsers(); });
  }

  openBrowsePortalDialog(): void {
    this.dialog.open(BrowsePorUsersDialogComponent, {
      width: '960px', maxWidth: '95vw', maxHeight: '90vh', disableClose: true,
      panelClass: 'browse-por-users-dialog',
    }).afterClosed().subscribe(saved => { if (saved) this.loadUsers(); });
  }

  openEditDialog(user: UserListItem): void {
    this.dialog.open(UserFormDialogComponent, {
      width: '520px', maxHeight: '90vh', disableClose: true,
      data: { mode: 'edit', user } satisfies UserFormDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadUsers(); });
  }

  openAssignDialog(user: UserListItem): void {
    this.dialog.open(AssignProjectsDialogComponent, {
      width: '600px', maxHeight: '90vh', disableClose: true,
      data: { user, allProjects: this.allProjects() } satisfies AssignProjectsDialogData,
    }).afterClosed().subscribe(saved => { if (saved) this.loadUsers(); });
  }

  openResetPasswordDialog(user: UserListItem): void {
    this.dialog.open(ResetPasswordDialogComponent, {
      width: '420px', maxHeight: '90vh', disableClose: true,
      data: { userId: user.id, userName: user.name } satisfies ResetPasswordDialogData,
    }).afterClosed().subscribe(() => {});
  }

  // ── Delete ──

  /** ลบตัวเองไม่ได้ — กันลั่น */
  isSelf(user: UserListItem): boolean {
    return Number(this.auth.currentUser()?.id) === Number(user.id);
  }

  confirmDelete(user: UserListItem): void {
    if (this.isSelf(user)) {
      this.snackBar.open('ไม่สามารถปิดใช้งานบัญชีของตนเองได้', 'ปิด', { duration: 3000 });
      return;
    }
    // หมายเหตุ: backend ทำ soft delete (is_active = false) — record ยังอยู่ในฐานข้อมูล
    if (!confirm(`ยืนยันปิดใช้งานผู้ใช้ "${user.name}" (${user.email})?\n\nผู้ใช้จะเข้าสู่ระบบไม่ได้ และจะถูกซ่อนจากรายการ — เปิดใช้งานใหม่ได้ภายหลัง`)) return;

    this.userService.deleteUser(user.id).subscribe({
      next: () => {
        this.snackBar.open('ปิดใช้งานผู้ใช้สำเร็จ', 'ปิด', { duration: 3000 });
        this.loadUsers();
      },
      error: err => {
        this.snackBar.open(err?.error?.error ?? 'ปิดใช้งานไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  reactivate(user: UserListItem): void {
    this.userService.setUserActive(user.id, true).subscribe({
      next: () => {
        this.snackBar.open(`เปิดใช้งาน ${user.name} แล้ว`, 'ปิด', { duration: 3000 });
        this.loadUsers();
      },
      error: err => {
        this.snackBar.open(err?.error?.error ?? 'เปิดใช้งานไม่สำเร็จ', 'ปิด', { duration: 5000 });
      },
    });
  }

  // ── Helpers ──

  roleClass(role: string): string { return this.roleClassMap[role] ?? 'bg-slate-100 text-slate-500'; }
  roleLabel(role: string): string { return this.roleLabelMap[role] ?? role; }
}
