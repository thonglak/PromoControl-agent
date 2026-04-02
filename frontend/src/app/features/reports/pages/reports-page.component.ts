import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';

import { SalesReportTabComponent } from '../tabs/sales-report-tab.component';
import { BudgetReportTabComponent } from '../tabs/budget-report-tab.component';
import { PromotionUsageReportTabComponent } from '../tabs/promotion-usage-report-tab.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [
    PageHeaderComponent,MatTabsModule, SalesReportTabComponent, BudgetReportTabComponent, PromotionUsageReportTabComponent],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <!-- Header -->
      <app-page-header title="รายงาน" subtitle="ดูรายงานยอดขาย งบประมาณ และการใช้โปรโมชั่น" />

      <!-- Tabs -->
      <mat-tab-group animationDuration="200ms" (selectedIndexChange)="onTabChange($event)">
        <mat-tab label="รายงานขาย">
          <div class="pt-4">
            <app-sales-report-tab />
          </div>
        </mat-tab>
        <mat-tab label="รายงานงบประมาณ">
          <div class="pt-4">
            <app-budget-report-tab />
          </div>
        </mat-tab>
        <mat-tab label="รายงานการใช้โปรโมชั่น">
          <div class="pt-4">
            <app-promotion-usage-report-tab />
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
})
export class ReportsPageComponent {
  onTabChange(_index: number): void {
    // tabs จะ load data เมื่อ ngOnInit ของ child component ถูกเรียก
  }
}
