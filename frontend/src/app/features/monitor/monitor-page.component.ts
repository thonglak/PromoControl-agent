import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProjectDashboardDialogComponent, ProjectDashboardDialogData } from './project-dashboard-dialog.component';
import { environment } from '../../../environments/environment';

interface ProjectKpi {
  project: { id?: number; code: string; name: string };
  budget_remaining: { total: number; new_system: number; legacy: number };
  profit: { total: number; new_system: number; legacy: number };
  sold_count: { total: number; active: number; legacy: number };
  legacy_as_of: string | null;
}

interface MonitorData {
  link: { name: string };
  projects: ProjectKpi[];
  fetched_at: string;
}

@Component({
  selector: 'app-monitor-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="h-screen overflow-y-auto bg-slate-50 px-4 pt-6 pb-32 sm:pt-10 sm:pb-16"
         style="padding-bottom: max(8rem, env(safe-area-inset-bottom, 0) + 8rem);">
      <div class="mx-auto" style="max-width: 480px;">

        @if (loading()) {
          <div class="flex flex-col items-center justify-center py-20 gap-3">
            <mat-spinner diameter="36" />
            <p class="text-sm text-slate-500">กำลังโหลดข้อมูล…</p>
          </div>
        } @else if (error()) {
          <div class="bg-white rounded-xl border border-red-200 p-6 text-center">
            <p class="text-base font-medium text-red-700">{{ error() }}</p>
            <p class="text-xs text-slate-400 mt-2">ลิงค์อาจถูกเพิกถอน หรือไม่ถูกต้อง</p>
          </div>
        } @else if (data(); as d) {

          <!-- Link header -->
          <div class="mb-5 text-center">
            <p class="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Monitor</p>
            <h1 class="text-lg sm:text-xl font-semibold text-slate-700 mt-1">{{ d.link.name }}</h1>
            <p class="text-[11px] text-slate-400 mt-1.5">
              ข้อมูล ณ {{ d.fetched_at }} · {{ d.projects.length }} โครงการ
            </p>
          </div>

          <!-- Project sections (stacked) -->
          <div class="space-y-6">
            @for (p of d.projects; track p.project.code) {
              <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-primary-300 hover:shadow-sm transition-all cursor-pointer"
                   (click)="openProjectDashboard(p)">
                <!-- Project header -->
                <div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                      <span class="font-mono text-xs text-slate-500">{{ p.project.code }}</span>
                      <span class="text-slate-300">·</span>
                      <span class="text-sm font-medium text-slate-800 truncate">{{ p.project.name }}</span>
                    </div>
                    @if (p.legacy_as_of) {
                      <p class="text-[10px] text-slate-400 mt-0.5">ระบบเก่า ณ {{ p.legacy_as_of }}</p>
                    }
                  </div>
                  <span class="text-[10px] text-primary-600 font-medium whitespace-nowrap">ดู Dashboard →</span>
                </div>

                <!-- Compact KPI strip -->
                <div class="flex flex-wrap sm:flex-nowrap sm:divide-x sm:divide-slate-100">

                  <!-- งบคงเหลือรวม (X) -->
                  <div class="w-1/2 sm:flex-1 px-4 py-3 flex flex-col gap-0.5 border-b border-r border-slate-100 sm:border-b-0 sm:border-r-0">
                    <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wide leading-none">งบคงเหลือรวม (X)</span>
                    <span class="text-sm font-semibold tabular-nums mt-1.5"
                          [class.text-blue-600]="p.budget_remaining.total >= 0"
                          [class.text-red-600]="p.budget_remaining.total < 0">
                      ฿{{ p.budget_remaining.total | number:'1.0-0' }}
                    </span>
                    <p class="text-[10px] text-slate-400 mt-0.5 leading-tight">
                      ใหม่ <span class="font-mono tabular-nums text-slate-600">฿{{ p.budget_remaining.new_system | number:'1.0-0' }}</span><br>
                      เก่า <span class="font-mono tabular-nums text-slate-600">฿{{ p.budget_remaining.legacy | number:'1.0-0' }}</span>
                    </p>
                  </div>

                  <!-- กำไร (Y) -->
                  <div class="w-1/2 sm:flex-1 px-4 py-3 flex flex-col gap-0.5 border-b border-slate-100 sm:border-b-0">
                    <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wide leading-none">กำไร (Y)</span>
                    <span class="text-sm font-semibold tabular-nums mt-1.5"
                          [class.text-green-600]="p.profit.total >= 0"
                          [class.text-red-600]="p.profit.total < 0">
                      ฿{{ p.profit.total | number:'1.0-0' }}
                    </span>
                    <p class="text-[10px] text-slate-400 mt-0.5 leading-tight">
                      ใหม่ <span class="font-mono tabular-nums text-slate-600">฿{{ p.profit.new_system | number:'1.0-0' }}</span><br>
                      เก่า <span class="font-mono tabular-nums text-slate-600">฿{{ p.profit.legacy | number:'1.0-0' }}</span>
                    </p>
                  </div>

                  <!-- จำนวนขายแล้วรวม (full-width on mobile — odd count) -->
                  <div class="w-full sm:flex-1 px-4 py-3 flex flex-col gap-0.5 border-t border-slate-100 sm:border-t-0">
                    <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wide leading-none">จำนวนขายแล้วรวม</span>
                    <div class="flex items-baseline gap-1 mt-1.5">
                      <span class="text-sm font-semibold tabular-nums text-slate-800">{{ p.sold_count.total | number }}</span>
                      <span class="text-xs text-slate-400">ยูนิต</span>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-0.5 leading-tight">
                      ใหม่ <span class="font-mono tabular-nums text-slate-600">{{ p.sold_count.active | number }}</span>
                      · เก่า <span class="font-mono tabular-nums text-slate-600">{{ p.sold_count.legacy | number }}</span>
                    </p>
                  </div>

                </div>
              </div>
            }
          </div>

          <!-- Refresh + Install -->
          <div class="mt-6 flex flex-wrap justify-center gap-2">
            <button mat-stroked-button (click)="load()" [disabled]="refreshing()">
              @if (refreshing()) { <mat-spinner diameter="16" class="!inline-block mr-2" /> }
              รีเฟรชข้อมูล
            </button>
            @if (!isInstalled() && (canInstall() || isIOS())) {
              <button mat-flat-button color="primary" (click)="installApp()">
                ติดตั้งแอป
              </button>
            }
          </div>

          <p class="text-[10px] text-slate-400 mt-6 text-center leading-tight">
            หน้านี้เข้าถึงผ่านลิงค์สาธารณะ — ห้ามแชร์ลิงค์ออกนอกผู้ที่ได้รับอนุญาต
          </p>

          <!-- version footer + พื้นที่ว่างกัน address bar บัง -->
          <p class="text-[10px] text-slate-300 mt-3 text-center font-mono tabular-nums">
            v{{ version }}
          </p>
        }

      </div>

      <!-- iOS install instructions sheet -->
      @if (showIOSHint()) {
        <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-6 sm:pb-0"
             (click)="closeIOSHint()">
          <div class="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 shadow-xl"
               (click)="$event.stopPropagation()">
            <h2 class="text-base font-semibold text-slate-800 m-0">ติดตั้งแอปบน iOS</h2>
            <ol class="text-sm text-slate-600 mt-3 pl-5 leading-relaxed list-decimal">
              <li>กดปุ่ม <span class="font-semibold">Share</span> (สี่เหลี่ยมมีลูกศรขึ้น) ด้านล่างของ Safari</li>
              <li>เลื่อนหาเมนู <span class="font-semibold">Add to Home Screen</span></li>
              <li>กด <span class="font-semibold">Add</span> มุมขวาบน</li>
            </ol>
            <p class="text-xs text-slate-400 mt-3 m-0">
              หมายเหตุ: ต้องเปิดผ่าน Safari เท่านั้น (ไม่ใช่ Chrome iOS)
            </p>
            <div class="mt-4 flex justify-end">
              <button mat-stroked-button (click)="closeIOSHint()">ปิด</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class MonitorPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<MonitorData | null>(null);
  readonly token = signal<string>('');
  readonly version = environment.version;

  // PWA install state
  readonly canInstall = signal(false);
  readonly isInstalled = signal(false);
  readonly isIOS = signal(false);
  readonly showIOSHint = signal(false);
  private deferredPrompt: any = null;

  // refs สำหรับ cleanup
  private manifestLink: HTMLLinkElement | null = null;
  private manifestPrevHref: string | null = null;     // null = ไม่เคยมี element → ลบทิ้งตอน destroy
  private appleIcon: HTMLLinkElement | null = null;
  private appleIconPrevHref: string | null = null;
  // apple-mobile-web-app-title มีอยู่แล้วใน index.html ค่า "PromoControl" (ของแอปหลัก)
  // ต้องสลับ content ตอนเข้า monitor ไม่งั้น iOS เพิ่มบนหน้าจอโฮมเป็นชื่อผิด
  private appleTitleMeta: HTMLMetaElement | null = null;
  private appleTitlePrevContent: string | null = null;
  private docTitlePrev: string | null = null;

  ngOnInit(): void {
    this.injectPwaHeadTags();
    this.registerServiceWorker();
    this.bindAutoLoad();
    this.bindInstallPrompt();
    this.load();
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('pageshow', this.onPageShow);
    window.removeEventListener('beforeinstallprompt', this.onBeforeInstall);
    window.removeEventListener('appinstalled', this.onAppInstalled);

    // Manifest/Apple icon: ถ้าเคยมีอยู่แล้ว (root index.html) restore href เดิม
    // ถ้าเราเป็นคนสร้างขึ้นมาเอง (prev=null) ก็ลบทิ้ง
    if (this.manifestLink) {
      if (this.manifestPrevHref !== null) this.manifestLink.href = this.manifestPrevHref;
      else this.manifestLink.remove();
    }
    if (this.appleIcon) {
      if (this.appleIconPrevHref !== null) this.appleIcon.href = this.appleIconPrevHref;
      else this.appleIcon.remove();
    }

    // restore apple title meta + document.title
    if (this.appleTitleMeta) {
      if (this.appleTitlePrevContent !== null) this.appleTitleMeta.content = this.appleTitlePrevContent;
      else this.appleTitleMeta.remove();
    }
    if (this.docTitlePrev !== null) document.title = this.docTitlePrev;
  }

  private injectPwaHeadTags(): void {
    const head = document.head;

    // ใช้ static manifest (/monitor/manifest.webmanifest) เพื่อให้ browser install criteria
    // ผ่านได้แน่นอน — Chrome บางเวอร์ชันไม่ install จาก blob: URL
    // start_url=. ใน manifest จะ resolve เป็น /monitor/ → nginx serve /monitor/index.html
    // (static file ทำ JS redirect ไป /monitor/<token> โดยอ่าน localStorage)
    const manifestUrl = '/monitor/manifest.webmanifest';

    // Manifest: ถ้ามี root manifest อยู่แล้ว ให้สลับ href แทนการ append ใหม่
    // — กัน browser เห็น 2 manifest แล้วเลือก scope ผิด
    const existingManifest = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (existingManifest) {
      this.manifestLink = existingManifest;
      this.manifestPrevHref = existingManifest.href;
      existingManifest.href = manifestUrl;
    } else {
      this.manifestLink = document.createElement('link');
      this.manifestLink.rel = 'manifest';
      this.manifestLink.href = manifestUrl;
      this.manifestPrevHref = null;
      head.appendChild(this.manifestLink);
    }

    // Apple touch icon: เช่นกัน — สลับ href ของตัวเดิม
    const existingAppleIcon = head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (existingAppleIcon) {
      this.appleIcon = existingAppleIcon;
      this.appleIconPrevHref = existingAppleIcon.href;
      existingAppleIcon.href = '/monitor/apple-touch-icon.png';
    } else {
      this.appleIcon = document.createElement('link');
      this.appleIcon.rel = 'apple-touch-icon';
      this.appleIcon.href = '/monitor/apple-touch-icon.png';
      this.appleIconPrevHref = null;
      head.appendChild(this.appleIcon);
    }

    // theme-color / apple-mobile-web-app-capable / status-bar-style
    // ค่าตรงกับ index.html อยู่แล้ว ไม่ต้อง inject ซ้ำ (ป้องกัน meta tag duplicate)

    // apple-mobile-web-app-title: index.html ตั้ง "PromoControl" — สลับเป็นชื่อ monitor
    // (iOS Safari ใช้ค่านี้เป็นชื่อบนหน้าจอโฮม ตอนกด Add to Home Screen)
    const existingTitle = head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (existingTitle) {
      this.appleTitleMeta = existingTitle;
      this.appleTitlePrevContent = existingTitle.content;
      existingTitle.content = 'PromoControl Monitor';
    } else {
      this.appleTitleMeta = document.createElement('meta');
      this.appleTitleMeta.name = 'apple-mobile-web-app-title';
      this.appleTitleMeta.content = 'PromoControl Monitor';
      this.appleTitlePrevContent = null;
      head.appendChild(this.appleTitleMeta);
    }

    // document.title — เผื่อ iOS เก่าๆ ที่ fallback ใช้ <title> ตอน Add to Home Screen
    this.docTitlePrev = document.title;
    document.title = 'PromoControl Monitor';
  }

  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/monitor/sw.js', { scope: '/monitor/' }).catch(() => {
      // เงียบ ถ้า register ไม่ได้ (เช่น http localhost) — ไมฺ่ block UI
    });
  }

  private bindAutoLoad(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('pageshow', this.onPageShow);
  }

  private bindInstallPrompt(): void {
    // ตรวจว่าเปิดในโหมด standalone (ติดตั้งแล้ว) — ทั้ง Android และ iOS
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    if (standalone) {
      this.isInstalled.set(true);
      return;
    }

    // iOS Safari: ไม่มี beforeinstallprompt — ต้องสอน user กด Share → Add to Home Screen
    const ua = navigator.userAgent;
    const iosLike = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    this.isIOS.set(iosLike);

    window.addEventListener('beforeinstallprompt', this.onBeforeInstall);
    window.addEventListener('appinstalled', this.onAppInstalled);
  }

  private onBeforeInstall = (e: Event): void => {
    e.preventDefault();
    this.deferredPrompt = e;
    this.canInstall.set(true);
  };

  private onAppInstalled = (): void => {
    this.deferredPrompt = null;
    this.canInstall.set(false);
    this.isInstalled.set(true);
  };

  async installApp(): Promise<void> {
    // iOS: เปิด instruction sheet
    if (this.isIOS()) {
      this.showIOSHint.set(true);
      return;
    }
    if (!this.deferredPrompt) return;
    await this.deferredPrompt.prompt();
    try { await this.deferredPrompt.userChoice; } catch {}
    this.deferredPrompt = null;
    this.canInstall.set(false);
  }

  closeIOSHint(): void { this.showIOSHint.set(false); }

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.load();
  };
  private onFocus = (): void => { this.load(); };
  private onPageShow = (e: PageTransitionEvent): void => {
    // bfcache restore → reload
    if (e.persisted) this.load();
  };

  load(): void {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.token.set(token);
    if (token === '') {
      this.loading.set(false);
      this.error.set('ลิงค์ไม่ถูกต้อง');
      return;
    }
    const first = this.data() === null;
    if (first) this.loading.set(true); else this.refreshing.set(true);

    this.http.get<MonitorData>(`/api/public/monitor/${token}`).subscribe({
      next: res => {
        // จดจำ token ล่าสุดสำหรับกรณี PWA เปิดที่ /monitor/ (start_url ไม่มี token)
        // เซ็ตทั้ง cookie + localStorage:
        // - cookie แชร์ระหว่าง Safari และ iOS PWA standalone เสมอ
        // - localStorage สำรองเผื่อ cookie โดน block (3rd party cookie)
        try {
          localStorage.setItem('monitor_last_token', token);
          document.cookie = 'monitor_last_token=' + encodeURIComponent(token)
            + '; path=/; max-age=31536000; SameSite=Lax';
        } catch {}
        this.data.set(res);
        this.error.set(null);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: err => {
        const msg = err?.error?.messages?.error ?? 'ไม่สามารถโหลดข้อมูลได้';
        this.error.set(typeof msg === 'string' ? msg : 'ไม่สามารถโหลดข้อมูลได้');
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }

  openProjectDashboard(p: ProjectKpi): void {
    if (!p.project.id) return;
    this.dialog.open(ProjectDashboardDialogComponent, {
      data: {
        token: this.token(),
        projectId: p.project.id,
        projectCode: p.project.code,
        projectName: p.project.name,
      } satisfies ProjectDashboardDialogData,
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'monitor-dashboard-dialog',
    });
  }
}
