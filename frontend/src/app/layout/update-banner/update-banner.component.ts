import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

import { SvgIconComponent } from '../../shared/components/svg-icon/svg-icon.component';
import { VersionCheckService } from '../../core/services/version-check.service';

/**
 * UpdateBannerComponent — แถบแจ้งเตือนเวอร์ชันใหม่ ด้านบนเว็บ
 * แสดงเมื่อ VersionCheckService.updateAvailable() === true และ user ยังไม่กด ปิด
 */
@Component({
  selector: 'app-update-banner',
  standalone: true,
  imports: [CommonModule, MatButtonModule, SvgIconComponent],
  template: `
    @if (versionCheck.updateAvailable() && !dismissed()) {
      <div class="flex items-center justify-between gap-3 px-4 py-2 text-sm"
        style="background-color: var(--color-primary-700); color: white;">
        <div class="flex items-center gap-2 min-w-0">
          <app-icon name="cloud-arrow-down" class="w-5 h-5 shrink-0" />
          <span class="truncate">
            พบเวอร์ชันใหม่ <span class="font-semibold tabular-nums">{{ versionCheck.latestVersion() }}</span>
            <span class="opacity-70 ml-1">(ปัจจุบัน {{ versionCheck.currentVersion }})</span>
            — โหลดใหม่เพื่อใช้งานรุ่นล่าสุด
          </span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button mat-flat-button
            class="!bg-white !text-primary-700 !h-8 !text-xs"
            (click)="reload()">
            <app-icon name="arrow-path" class="w-4 h-4 mr-1 inline-block" /> โหลดใหม่
          </button>
          <button type="button"
            class="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
            aria-label="ปิด"
            (click)="dismissed.set(true)">
            <app-icon name="x-mark" class="w-4 h-4" />
          </button>
        </div>
      </div>
    }
  `,
})
export class UpdateBannerComponent {
  protected versionCheck = inject(VersionCheckService);
  protected dismissed = signal(false);

  reload(): void {
    window.location.reload();
  }
}
