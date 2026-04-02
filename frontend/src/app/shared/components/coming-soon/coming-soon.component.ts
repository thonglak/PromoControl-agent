import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [SvgIconComponent],
  template: `
    <div class="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-6">
        <app-icon name="wrench-screwdriver" class="w-8 h-8 text-slate-400" />
      </div>
      <h2 class="text-xl font-semibold text-slate-700 mb-2">กำลังพัฒนา</h2>
      <p class="text-sm text-slate-500 max-w-md">
        ฟีเจอร์นี้อยู่ระหว่างการพัฒนา จะเปิดให้ใช้งานเร็วๆ นี้
      </p>
    </div>
  `,
})
export class ComingSoonComponent {}
