import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule, SvgIconComponent],
  template: `
    <div class="section-card flex items-start justify-between">
      <div class="flex-1">
        <p class="text-caption text-gray-500 mb-1">{{ label() }}</p>
        <p class="kpi-number" [style.color]="valueColor()">
          {{ formattedValue() }}
        </p>
        @if (description()) {
          <p class="text-caption mt-2" [style.color]="descriptionColor()">
            {{ description() }}
          </p>
        }
      </div>
      <div class="flex items-center justify-center rounded-lg"
           [style.width.px]="48" [style.height.px]="48"
           [style.background-color]="iconBgColor()">
        <app-icon [name]="icon()" class="text-white" style="width:24px;height:24px" />
      </div>
    </div>
  `
})
export class StatCardComponent {
  label = input.required<string>();
  value = input.required<string | number>();
  icon = input<string>('chart-bar');
  variant = input<'default' | 'profit' | 'loss' | 'discount' | 'budget' | 'accent'>('default');
  description = input<string>();
  prefix = input<string>('');
  suffix = input<string>('');

  formattedValue = computed(() => {
    const v = this.value();
    if (typeof v === 'number') {
      const formatted = Math.abs(v).toLocaleString('th-TH');
      return `${this.prefix()}${v < 0 ? '-' : ''}${formatted}${this.suffix()}`;
    }
    return `${this.prefix()}${v}${this.suffix()}`;
  });

  valueColor = computed(() => {
    const map: Record<string, string> = {
      default: 'var(--color-text-primary)',
      profit: 'var(--color-profit)',
      loss: 'var(--color-loss)',
      discount: 'var(--color-discount)',
      budget: 'var(--color-budget)',
      accent: 'var(--color-accent)',
    };
    return map[this.variant()];
  });

  iconBgColor = computed(() => {
    const map: Record<string, string> = {
      default: 'var(--color-primary)',
      profit: 'var(--color-profit)',
      loss: 'var(--color-loss)',
      discount: 'var(--color-discount)',
      budget: 'var(--color-budget)',
      accent: 'var(--color-accent)',
    };
    return map[this.variant()];
  });

  descriptionColor = computed(() => 'var(--color-gray-500)');
}
