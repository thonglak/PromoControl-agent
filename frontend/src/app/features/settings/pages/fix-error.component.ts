import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { NumberSeriesService, ProvisionAllResult } from '../services/number-series.service';

@Component({
  selector: 'app-fix-error',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule, MatProgressSpinnerModule, MatSnackBarModule, MatTableModule,
    PageHeaderComponent, SectionCardComponent, SvgIconComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <app-page-header
        title="Fix Error"
        subtitle="เครื่องมือแก้ปัญหาข้อมูลที่หายไป สำหรับโครงการที่สร้างผ่าน import หรือก่อนระบบใหม่" />

      <!-- Fix Number Series -->
      <app-section-card title="เลขที่เอกสาร (Number Series)" icon="adjustments-horizontal">
        <div class="flex items-start gap-4">
          <div class="flex-1">
            <p class="text-sm text-slate-600 m-0">
              สแกนทุกโครงการในระบบและสร้าง <span class="font-medium">เลขที่เอกสารอัตโนมัติ</span>
              ที่ยังขาดให้ครบ (SO / BM / BL / UA)
            </p>
            <p class="text-xs text-slate-500 mt-1">
              โครงการที่สร้างผ่าน import จะไม่มี number_series row ทำให้บันทึกขาย/movement ใช้
              fallback pattern ที่ซ้ำกันได้ — เครื่องมือนี้แก้ปัญหานั้น
            </p>
          </div>
          <button mat-flat-button color="primary"
                  [disabled]="fixing()"
                  (click)="fixNumberSeries()">
            @if (fixing()) {
              <mat-spinner diameter="18" class="!inline-block mr-1" />
              กำลังตรวจ...
            } @else {
              <app-icon name="wrench-screwdriver" class="w-4 h-4 inline-block mr-1" />
              Fix Number Series
            }
          </button>
        </div>

        <!-- Result -->
        @if (result(); as r) {
          <div class="mt-4 pt-4 border-t border-slate-200">
            <div class="flex flex-wrap gap-3 mb-3">
              <div class="result-pill">
                <span class="result-pill__label">โครงการทั้งหมด</span>
                <span class="result-pill__value">{{ r.total_projects | number }}</span>
              </div>
              <div class="result-pill" [class.result-pill--success]="r.fixed_projects > 0">
                <span class="result-pill__label">โครงการที่แก้</span>
                <span class="result-pill__value">{{ r.fixed_projects | number }}</span>
              </div>
              <div class="result-pill" [class.result-pill--success]="r.total_created > 0">
                <span class="result-pill__label">เลขที่สร้างใหม่</span>
                <span class="result-pill__value">{{ r.total_created | number }}</span>
              </div>
            </div>

            @if (r.details.length > 0) {
              <div class="border border-slate-200 rounded-md overflow-hidden">
                <table mat-table [dataSource]="r.details" class="w-full">
                  <ng-container matColumnDef="project_code">
                    <th mat-header-cell *matHeaderCellDef>รหัส</th>
                    <td mat-cell *matCellDef="let row" class="font-mono text-sm">{{ row.project_code }}</td>
                  </ng-container>
                  <ng-container matColumnDef="project_name">
                    <th mat-header-cell *matHeaderCellDef>ชื่อโครงการ</th>
                    <td mat-cell *matCellDef="let row">{{ row.project_name }}</td>
                  </ng-container>
                  <ng-container matColumnDef="created">
                    <th mat-header-cell *matHeaderCellDef class="!text-center">สร้าง</th>
                    <td mat-cell *matCellDef="let row" class="!text-center">
                      <span class="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                        {{ row.created }}
                      </span>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="types">
                    <th mat-header-cell *matHeaderCellDef>ประเภทเอกสาร</th>
                    <td mat-cell *matCellDef="let row">
                      <div class="flex flex-wrap gap-1">
                        @for (t of row.types; track t) {
                          <span class="text-xs px-1.5 py-0.5 rounded font-mono bg-slate-100 text-slate-700">{{ t }}</span>
                        }
                      </div>
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
                </table>
              </div>
            } @else {
              <div class="text-center py-6 text-sm text-slate-500">
                <app-icon name="check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                ทุกโครงการมีเลขที่เอกสารครบแล้ว — ไม่ต้องแก้
              </div>
            }
          </div>
        }
      </app-section-card>
    </div>
  `,
  styles: [`
    .result-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--color-section);
      border: 1px solid var(--color-border);
      border-radius: 999px;
      font-size: 13px;
    }
    .result-pill__label { color: var(--color-text-secondary); }
    .result-pill__value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--color-text-primary);
    }
    .result-pill--success {
      background: #ecfdf5;
      border-color: #a7f3d0;
    }
    .result-pill--success .result-pill__value { color: #047857; }
  `],
})
export class FixErrorComponent {
  private numberSeriesSvc = inject(NumberSeriesService);
  private snack           = inject(MatSnackBar);

  readonly fixing = signal(false);
  readonly result = signal<ProvisionAllResult | null>(null);

  readonly displayedColumns = ['project_code', 'project_name', 'created', 'types'];

  fixNumberSeries(): void {
    if (this.fixing()) return;
    this.fixing.set(true);

    this.numberSeriesSvc.provisionAll().subscribe({
      next: res => {
        this.fixing.set(false);
        this.result.set(res);
        const msg = res.fixed_projects === 0
          ? `ตรวจ ${res.total_projects} โครงการ — ครบทุกโครงการแล้ว`
          : `แก้ ${res.fixed_projects} โครงการ · สร้างใหม่ ${res.total_created} รายการ`;
        this.snack.open(msg, 'ปิด', { duration: 4000 });
      },
      error: err => {
        this.fixing.set(false);
        const errMsg = err?.error?.error ?? 'แก้ไขไม่สำเร็จ';
        this.snack.open(errMsg, 'ปิด', { duration: 5000 });
      },
    });
  }
}
