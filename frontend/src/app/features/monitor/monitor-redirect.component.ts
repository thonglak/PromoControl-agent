import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * MonitorRedirectComponent — รองรับ start_url ของ PWA monitor (`/monitor/` ไม่มี token)
 *
 * เมื่อผู้ใช้ติดตั้ง PWA จาก /monitor/<token> manifest กำหนด start_url="." → resolve เป็น `/monitor/`
 * (ไม่มี token) ทำให้ Angular route `monitor/:token` ไม่ match แล้วตกไป fallback `**` = login
 *
 * Component นี้:
 *   - อ่าน token ล่าสุดที่ผู้ใช้เคยเข้าจาก localStorage
 *   - ถ้ามี → redirect ไป /monitor/<token>
 *   - ถ้าไม่มี → แสดงข้อความให้เปิดลิงค์เดิมที่ได้รับ
 */
@Component({
  selector: 'app-monitor-redirect',
  standalone: true,
  template: `
    <div class="h-screen flex items-center justify-center bg-slate-50 px-4">
      <div class="bg-white rounded-xl border border-slate-200 p-6 text-center max-w-sm">
        <p class="text-base font-medium text-slate-700">ไม่พบลิงค์ Monitor ที่บันทึกไว้</p>
        <p class="text-xs text-slate-400 mt-2">
          เปิดลิงค์ที่ได้รับจากผู้ดูแลระบบอีกครั้ง<br>
          เพื่อให้แอปจดจำลิงค์นี้
        </p>
      </div>
    </div>
  `,
})
export class MonitorRedirectComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    // ลำดับ: cookie ก่อน (iOS PWA แชร์ cookie กับ Safari เสมอ) แล้วค่อย localStorage
    const token = this.readCookie('monitor_last_token')
      ?? localStorage.getItem('monitor_last_token');
    if (token) {
      this.router.navigateByUrl(`/monitor/${token}`, { replaceUrl: true });
    }
  }

  private readCookie(name: string): string | null {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
}
