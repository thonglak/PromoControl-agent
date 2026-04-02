import { Injectable } from '@angular/core';
import { MomentDateAdapter } from '@angular/material-moment-adapter';
import { Moment } from 'moment';

const MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const MONTH_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const DAY_NARROW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DAY_SHORT = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

@Injectable()
export class ThaiCEDateAdapter extends MomentDateAdapter {

  private readConfig(): { yearFormat: 'ce' | 'be'; dateFormat: string } {
    try {
      const raw = localStorage.getItem('promo_date_format');
      if (raw) {
        const cfg = JSON.parse(raw);
        return { yearFormat: cfg.yearFormat ?? 'ce', dateFormat: cfg.dateFormat ?? 'medium' };
      }
    } catch {}
    return { yearFormat: 'ce', dateFormat: 'medium' };
  }

  private toYear(ceYear: number): number {
    return this.readConfig().yearFormat === 'be' ? ceYear + 543 : ceYear;
  }

  // ── บังคับ locale data เป็นไทยเสมอ ──────────────────────────────────
  override setLocale(locale: string): void {
    // เรียก parent ด้วย 'th' เสมอ เพื่อให้ _localeData เป็นภาษาไทย
    super.setLocale('th');
  }

  // ── ชื่อเดือน ──────────────────────────────────────────────────────
  override getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    return style === 'long' ? [...MONTH_LONG] : [...MONTH_SHORT];
  }

  // ── ชื่อวัน ────────────────────────────────────────────────────────
  override getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    if (style === 'narrow') return [...DAY_NARROW];
    return [...DAY_SHORT];
  }

  // ── format ────────────────────────────────────────────────────────
  override format(date: Moment, displayFormat: string): string {
    if (!date.isValid()) return '';

    const cfg = this.readConfig();
    const ceYear = date.year();
    const y = cfg.yearFormat === 'be' ? ceYear + 543 : ceYear;
    const d = date.date();
    const m = date.month();
    const dd = String(d).padStart(2, '0');
    const mm = String(m + 1).padStart(2, '0');

    // Calendar header "เดือน ปี"
    if (displayFormat === 'MMMM YYYY') {
      return `${MONTH_LONG[m]} ${y}`;
    }

    // Input field
    if (displayFormat === 'DD/MM/YYYY') {
      switch (cfg.dateFormat) {
        case 'short': return `${dd}/${mm}/${y}`;
        case 'long':  return `${d} ${MONTH_LONG[m]} ${y}`;
        case 'iso':   return `${y}-${mm}-${dd}`;
        case 'medium':
        default:      return `${d} ${MONTH_SHORT[m]} ${y}`;
      }
    }

    if (displayFormat === 'LL') return `${d} ${MONTH_LONG[m]} ${y}`;
    if (displayFormat === 'YYYY') return String(y);

    // Fallback
    const formatted = date.clone().locale('th').format(displayFormat);
    const beYear = ceYear + 543;
    return formatted.replace(String(beYear), String(y)).replace(String(ceYear), String(y));
  }

  // ── ปี ────────────────────────────────────────────────────────────
  override getYearName(date: Moment): string {
    return String(this.toYear(date.year()));
  }

  // ── parse: รับ input ทั้ง ค.ศ. และ พ.ศ. ──────────────────────────
  override parse(value: any, parseFormat: string | string[]): Moment | null {
    if (typeof value === 'string' && value.trim()) {
      const cfg = this.readConfig();
      const result = super.parse(value, parseFormat);
      if (result && result.isValid() && cfg.yearFormat === 'be' && result.year() > 2400) {
        result.year(result.year() - 543);
      }
      return result;
    }
    return super.parse(value, parseFormat);
  }
}
