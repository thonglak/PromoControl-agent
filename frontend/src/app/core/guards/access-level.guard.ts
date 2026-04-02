import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ProjectService } from '../services/project.service';

/**
 * accessLevelGuard — ตรวจ access_level ของ user สำหรับโครงการที่เลือก
 *
 * ใช้กับ routes ที่ต้องการ write access:
 *   { path: 'sales/create', canActivate: [authGuard, projectGuard, accessLevelGuard] }
 *
 * ถ้า access_level = 'view' → redirect /dashboard + SnackBar
 */
export const accessLevelGuard: CanActivateFn = () => {
  const projectService = inject(ProjectService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  if (projectService.canEdit()) {
    return true;
  }

  snackBar.open('คุณมีสิทธิ์ดูอย่างเดียว ไม่สามารถแก้ไขได้', 'ปิด', {
    duration: 4000,
    panelClass: ['snackbar-warn'],
  });

  return router.createUrlTree(['/dashboard']);
};
