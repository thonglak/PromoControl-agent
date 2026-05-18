import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy,
  inject, signal, computed, effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription, filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ProjectService, Project } from '../../core/services/project.service';
import { VersionCheckService } from '../../core/services/version-check.service';
import { SvgIconComponent } from '../../shared/components/svg-icon/svg-icon.component';
import { ProjectFormDialogComponent } from '../../features/master-data/projects/dialogs/project-form-dialog.component';

// ── Menu type definitions ────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  icon?: string;
  path?: string;
  children?: MenuItem[];
  roles?: string[];   // undefined = visible to all roles
  exact?: boolean;    // routerLinkActive exact matching
}

// ── Static menu definition (ตาม docs/06 + permission matrix docs/08) ─────────

const MENU: MenuItem[] = [
  { label: 'แดชบอร์ด', icon: 'chart-bar', path: '/dashboard' },
  {
    label: 'ข้อมูลหลัก', icon: 'squares-2x2',
    roles: ['admin', 'manager'],
    children: [
      { label: 'โครงการ',       path: '/projects',         roles: ['admin', 'manager'] },
      { label: 'แบบบ้าน',       path: '/house-models',     roles: ['admin', 'manager'] },
      { label: 'ยูนิต',         path: '/units',            roles: ['admin', 'manager'] },
      { label: 'รายการโปรโมชั่น', path: '/promotion-items', roles: ['admin', 'manager'] },
      { label: 'Phase',           path: '/phases',          roles: ['admin', 'manager'] },
    ],
  },
  {
    label: 'การขาย', icon: 'document-text',
    children: [
      { label: 'บันทึกขาย',  path: '/sales',      roles: ['admin', 'manager', 'sales'], exact: true },
      { label: 'รายการขาย',  path: '/sales/list' },
    ],
  },
  {
    label: 'สูตรคำนวณ', icon: 'calculator',
    roles: ['admin', 'manager'],
    children: [
      { label: 'สูตรคำนวณ',       path: '/fee-formulas', exact: true },
      { label: 'ทดสอบสูตร',       path: '/fee-formulas/tester' },
    ],
  },
  {
    label: 'ราคาต้นทุน', icon: 'arrow-up-tray',
    roles: ['admin', 'manager'],
    children: [
      { label: 'Import ราคาต้นทุน', path: '/bottom-line/import' },
      { label: 'ประวัติ Import',    path: '/bottom-line/history' },
      { label: 'ตั้งค่า Mapping',   path: '/bottom-line/mapping' },
    ],
  },
  {
    label: 'ข้อมูลจาก API', icon: 'cloud-arrow-down',
    roles: ['admin', 'manager'],
    children: [
      { label: 'ประวัติการดึง', path: '/sync-from-api',          roles: ['admin', 'manager'], exact: true },
      { label: 'ตั้งค่า API',   path: '/sync-from-api/configs',  roles: ['admin', 'manager'] },
      { label: 'ทดสอบ API',    path: '/sync-from-api/debug',    roles: ['admin', 'manager'] },
      { label: 'จับคู่ Field',  path: '/sync-from-api/mappings', roles: ['admin', 'manager'] },
      { label: 'Target Tables', path: '/sync-from-api/targets', roles: ['admin'] },
    ],
  },
  {
    label: 'งบประมาณ', icon: 'banknotes',
    roles: ['admin', 'manager'],
    children: [
      { label: 'ตั้งค่างบประมาณยูนิต', path: '/budget/unit-settings' },
      { label: 'รายการเคลื่อนไหว', path: '/budget/movements' },
      { label: 'งบพิเศษ',        path: '/budget/special' },
    ],
  },
  { label: 'รายงาน',     icon: 'chart-pie', path: '/reports', roles: ['admin', 'manager', 'finance', 'viewer'] },
  {
    label: 'ตั้งค่า', icon: 'cog',
    roles: ['admin', 'manager'],
    children: [
      { label: 'ตั้งค่าระบบ', path: '/settings/system', roles: ['admin', 'manager'] },
      { label: 'เลขที่เอกสาร', path: '/settings/number-series', roles: ['admin', 'manager'] },
      { label: 'รูปแบบวันที่', path: '/settings/date-format' },
    ],
  },
  { label: 'จัดการผู้ใช้', icon: 'users',   path: '/users',    roles: ['admin'] },
  {
    label: 'เครื่องมือ Dev', icon: 'wrench-screwdriver',
    roles: ['admin'],
    children: [
      { label: 'ล้างข้อมูลขาย', path: '/dev/clear-transactions', roles: ['admin'] },
      { label: 'Fix Error',     path: '/dev/fix-error',          roles: ['admin'] },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-sidebar-menu',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink, RouterLinkActive,
    MatButtonModule, MatTooltipModule, MatMenuModule, MatDividerModule,
    MatDialogModule, MatSnackBarModule,
    SvgIconComponent,
  ],
  templateUrl: './sidebar-menu.component.html',
})
export class SidebarMenuComponent implements OnInit, OnDestroy {
  @Input() collapsed = false;
  @Output() collapseToggle = new EventEmitter<void>();

  private readonly auth          = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly versionCheck  = inject(VersionCheckService);
  private readonly router        = inject(Router);
  private readonly dialog        = inject(MatDialog);
  private readonly snackBar      = inject(MatSnackBar);
  private readonly subs          = new Subscription();

  readonly selectedProject = this.projectService.selectedProject;
  readonly currentUser     = this.auth.currentUser;
  /** version ล่าสุดจาก poll — อัปเดตอัตโนมัติเมื่อ VersionCheckService พบเวอร์ชันใหม่ */
  readonly appVersion      = this.versionCheck.latestVersion;

  /** กลุ่มที่ expand อยู่ */
  readonly expandedGroups = signal(new Set<string>());

  // ── Project switcher state ────────────────────────────────────────────────
  /** ค้นหาในเมนูเปลี่ยนโครงการ */
  readonly projectSearch = signal('');

  /** รายการโครงการทั้งหมดของ user (จาก auth.currentUser) */
  readonly userProjects = computed<Project[]>(
    () => (this.currentUser()?.projects as unknown as Project[]) ?? [],
  );

  /** projects ที่ผ่าน search filter — เปรียบเทียบ name + code */
  readonly filteredProjects = computed<Project[]>(() => {
    const q = this.projectSearch().toLowerCase().trim();
    if (!q) return this.userProjects();
    return this.userProjects().filter(
      p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  });

  /** แสดง search input เฉพาะถ้ามีโครงการเกิน 5 */
  readonly showProjectSearch = computed(() => this.userProjects().length > 5);

  /** admin/manager สร้างโครงการได้ */
  readonly canCreateProject = computed(() => {
    const role = this.currentUser()?.role;
    return role === 'admin' || role === 'manager';
  });

  /** Menu items กรองตาม role */
  readonly filteredMenu = computed<MenuItem[]>(() => {
    const role = this.currentUser()?.role ?? 'viewer';
    return this.filterByRole(MENU, role);
  });

  ngOnInit(): void {
    // Auto-expand กลุ่มที่ active ตาม URL ปัจจุบัน
    this.autoExpand(this.router.url);
    this.subs.add(
      this.router.events.pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(e => this.autoExpand((e as NavigationEnd).url))
    );
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  toggleGroup(label: string): void {
    this.expandedGroups.update(s => {
      const next = new Set(s);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  isExpanded(label: string): boolean {
    return this.expandedGroups().has(label);
  }

  isGroupActive(item: MenuItem): boolean {
    return (item.children ?? []).some(c => c.path && this.router.url.startsWith(c.path));
  }

  /** ตรวจว่า project ที่ส่งมาเป็นโครงการที่เลือกอยู่ (id type ระหว่าง PHP/TS ไม่ตรงกัน ใช้ String()) */
  isCurrentProject(project: Project): boolean {
    return String(this.selectedProject()?.id) === String(project.id);
  }

  /** สลับโครงการ — set ใน service แล้วเด้งไป dashboard เพื่อ refresh data ทั้งหน้า */
  switchProject(project: Project): void {
    if (this.isCurrentProject(project)) return;
    this.projectService.selectProject(project);
    this.projectSearch.set('');
    this.router.navigate(['/dashboard']);
  }

  /** เปิด dialog สร้างโครงการใหม่ — เฉพาะ admin/manager */
  openCreateProject(): void {
    this.dialog
      .open(ProjectFormDialogComponent, {
        data: { mode: 'create' },
        width: '500px',
        maxHeight: '90vh',
        disableClose: true,
      })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.snackBar.open('สร้างโครงการสำเร็จ', 'ปิด', { duration: 3000 });
        // refresh user.projects ให้รายการ dropdown อัปเดต
        this.auth.me().subscribe();
      });
  }

  /** เคลียร์ search ทุกครั้งที่ menu ปิด */
  onMenuClosed(): void {
    this.projectSearch.set('');
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private filterByRole(items: MenuItem[], role: string): MenuItem[] {
    return items
      .filter(item => !item.roles || item.roles.includes(role))
      .map(item => {
        if (!item.children) return item;
        return { ...item, children: this.filterByRole(item.children, role) };
      })
      .filter(item => !item.children || item.children.length > 0);
  }

  private autoExpand(url: string): void {
    MENU.forEach(item => {
      if (item.children?.some(c => c.path && url.startsWith(c.path))) {
        this.expandedGroups.update(s => new Set([...s, item.label]));
      }
    });
  }
}
