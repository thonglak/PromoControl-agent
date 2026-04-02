import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

@Component({
  selector: 'app-section-card',
  host: { class: 'block' },
  standalone: true,
  imports: [CommonModule, SvgIconComponent],
  template: `
    <div class="section-card" [class.p-0]="noPadding()">
      @if (title()) {
        <div class="flex items-center justify-between mb-4"
             [class.px-6]="noPadding()" [class.pt-6]="noPadding()">
          <div class="flex items-center gap-2">
            @if (icon()) {
              <app-icon [name]="icon()!" class="w-5 h-5 text-primary-500" />
            }
            <h3 class="section-title m-0" style="font-size: var(--font-size-card-title)">
              {{ title() }}
            </h3>
          </div>
          <ng-content select="[card-actions]" />
        </div>
      }
      <ng-content />
    </div>
  `
})
export class SectionCardComponent {
  title = input<string>();
  icon = input<string>();
  noPadding = input<boolean>(false);
}
