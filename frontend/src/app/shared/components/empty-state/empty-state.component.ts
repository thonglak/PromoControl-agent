import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, MatButtonModule, SvgIconComponent],
  template: `
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <div class="flex items-center justify-center rounded-full mb-4"
           style="width:64px; height:64px; background-color: var(--color-primary-100)">
        <app-icon [name]="icon()" style="width:32px;height:32px;color:var(--color-primary-500)" />
      </div>
      <p class="text-body-lg font-semibold text-gray-700 mb-1">{{ title() }}</p>
      @if (description()) {
        <p class="text-caption text-gray-500 max-w-sm">{{ description() }}</p>
      }
      @if (actionLabel()) {
        <button mat-flat-button color="primary" class="mt-4" (click)="actionClicked.emit()">
          <app-icon name="plus" class="mr-2" style="width:16px;height:16px" />
          {{ actionLabel() }}
        </button>
      }
    </div>
  `
})
export class EmptyStateComponent {
  icon = input<string>('inbox');
  title = input.required<string>();
  description = input<string>();
  actionLabel = input<string>();
  actionClicked = output<void>();
}
