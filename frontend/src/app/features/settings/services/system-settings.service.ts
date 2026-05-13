import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';

export interface SystemSetting {
  id: number;
  setting_key: string;
  setting_value: any;
  description: string | null;
  updated_by: number | null;
  updated_at: string | null;
}

/** schema ของแต่ละ key ฝั่ง frontend — label, type, validation, group */
export interface SettingSchema {
  key: string;
  label: string;
  group: string;
  type: 'percent' | 'number' | 'string' | 'boolean';
  description?: string;
  /** สำหรับ percent/number */
  min?: number;
  max?: number;
  step?: number;
  /** หน่วยที่จะแสดงข้าง input (เช่น %, บาท) */
  unit?: string;
}

/** Schema ของ setting ทุก key ที่ frontend รู้จัก — เพิ่ม key ใหม่ที่นี่ */
export const SYSTEM_SETTINGS_SCHEMA: SettingSchema[] = [
  {
    key: 'transfer_fee_percent',
    label: 'อัตราค่าธรรมเนียมโอนบวกเพิ่ม',
    group: 'การขาย',
    type: 'percent',
    description: 'ใช้คำนวณ default ของ "ค่าใช้จ่ายบวกเพิ่ม (ค่าธรรมเนียมโอน)" ใน sales-entry',
    min: 0,
    max: 99.99,
    step: 0.01,
    unit: '%',
  },
];

@Injectable({ providedIn: 'root' })
export class SystemSettingsService {
  private http = inject(HttpClient);

  /** in-memory cache ของทุก setting — key → value (decoded) */
  private cache = signal<Map<string, any>>(new Map());
  /** signal สำหรับ component subscribe (read-only) */
  readonly settings = this.cache.asReadonly();

  /** โหลด list ทั้งหมด — เรียกตอน app init หรือ refresh; cache อัตโนมัติ */
  list(): Observable<SystemSetting[]> {
    return this.http.get<{ data: SystemSetting[] }>('/api/system-settings').pipe(
      map(res => res.data),
      tap(rows => {
        const next = new Map<string, any>();
        for (const r of rows) next.set(r.setting_key, r.setting_value);
        this.cache.set(next);
      }),
    );
  }

  /** อ่านค่า cache ตาม key — คืน default ถ้าไม่พบ */
  getValue<T>(key: string, defaultValue: T): T {
    const map = this.cache();
    return map.has(key) ? (map.get(key) as T) : defaultValue;
  }

  /** อัปเดต setting — admin/manager only (backend enforce) */
  update(key: string, value: any): Observable<SystemSetting> {
    return this.http
      .put<{ message: string; data: SystemSetting }>(
        `/api/system-settings/${encodeURIComponent(key)}`,
        { setting_value: value },
      )
      .pipe(
        map(res => res.data),
        tap(row => {
          const next = new Map(this.cache());
          next.set(row.setting_key, row.setting_value);
          this.cache.set(next);
        }),
      );
  }
}
