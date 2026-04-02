import { Pipe, PipeTransform, inject } from '@angular/core';
import { DateFormatService } from '../../core/services/date-format.service';

const MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const MONTH_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/**
 * Format วันที่ — อ่านค่า dateFormat + yearFormat จาก localStorage
 */
export function formatThaiDate(
  value: string | Date | null | undefined,
  mode: string = 'medium',
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '—';

  const d = date.getDate();
  const m = date.getMonth();
  const ceYear = date.getFullYear();
  const dd = String(d).padStart(2, '0');
  const mm = String(m + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const time = ` ${hh}:${min}`;

  // อ่าน config จาก localStorage
  let fmt = mode;
  let appendTime = false;
  let yearFmt: 'ce' | 'be' = 'ce';

  if (fmt === 'auto' || fmt === 'auto-datetime') {
    try {
      const raw = localStorage.getItem('promo_date_format');
      if (raw) {
        const cfg = JSON.parse(raw);
        fmt = cfg.dateFormat ?? 'medium';
        yearFmt = cfg.yearFormat ?? 'ce';
        appendTime = mode === 'auto-datetime' ? true : !!cfg.showTime;
      } else {
        fmt = 'medium';
      }
    } catch {
      fmt = 'medium';
    }
  } else {
    // non-auto modes: still read yearFormat from storage
    try {
      const raw = localStorage.getItem('promo_date_format');
      if (raw) {
        const cfg = JSON.parse(raw);
        yearFmt = cfg.yearFormat ?? 'ce';
      }
    } catch {}
  }

  if (fmt === 'datetime') {
    const y = yearFmt === 'be' ? ceYear + 543 : ceYear;
    return `${d} ${MONTH_SHORT[m]} ${y}${time}`;
  }

  const y = yearFmt === 'be' ? ceYear + 543 : ceYear;

  let result: string;
  switch (fmt) {
    case 'short':
      result = `${dd}/${mm}/${y}`;
      break;
    case 'long':
      result = `${d} ${MONTH_LONG[m]} ${y}`;
      break;
    case 'iso':
      result = `${y}-${mm}-${dd}`;
      break;
    case 'medium':
    default:
      result = `${d} ${MONTH_SHORT[m]} ${y}`;
      break;
  }
  return appendTime ? result + time : result;
}

@Pipe({ name: 'thaiDate', standalone: true, pure: false })
export class ThaiDatePipe implements PipeTransform {
  private dateFmtSvc = inject(DateFormatService);

  transform(value: string | Date | null | undefined, mode?: string): string {
    // อ่าน signals ทั้งหมดเพื่อ trigger change detection เมื่อค่าเปลี่ยน
    const _fmt = this.dateFmtSvc.dateFormat();
    const _year = this.dateFmtSvc.yearFormat();
    const _time = this.dateFmtSvc.showTime();
    const _rev = this.dateFmtSvc.revision();

    const effectiveMode = mode ?? _fmt;
    return formatThaiDate(value, effectiveMode);
  }
}
