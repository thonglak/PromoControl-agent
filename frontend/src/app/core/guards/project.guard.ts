import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ProjectService } from '../services/project.service';

/**
 * projectGuard — ตรวจว่า user เลือก project แล้วหรือยัง
 * ถ้ายังไม่เลือก → redirect /select-project
 */
export const projectGuard: CanActivateFn = () => {
  const projectService = inject(ProjectService);
  const router = inject(Router);

  return projectService.selectedProject() !== null
    ? true
    : router.createUrlTree(['/select-project']);
};
