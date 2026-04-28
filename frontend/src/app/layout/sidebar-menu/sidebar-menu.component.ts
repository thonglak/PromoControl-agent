import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy,
  inject, signal, computed, effect,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription, filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { SvgIconComponent } from '../../shared/components/svg-icon/svg-icon.component';

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
    label: 'การขาย', icon: 'document-text',
    children: [
      { label: 'บันทึกขาย',  path: '/sales',      roles: ['admin', 'manager', 'sales'], exact: true },
      { label: 'รายการขาย',  path: '/sales/list' },
    ],
  },
  {
    label: 'งบประมาณ', icon: 'banknotes',
    roles: ['admin', 'manager'],
    children: [
      { label: 'โอนงบประมาณ',    path: '/budget/transfer' },
      { label: 'รายการเคลื่อนไหว', path: '/budget/movements' },
      { label: 'งบพิเศษ',        path: '/budget/special' },
      { label: 'คืนงบยูนิตเข้า Pool', path: '/budget/unit-return-pool' },
    ],
  },
  { label: 'รายงาน',     icon: 'chart-pie', path: '/reports', roles: ['admin', 'manager', 'finance', 'viewer'] },
  {
    label: 'ตั้งค่า', icon: 'cog',
    roles: ['admin', 'manager'],
    children: [
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
    ],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-sidebar-menu',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatButtonModule, MatTooltipModule, SvgIconComponent],
  templateUrl: './sidebar-menu.component.html',
})
export class SidebarMenuComponent implements OnInit, OnDestroy {
  @Input() collapsed = false;
  @Output() collapseToggle = new EventEmitter<void>();

  private readonly auth          = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly router        = inject(Router);
  private readonly subs          = new Subscription();

  readonly selectedProject = this.projectService.selectedProject;
  readonly currentUser     = this.auth.currentUser;

  /** กลุ่มที่ expand อยู่ */
  readonly expandedGroups = signal(new Set<string>());

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

  changeProject(): void {
    this.router.navigate(['/select-project']);
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
