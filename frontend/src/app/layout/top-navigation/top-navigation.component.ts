import { Component, Input, Output, EventEmitter, inject, computed } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { SvgIconComponent } from '../../shared/components/svg-icon/svg-icon.component';
import { ChangePasswordDialogComponent } from './change-password-dialog.component';

// Thai labels สำหรับ breadcrumb (route segment → label)
const ROUTE_LABELS: Record<string, string> = {
  dashboard:          'แดชบอร์ด',
  users:              'จัดการผู้ใช้',
  projects:           'โครงการ',
  'house-models':     'แบบบ้าน',
  units:              'ยูนิต',
  'promotion-items':  'รายการโปรโมชั่น',
  sales:              'บันทึกการขาย',
  'sales-entry':      'บันทึกการขาย',
  budget:             'งบประมาณ',
  transfer:           'โอนงบประมาณ',
  movements:          'รายการเคลื่อนไหว',
  special:            'งบพิเศษ',
  'bottom-line':      'ราคาต้นทุน',
  import:             'Import ราคาต้นทุน',
  history:            'ประวัติ Import',
  mapping:            'ตั้งค่า Mapping',
  'fee-formulas':     'สูตรคำนวณ',
  policies:           'มาตรการ / นโยบาย',
  tester:             'ทดสอบสูตร',
  reports:            'รายงาน',
  settings:           'ตั้งค่า',
  'number-series':    'เลขที่เอกสาร',
};

@Component({
  selector: 'app-top-navigation',
  standalone: true,
  imports: [MatMenuModule, MatDividerModule, MatDialogModule, SvgIconComponent],
  templateUrl: './top-navigation.component.html',
  host: { class: 'block flex-shrink-0' },
})
export class TopNavigationComponent {
  @Input() isMobile = false;
  @Output() menuToggle = new EventEmitter<void>();

  private readonly auth   = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly theme          = inject(ThemeService);

  readonly currentUser = this.auth.currentUser;

  // Reactive URL signal via toSignal + NavigationEnd events
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  /** ชื่อหน้าปัจจุบัน (breadcrumb) — ใช้ segment สุดท้ายที่มี label */
  readonly breadcrumb = computed(() => {
    const url = this.currentUrl().split('?')[0];
    const segments = url.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const label = ROUTE_LABELS[segments[i]];
      if (label) return label;
    }
    return '';
  });

  /** อักษรย่อ (initials) สำหรับ avatar */
  readonly initials = computed(() => {
    const name = this.currentUser()?.name ?? '';
    return name.trim().charAt(0).toUpperCase() || '?';
  });

  openProfile(): void {
    // TODO: เปิด dialog โปรไฟล์ หรือ navigate ไปหน้า profile
  }

  openChangePassword(): void {
    this.dialog.open(ChangePasswordDialogComponent, {
      width: '420px',
      maxHeight: '90vh',
      disableClose: true,
    });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {},
      error: () => this.auth.clearSession(),
    });
  }
}
