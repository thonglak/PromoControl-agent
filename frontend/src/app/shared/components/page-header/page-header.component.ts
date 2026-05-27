import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectService } from '../../../core/services/project.service';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-6">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 class="page-title m-0">{{ title() }}</h1>
          @if (projectBadge(); as badge) {
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium leading-tight"
                  [title]="badge.full">
              <span class="font-mono">{{ badge.code }}</span>
              <span class="text-slate-300">·</span>
              <span class="truncate max-w-[180px] sm:max-w-[320px]">{{ badge.name }}</span>
            </span>
          }
        </div>
        @if (subtitle()) {
          <p class="text-caption text-gray-500 mt-1">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <ng-content select="[actions]" />
      </div>
    </div>
  `
})
export class PageHeaderComponent {
  private readonly project = inject(ProjectService);

  title = input.required<string>();
  subtitle = input<string>();

  readonly projectBadge = computed(() => {
    const p = this.project.selectedProject();
    if (!p) return null;
    const code = (p.code ?? '').trim();
    const name = (p.name ?? '').trim();
    if (code === '' && name === '') return null;
    return { code: code || '—', name: name || '—', full: `${code} · ${name}` };
  });
}
