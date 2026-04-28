import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'promo_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(true);

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light') {
      this.isDark.set(false);
    }
    this.apply();
  }

  toggle(): void {
    this.isDark.update(v => !v);
    localStorage.setItem(STORAGE_KEY, this.isDark() ? 'dark' : 'light');
    this.apply();
  }

  private apply(): void {
    document.documentElement.classList.toggle('dark-theme', this.isDark());
  }
}
