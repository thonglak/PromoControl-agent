import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * VersionCheckService — poll /version.json เป็นระยะ เปรียบเทียบกับ environment.version
 *
 * ถ้าต่างกัน → emit signal updateAvailable เพื่อให้ UI แสดง banner
 * หยุด poll หลังพบความต่างครั้งแรก (ไม่จำเป็นต้องตรวจซ้ำ)
 */
@Injectable({ providedIn: 'root' })
export class VersionCheckService implements OnDestroy {
  private http = inject(HttpClient);

  /** version ที่ user ถืออยู่ (build-time) */
  readonly currentVersion = environment.version;

  /** version ล่าสุดที่ตรวจพบบน server (อาจเท่ากับ current หรือใหม่กว่า) */
  private latestVersionSignal = signal<string>(environment.version);
  readonly latestVersion = this.latestVersionSignal.asReadonly();

  /** true เมื่อ server มี version ใหม่กว่า bundle ที่ user ถืออยู่ */
  private updateAvailableSignal = signal<boolean>(false);
  readonly updateAvailable = this.updateAvailableSignal.asReadonly();

  private timer: any = null;
  /** poll ทุก 5 นาที — สำหรับ web app ภายใน */
  private readonly POLL_INTERVAL_MS = 5 * 60 * 1000;

  /** เริ่ม poll — เรียกครั้งเดียวที่ app root */
  start(): void {
    if (this.timer != null) return; // กันเรียกซ้ำ
    this.check();
    this.timer = setInterval(() => this.check(), this.POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Fetch ครั้งเดียว (cache-busted) — เรียกเองได้ */
  private check(): void {
    // cache-busting + no-store เพื่อให้ได้ค่าล่าสุดจริงๆ ไม่เอาจาก browser/CDN
    const url = `/version.json?t=${Date.now()}`;
    this.http.get<{ version: string }>(url, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    }).subscribe({
      next: data => {
        const remote = String(data?.version ?? '').trim();
        if (!remote) return;
        this.latestVersionSignal.set(remote);
        if (remote !== this.currentVersion) {
          this.updateAvailableSignal.set(true);
          this.stop(); // ไม่ต้อง poll ต่อ
        }
      },
      error: () => {
        // network/CORS error → silent (poll รอบหน้า)
      },
    });
  }
}
