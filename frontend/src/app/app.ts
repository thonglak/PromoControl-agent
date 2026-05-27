import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SelectOnFocusService } from './core/services/select-on-focus.service';
import { InstallPromptService } from './core/services/install-prompt.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App implements OnInit {
  // trigger instantiation — service hook document focus listener ใน constructor
  private readonly _selectOnFocus = inject(SelectOnFocusService);
  private readonly installPrompt = inject(InstallPromptService);

  ngOnInit(): void {
    this.installPrompt.init();
    this.registerServiceWorker();
  }

  /**
   * ลงทะเบียน SW หลัก (scope=/) เฉพาะ production
   * — ไม่ลงทะเบียนเมื่ออยู่ใต้ /monitor/* เพราะมี SW เฉพาะของ monitor อยู่แล้ว
   * — dev mode ข้ามไป เพื่อให้ HMR / live reload ทำงานได้
   */
  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) return;
    if (!environment.production) return;
    if (location.pathname.startsWith('/monitor')) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // silent fail — PWA installable เป็น optional enhancement
      });
    });
  }
}
