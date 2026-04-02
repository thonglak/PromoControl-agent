import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../services/auth.service';

/**
 * roleGuard — ตรวจสิทธิ์ตาม role ของ user
 *
 * กำหนดใน route data:
 *   { path: 'users', canActivate: [roleGuard], data: { roles: ['admin'] } }
 *
 * ถ้า user role ไม่อยู่ใน allowed roles → redirect /dashboard + SnackBar
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  const allowedRoles = (route.data['roles'] as string[] | undefined) ?? [];
  const userRole = auth.currentUser()?.role ?? '';

  // ถ้าไม่ได้กำหนด roles หรือ user อยู่ใน allowed roles → ผ่าน
  if (allowedRoles.length === 0 || allowedRoles.includes(userRole)) {
    return true;
  }

  snackBar.open('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้', 'ปิด', {
    duration: 4000,
    panelClass: ['snackbar-error'],
  });

  return router.createUrlTree(['/dashboard']);
};
