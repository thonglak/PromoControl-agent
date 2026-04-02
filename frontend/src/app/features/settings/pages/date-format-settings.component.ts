import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import {
  DateFormatService, DATE_FORMAT_OPTIONS, YEAR_FORMAT_OPTIONS,
} from '../../../core/services/date-format.service';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';

@Component({
  selector: 'app-date-format-settings',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatRadioModule, MatSlideToggleModule, MatSnackBarModule,
    PageHeaderComponent, SectionCardComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      <app-page-header title="รูปแบบวันที่" subtitle="ตั้งค่าการแสดงวันที่ทั้งระบบ" />

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- ── เลือกรูปแบบ ── -->
        <div class="flex flex-col gap-6">

          <!-- รูปแบบวันที่ -->
          <app-section-card title="รูปแบบวันที่" icon="calendar-days">
            <mat-radio-group
              [value]="selectedFormat()"
              (change)="onFormatChange($event.value)"
              class="flex flex-col gap-4">
              @for (opt of formatOptions; track opt.value) {
                <mat-radio-button [value]="opt.value" color="primary">
                  <div class="flex items-center gap-3">
                    <span class="font-medium" style="color: var(--color-text-primary)">{{ getFormatLabel(opt.value) }}</span>
                    <span class="text-xs px-2 py-0.5"
                          style="background-color: var(--color-gray-100); color: var(--color-gray-500); border-radius: var(--radius-sm)">
                      {{ opt.example }}
                    </span>
                  </div>
                </mat-radio-button>
              }
            </mat-radio-group>

            <div class="mt-6 pt-4" style="border-top: 1px solid var(--color-border)">
              <mat-slide-toggle
                [checked]="showTime()"
                (change)="onShowTimeChange($event.checked)"
                color="primary">
                <span class="text-sm" style="color: var(--color-text-primary)">แสดงเวลาด้วย (ชั่วโมง:นาที)</span>
              </mat-slide-toggle>
            </div>
          </app-section-card>

          <!-- ปีที่แสดง -->
          <app-section-card title="รูปแบบปี" icon="calendar-days">
            <mat-radio-group
              [value]="selectedYearFormat()"
              (change)="onYearFormatChange($event.value)"
              class="flex flex-col gap-4">
              @for (opt of yearOptions; track opt.value) {
                <mat-radio-button [value]="opt.value" color="primary">
                  <div>
                    <span class="font-medium" style="color: var(--color-text-primary)">{{ opt.label }}</span>
                    <span class="text-xs ml-2" style="color: var(--color-gray-500)">{{ opt.description }}</span>
                  </div>
                </mat-radio-button>
              }
            </mat-radio-group>
          </app-section-card>

        </div>

        <!-- ── ตัวอย่าง ── -->
        <app-section-card title="ตัวอย่างการแสดงผล" icon="eye">
          <div class="space-y-4">

            <div>
              <p class="text-xs font-medium mb-1" style="color: var(--color-gray-500)">วันที่ปัจจุบัน</p>
              <p class="text-lg font-semibold" style="color: var(--color-primary)">{{ previewNow() }}</p>
            </div>

            <div>
              <p class="text-xs font-medium mb-1" style="color: var(--color-gray-500)">วันที่ขาย</p>
              <p class="text-base" style="color: var(--color-text-primary)">{{ previewSale() }}</p>
            </div>

            <div>
              <p class="text-xs font-medium mb-1" style="color: var(--color-gray-500)">วันที่สร้างรายการ (มีเวลา)</p>
              <p class="text-base" style="color: var(--color-text-primary)">{{ previewDatetime() }}</p>
            </div>

            <div class="p-3 mt-4" style="background-color: var(--color-primary-100); border-radius: var(--radius-md)">
              <p class="text-xs" style="color: var(--color-primary-700)">
                การตั้งค่านี้จะมีผลเฉพาะเบราว์เซอร์นี้ ผู้ใช้คนอื่นจะไม่ได้รับผลกระทบ
              </p>
            </div>
          </div>
        </app-section-card>

      </div>
    </div>
  `,
})
export class DateFormatSettingsComponent {
  private dateFmtSvc = inject(DateFormatService);
  private snack = inject(MatSnackBar);

  readonly formatOptions = DATE_FORMAT_OPTIONS;
  readonly yearOptions = YEAR_FORMAT_OPTIONS;
  readonly selectedFormat = this.dateFmtSvc.dateFormat;
  readonly selectedYearFormat = this.dateFmtSvc.yearFormat;
  readonly showTime = this.dateFmtSvc.showTime;

  private sampleSale = '2026-03-15';
  private sampleDatetime = '2026-03-15T14:30:00';

  previewNow = signal(this.buildPreview(new Date()));
  previewSale = signal(this.buildPreview(this.sampleSale));
  previewDatetime = signal(this.buildPreviewDatetime(this.sampleDatetime));

  getFormatLabel(value: string): string {
    const y = this.selectedYearFormat() === 'be' ? '2569' : '2026';
    const labels: Record<string, string> = {
      medium: `18 มี.ค. ${y}`,
      short: `18/03/${y}`,
      long: `18 มีนาคม ${y}`,
      iso: `${y}-03-18`,
    };
    return labels[value] ?? value;
  }

  onFormatChange(value: string): void {
    this.dateFmtSvc.update({ dateFormat: value as any });
    this.updatePreviews();
    this.snack.open('บันทึกรูปแบบวันที่แล้ว', 'ปิด', { duration: 2000 });
  }

  onYearFormatChange(value: string): void {
    this.dateFmtSvc.update({ yearFormat: value as any });
    this.updatePreviews();
    this.snack.open(value === 'be' ? 'เปลี่ยนเป็น พ.ศ.' : 'เปลี่ยนเป็น ค.ศ.', 'ปิด', { duration: 2000 });
  }

  onShowTimeChange(checked: boolean): void {
    this.dateFmtSvc.update({ showTime: checked });
    this.updatePreviews();
    this.snack.open(checked ? 'เปิดแสดงเวลา' : 'ปิดแสดงเวลา', 'ปิด', { duration: 2000 });
  }

  private updatePreviews(): void {
    this.previewNow.set(this.buildPreview(new Date()));
    this.previewSale.set(this.buildPreview(this.sampleSale));
    this.previewDatetime.set(this.buildPreviewDatetime(this.sampleDatetime));
  }

  private buildPreview(value: string | Date): string {
    return formatThaiDate(value, 'auto');
  }

  private buildPreviewDatetime(value: string): string {
    return formatThaiDate(value, 'auto-datetime');
  }
}
