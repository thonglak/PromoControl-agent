import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProjectDashboardDialogComponent, ProjectDashboardDialogData } from './project-dashboard-dialog.component';

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
    <div class="h-screen overflow-y-auto bg-slate-50 px-4 py-6 sm:py-10">
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

          <!-- Refresh -->
          <div class="mt-6 flex justify-center">
            <button mat-stroked-button (click)="load()" [disabled]="refreshing()">
              @if (refreshing()) { <mat-spinner diameter="16" class="!inline-block mr-2" /> }
              รีเฟรชข้อมูล
            </button>
          </div>

          <p class="text-[10px] text-slate-400 mt-6 text-center leading-tight">
            หน้านี้เข้าถึงผ่านลิงค์สาธารณะ — ห้ามแชร์ลิงค์ออกนอกผู้ที่ได้รับอนุญาต
          </p>
        }

      </div>
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

  // refs สำหรับ cleanup
  private manifestLink: HTMLLinkElement | null = null;
  private manifestPrevHref: string | null = null;     // null = ไม่เคยมี element → ลบทิ้งตอน destroy
  private appleIcon: HTMLLinkElement | null = null;
  private appleIconPrevHref: string | null = null;
  private themeColorMeta: HTMLMetaElement | null = null;
  private appleCapableMeta: HTMLMetaElement | null = null;
  private appleStatusBarMeta: HTMLMetaElement | null = null;
  private appleTitleMeta: HTMLMetaElement | null = null;

  ngOnInit(): void {
    this.injectPwaHeadTags();
    this.registerServiceWorker();
    this.bindAutoLoad();
    this.load();
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('pageshow', this.onPageShow);

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

    this.themeColorMeta?.remove();
    this.appleCapableMeta?.remove();
    this.appleStatusBarMeta?.remove();
    this.appleTitleMeta?.remove();
  }

  private injectPwaHeadTags(): void {
    const head = document.head;

    // Manifest: ถ้ามี root manifest อยู่แล้ว ให้สลับ href แทนการ append ใหม่
    // — กัน browser เห็น 2 manifest แล้วเลือก scope ผิด (เคยทำให้ติดตั้งแล้วเปิดมาเข้าแอปหลัก)
    const existingManifest = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (existingManifest) {
      this.manifestLink = existingManifest;
      this.manifestPrevHref = existingManifest.href;
      existingManifest.href = '/monitor/manifest.webmanifest';
    } else {
      this.manifestLink = document.createElement('link');
      this.manifestLink.rel = 'manifest';
      this.manifestLink.href = '/monitor/manifest.webmanifest';
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

    this.themeColorMeta = document.createElement('meta');
    this.themeColorMeta.name = 'theme-color';
    this.themeColorMeta.content = '#0F4C81';
    head.appendChild(this.themeColorMeta);

    this.appleCapableMeta = document.createElement('meta');
    this.appleCapableMeta.name = 'apple-mobile-web-app-capable';
    this.appleCapableMeta.content = 'yes';
    head.appendChild(this.appleCapableMeta);

    this.appleStatusBarMeta = document.createElement('meta');
    this.appleStatusBarMeta.name = 'apple-mobile-web-app-status-bar-style';
    this.appleStatusBarMeta.content = 'default';
    head.appendChild(this.appleStatusBarMeta);

    this.appleTitleMeta = document.createElement('meta');
    this.appleTitleMeta.name = 'apple-mobile-web-app-title';
    this.appleTitleMeta.content = 'Monitor';
    head.appendChild(this.appleTitleMeta);
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
        try { localStorage.setItem('monitor_last_token', token); } catch {}
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
