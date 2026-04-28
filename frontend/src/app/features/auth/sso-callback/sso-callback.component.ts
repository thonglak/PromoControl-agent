import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';

/**
 * SsoCallbackComponent — หน้ารับผล OAuth2 callback จาก Narai Connect
 *
 * Backend redirect มายังหน้านี้พร้อม query params:
 *   status=success&token=<access_token>   → login สำเร็จ
 *   status=error&message=<msg>            → เกิดข้อผิดพลาด
 *   status=forbidden&message=<msg>        → บัญชีถูกระงับ
 *
 * เมื่อ status=success:
 *   1. เก็บ access_token ใน memory + localStorage
 *   2. ดึงข้อมูล user ด้วย /api/auth/me
 *   3. Redirect ไปยัง /select-project
 */
@Component({
  selector: 'app-sso-callback',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="min-h-screen flex flex-col items-center justify-center gap-4"
         style="background-color: var(--color-bg)">
      @if (errorMessage) {
        <div class="text-center px-6">
          <p class="text-xl font-semibold mb-2" style="color: var(--color-error)">
            เกิดข้อผิดพลาด
          </p>
          <p class="text-sm mb-6" style="color: var(--color-gray-500)">{{ errorMessage }}</p>
          <button
            class="px-6 py-2 rounded-lg text-sm font-medium"
            style="background: var(--color-primary); color: white; cursor: pointer; border: none;"
            (click)="goToLogin()">
            กลับหน้าเข้าสู่ระบบ
          </button>
        </div>
      } @else {
        <mat-spinner diameter="40" />
        <p class="text-sm" style="color: var(--color-gray-500)">กำลังเข้าสู่ระบบ...</p>
      }
    </div>
  `,
})
export class SsoCallbackComponent implements OnInit {
  private readonly route  = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth   = inject(AuthService);
  private readonly snack  = inject(MatSnackBar);

  errorMessage = '';

  ngOnInit(): void {
    const params  = this.route.snapshot.queryParamMap;
    const status  = params.get('status') ?? '';
    const token   = params.get('token')  ?? '';
    const message = params.get('message') ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่';

    if (status === 'success' && token) {
      this.auth.handleSsoToken(token).then(() => {
        this.router.navigate(['/select-project']);
      }).catch(() => {
        this.errorMessage = 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้ กรุณาลองใหม่';
      });

    } else if (status === 'forbidden') {
      this.errorMessage = message;

    } else {
      this.errorMessage = message;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
