import { Injectable, inject, signal, computed } from '@angular/core';
import { DateAdapter } from '@angular/material/core';

export interface DateFormatConfig {
  dateFormat: 'medium' | 'short' | 'long' | 'iso';
  yearFormat: 'ce' | 'be';
  showTime: boolean;
}

const STORAGE_KEY = 'promo_date_format';

const DEFAULTS: DateFormatConfig = {
  dateFormat: 'medium',
  yearFormat: 'ce',
  showTime: false,
};

export const DATE_FORMAT_OPTIONS = [
  { value: 'medium', label: '18 มี.ค.', example: 'D MMM YYYY' },
  { value: 'short',  label: '18/03/',    example: 'DD/MM/YYYY' },
  { value: 'long',   label: '18 มีนาคม', example: 'D MMMM YYYY' },
  { value: 'iso',    label: '-03-18',    example: 'YYYY-MM-DD' },
] as const;

export const YEAR_FORMAT_OPTIONS = [
  { value: 'ce', label: 'ค.ศ. (2026)', description: 'คริสต์ศักราช' },
  { value: 'be', label: 'พ.ศ. (2569)', description: 'พุทธศักราช (+543)' },
] as const;

@Injectable({ providedIn: 'root' })
export class DateFormatService {
  private readonly adapter = inject(DateAdapter);
  private readonly _config = signal<DateFormatConfig>(this.load());

  /** ใช้เป็น counter เพิ่มทุกครั้งที่เปลี่ยนค่า — trigger pipe re-evaluation */
  readonly revision = signal(0);

  readonly config = this._config.asReadonly();
  readonly dateFormat = computed(() => this._config().dateFormat);
  readonly yearFormat = computed(() => this._config().yearFormat);
  readonly showTime = computed(() => this._config().showTime);

  update(partial: Partial<DateFormatConfig>): void {
    const next = { ...this._config(), ...partial };
    this._config.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    // เพิ่ม revision → trigger impure pipe
    this.revision.update(v => v + 1);

    // บังคับ DateAdapter re-render — emit localeChanges
    // adapter.setLocale เรียก super.setLocale('th') เสมอ
    // แต่ DateAdapter base class จะ emit localeChanges ทุกครั้งที่เรียก
    this.adapter.setLocale('th-refresh');
  }

  private load(): DateFormatConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULTS;
  }
}
