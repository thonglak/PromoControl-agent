import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { Subscription, filter } from 'rxjs';

import { SidebarMenuComponent } from '../sidebar-menu/sidebar-menu.component';
import { TopNavigationComponent } from '../top-navigation/top-navigation.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, MatSidenavModule, SidebarMenuComponent, TopNavigationComponent, CdkScrollable],
  templateUrl: './app-layout.component.html',
})
export class AppLayoutComponent implements OnInit, OnDestroy {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly router      = inject(Router);
  private readonly subs        = new Subscription();

  @ViewChild('sidenav') sidenav!: MatSidenav;

  readonly isMobile          = signal(false);
  readonly sidebarCollapsed  = signal(false);

  ngOnInit(): void {
    // ตรวจ mobile breakpoint
    this.subs.add(
      this.breakpoints.observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
        .subscribe(r => this.isMobile.set(r.matches))
    );
    // ปิด drawer เมื่อ navigate (mobile)
    this.subs.add(
      this.router.events.pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(() => {
          if (this.isMobile() && this.sidenav?.opened) this.sidenav.close();
        })
    );
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  onMenuToggle(): void {
    if (this.isMobile()) this.sidenav?.toggle();
  }

  onCollapseToggle(): void {
    this.sidebarCollapsed.update(v => !v);
  }
}
