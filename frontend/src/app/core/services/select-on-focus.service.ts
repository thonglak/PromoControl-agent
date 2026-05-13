import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/**
 * SelectOnFocusService — auto select-all เมื่อ focus input ที่ค่า empty หรือ 0
 *
 * จุดประสงค์: ลด friction การกรอกตัวเลข — user ไม่ต้องลบ "0" ก่อนพิมพ์
 * Register listener ที่ document (capture=true) → ครอบคลุมทุก input ทั้งแอป
 * โดยไม่ต้องไปแก้แต่ละ component
 */
@Injectable({ providedIn: 'root' })
export class SelectOnFocusService {
  private doc = inject(DOCUMENT);

  /** type ที่ไม่เหมาะกับ select-all (button-like, date picker, password, ฯลฯ) */
  private static readonly SKIP_TYPES = new Set([
    'checkbox', 'radio', 'file', 'range', 'color',
    'button', 'submit', 'reset', 'image',
    'date', 'time', 'datetime-local', 'month', 'week',
    'password',
  ]);

  constructor() {
    // capture=true → จับ focus ก่อน mat-input/browser ปรับ selection
    this.doc.addEventListener('focus', this.onFocus, true);
  }

  private onFocus = (e: Event): void => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (SelectOnFocusService.SKIP_TYPES.has(el.type)) return;
    if (el.readOnly || el.disabled) return;
    if (!this.isEmptyOrZero(el.value)) return;

    // setTimeout 0 — กัน Material/browser reset selection หลัง focus event
    setTimeout(() => {
      if (this.doc.activeElement === el) el.select();
    }, 0);
  };

  /** ค่าถือว่า "empty หรือ 0" เมื่อ:
   *  - ว่างเปล่า
   *  - parse แล้วเป็นเลข 0 (รองรับ "0", "0.00", "฿0", "0%" ฯลฯ)
   *  - text อย่าง "abc" → cleaned="" → parseFloat=NaN → ไม่ถือว่า 0 (ไม่ select) */
  private isEmptyOrZero(value: string): boolean {
    if (value === '') return true;
    const cleaned = value.replace(/[^\d.-]/g, '');
    if (cleaned === '') return false;
    const num = parseFloat(cleaned);
    return !isNaN(num) && num === 0;
  }
}
