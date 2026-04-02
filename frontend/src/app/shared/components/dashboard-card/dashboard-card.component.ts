import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

@Component({
  selector: 'app-dashboard-card',
  standalone: true,
  imports: [CommonModule, SvgIconComponent],
  template: `
    <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex items-start gap-4">
      <!-- Icon -->
      <div class="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center" [style.background-color]="iconBg">
        <app-icon [name]="icon" class="w-6 h-6" [style.color]="color"></app-icon>
      </div>
      <!-- Content -->
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-slate-500 mb-1">{{ title }}</p>
        <p class="text-2xl font-bold leading-tight" [style.color]="color">{{ formattedValue }}</p>
        @if (subtitle) {
          <p class="text-xs text-slate-400 mt-1">{{ subtitle }}</p>
        }
      </div>
    </div>
  `,
})
export class DashboardCardComponent {
  @Input() title = '';
  @Input() icon = 'chart-bar';
  @Input() color = '#16324F';
  @Input() subtitle?: string;

  // Can pass either a number (currency) or a pre-formatted string
  @Input() set value(v: number | string) {
    if (typeof v === 'number') {
      this.formattedValue = new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(v).replace('THB', '฿').replace(/\s/g, '');
    } else {
      this.formattedValue = v;
    }
  }

  formattedValue = '—';

  get iconBg(): string {
    return this.color + '1A'; // 10% opacity hex
  }
}
