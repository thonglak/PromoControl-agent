import { Injectable, signal, computed } from '@angular/core';

const STORAGE_KEY = 'promo_font_size';

/** ระดับขนาดตัวอักษร — sm=14px, md=16px(default), lg=18px, xl=20px */
export type FontSize = 'sm' | 'md' | 'lg' | 'xl';

const ORDER: FontSize[] = ['sm', 'md', 'lg', 'xl'];

@Injectable({ providedIn: 'root' })
export class FontSizeService {
  private readonly _size = signal<FontSize>('md');
  readonly size = this._size.asReadonly();

  /** เพิ่ม/ลด ได้อีกหรือไม่ — ใช้ disable ปุ่ม */
  readonly canIncrease = computed(() => ORDER.indexOf(this._size()) < ORDER.length - 1);
  readonly canDecrease = computed(() => ORDER.indexOf(this._size()) > 0);

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY) as FontSize | null;
    if (saved && ORDER.includes(saved)) {
      this._size.set(saved);
    }
    this.apply();
  }

  increase(): void {
    const idx = ORDER.indexOf(this._size());
    if (idx < ORDER.length - 1) this.set(ORDER[idx + 1]);
  }

  decrease(): void {
    const idx = ORDER.indexOf(this._size());
    if (idx > 0) this.set(ORDER[idx - 1]);
  }

  reset(): void {
    this.set('md');
  }

  private set(size: FontSize): void {
    this._size.set(size);
    localStorage.setItem(STORAGE_KEY, size);
    this.apply();
  }

  private apply(): void {
    const html = document.documentElement;
    ORDER.forEach(s => html.classList.remove(`font-${s}`));
    html.classList.add(`font-${this._size()}`);
  }
}
