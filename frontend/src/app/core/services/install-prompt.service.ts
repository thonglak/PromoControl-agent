import { Injectable, signal } from '@angular/core';

/**
 * InstallPromptService — ดักจับ event `beforeinstallprompt` (Chrome/Edge/Android)
 * เพื่อให้แอปแสดงปุ่ม "ติดตั้งแอป" ได้เองในเวลาที่เหมาะสม
 *
 * วิธีใช้:
 *   - bootstrap: เรียก `init()` ครั้งเดียวที่ AppComponent
 *   - UI: read signal `canInstall()` เพื่อโชว์ปุ่ม
 *         เรียก `prompt()` เมื่อ user กดปุ่ม
 *
 * หมายเหตุ Safari/iOS: ไม่มี event นี้ ต้องสอนให้ user กด Share → Add to Home Screen เอง
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** true เมื่อ browser ส่ง beforeinstallprompt และยังไม่ได้ติดตั้ง */
  private readonly canInstallSignal = signal(false);
  readonly canInstall = this.canInstallSignal.asReadonly();

  /** true เมื่อ user ติดตั้งแอปสำเร็จแล้ว (หรือเคยติดตั้งและเปิดในโหมด standalone) */
  private readonly installedSignal = signal(false);
  readonly installed = this.installedSignal.asReadonly();

  init(): void {
    // เปิดในโหมด standalone อยู่แล้ว = ติดตั้งแล้ว
    if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) {
      this.installedSignal.set(true);
      return;
    }

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstallSignal.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstallSignal.set(false);
      this.installedSignal.set(true);
    });
  }

  /** เปิด install dialog ของ browser — ต้องเรียกจาก user gesture เท่านั้น */
  async prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPrompt) return 'unavailable';
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstallSignal.set(false);
    return outcome;
  }
}
