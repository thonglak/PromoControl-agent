import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * AppLayoutComponent — layout หลัก (sidebar + topbar + router-outlet)
 * TODO: ใส่ sidebar และ topbar เต็มรูปแบบใน task ถัดไป
 */
@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="flex h-screen bg-[#F8FAFC] overflow-hidden">
      <!-- Sidebar placeholder -->
      <aside class="w-60 bg-slate-800 shrink-0"></aside>
      <!-- Main content -->
      <div class="flex-1 flex flex-col min-w-0 overflow-auto">
        <!-- Topbar placeholder -->
        <header class="h-14 bg-white border-b border-slate-200 shrink-0"></header>
        <main class="flex-1 p-6 overflow-auto">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AppLayoutComponent {}
