import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, JsonPipe, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Clipboard } from '@angular/cdk/clipboard';

import {
  SyncFromApiService,
  ExternalApiConfig,
  TestApiResult,
} from '../sync-from-api.service';
import { ProjectService } from '../../../core/services/project.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

@Component({
  selector: 'app-api-debug',
  standalone: true,
  imports: [
    CommonModule, JsonPipe, DecimalPipe, ReactiveFormsModule,
    MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatTableModule, MatProgressSpinnerModule, MatSnackBarModule,
    MatTabsModule, MatTooltipModule,
    PageHeaderComponent, SectionCardComponent, SvgIconComponent,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
    <app-page-header
      title="ทดสอบ API ภายนอก"
      subtitle="Debug — ทดสอบเรียก API โดยไม่สร้าง Snapshot">
    </app-page-header>

    <!-- Section 1: ตั้งค่าการทดสอบ -->
    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">ตั้งค่าการทดสอบ</p>
      <form [formGroup]="form" (ngSubmit)="runTest()">
        <div class="flex flex-wrap gap-3 items-end">

          <!-- Config selector -->
          <mat-form-field appearance="outline" class="w-64">
            <mat-label>เลือก Config</mat-label>
            <mat-select formControlName="config_id" (selectionChange)="onConfigSelected()">
              <mat-option [value]="null">-- ไม่เลือก (ใส่ URL เอง) --</mat-option>
              @for (c of configs(); track c.id) {
                <mat-option [value]="c.id">
                  {{ c.name }}{{ !c.is_active ? ' (ปิดใช้งาน)' : '' }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <!-- URL field -->
          <mat-form-field appearance="outline" class="flex-1 min-w-[260px]">
            <mat-label>URL</mat-label>
            <input matInput formControlName="url" placeholder="https://api.example.com/units">
          </mat-form-field>

          <!-- ปุ่มทดสอบ -->
          <div class="flex items-center gap-2 mb-[1.34375em]">
            <button mat-flat-button color="primary" type="submit"
                    [disabled]="testing() || (!form.value.config_id && !form.value.url)">
              @if (testing()) {
                <mat-spinner diameter="18" class="!inline-block mr-1" />
                กำลังทดสอบ...
              } @else {
                <app-icon name="play" class="w-4 h-4 mr-1" />
                ทดสอบเรียก API
              }
            </button>

            @if (result()) {
              <button mat-stroked-button type="button" (click)="clearResult()">
                <app-icon name="x-mark" class="w-4 h-4 mr-1" />
                ล้างผลลัพธ์
              </button>
            }
          </div>

        </div>
      </form>
    </div>

    <!-- Section 2: ผลการทดสอบ -->
    @if (result(); as r) {
      <app-section-card title="ผลการทดสอบ" class="mb-4">

        <!-- Status chips -->
        <div class="flex flex-wrap gap-2 mb-4">

          <!-- Token status -->
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                [class]="r.token_status === 'ok'
                  ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                  : 'bg-red-50 text-red-700 ring-1 ring-red-200'">
            <app-icon
              [name]="r.token_status === 'ok' ? 'check-circle' : 'x-circle'"
              class="w-3.5 h-3.5" />
            Token: {{ r.token_status === 'ok' ? 'พร้อมใช้งาน' : 'ไม่พบ' }}
          </span>

          <!-- HTTP code -->
          @if (r.http_code !== null) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                  [class]="r.http_code === 200
                    ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                    : 'bg-red-50 text-red-700 ring-1 ring-red-200'">
              <app-icon
                [name]="r.http_code === 200 ? 'check-circle' : 'x-circle'"
                class="w-3.5 h-3.5" />
              HTTP {{ r.http_code }}
            </span>
          }

          <!-- Row count -->
          @if (r.row_count > 0) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-200">
              <app-icon name="table-cells" class="w-3.5 h-3.5" />
              {{ r.row_count | number }} รายการ
            </span>
          }

          <!-- Response size -->
          @if (r.response_size) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 ring-1 ring-slate-200">
              {{ r.response_size | number }} bytes
            </span>
          }
        </div>

        <!-- Message box -->
        <div class="rounded-lg border p-3 mb-4 text-sm"
             [class]="r.http_code === 200 && r.token_status === 'ok'
               ? 'bg-green-50 border-green-200 text-green-800'
               : 'bg-amber-50 border-amber-200 text-amber-800'">
          {{ r.message }}
        </div>

        <!-- Details grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-600">
          <div>
            <span class="text-slate-400 mr-1">URL:</span>
            <span class="font-mono break-all text-slate-700">{{ r.api_url }}</span>
          </div>
          @if (r.config_name) {
            <div>
              <span class="text-slate-400 mr-1">Config:</span>
              <span class="text-slate-700">{{ r.config_name }}</span>
            </div>
          }
          @if (r.curl_error) {
            <div class="col-span-2">
              <span class="text-slate-400 mr-1">cURL Error:</span>
              <span class="text-red-600 font-mono">{{ r.curl_error }}</span>
            </div>
          }
        </div>
      </app-section-card>

      <!-- Section 3: โครงสร้างข้อมูล -->
      @if (r.columns.length > 0) {
        <app-section-card title="โครงสร้างข้อมูล" class="mb-4">
          <mat-tab-group>

            <!-- Tab: Columns -->
            <mat-tab label="Columns ({{ r.columns.length }})">
              <div class="p-4">
                <div class="flex flex-wrap gap-2">
                  @for (col of r.columns; track col) {
                    <span class="bg-slate-100 text-slate-700 rounded-md px-2.5 py-1 font-mono text-xs">
                      {{ col }}
                    </span>
                  }
                </div>
              </div>
            </mat-tab>

            <!-- Tab: Preview -->
            <mat-tab label="Preview ({{ r.preview_rows.length }} แถวแรก)">
              <div class="p-0 overflow-x-auto">
                <table mat-table [dataSource]="r.preview_rows" class="w-full">
                  @for (col of r.columns; track col) {
                    <ng-container [matColumnDef]="col">
                      <th mat-header-cell *matHeaderCellDef
                          class="!text-xs !font-semibold !text-slate-500 !uppercase !tracking-wide !bg-slate-50 !font-mono">
                        {{ col }}
                      </th>
                      <td mat-cell *matCellDef="let row"
                          class="!text-sm !text-slate-700 max-w-[200px] truncate"
                          [matTooltip]="row[col]">
                        {{ row[col] }}
                      </td>
                    </ng-container>
                  }
                  <tr mat-header-row *matHeaderRowDef="r.columns; sticky: true"></tr>
                  <tr mat-row *matRowDef="let row; columns: r.columns"
                      class="even:bg-slate-50/40 hover:bg-primary-50 transition-colors"></tr>
                </table>
              </div>
            </mat-tab>

            <!-- Tab: Raw Response -->
            @if (r.response) {
              <mat-tab label="Raw Response">
                <div class="p-4">
                  <div class="flex justify-end mb-2">
                    <button mat-stroked-button type="button"
                            (click)="copyResponse(r.response)"
                            class="!text-xs">
                      <app-icon name="clipboard" class="w-3.5 h-3.5 mr-1" />
                      คัดลอก Response
                    </button>
                  </div>
                  <pre class="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed">{{ r.response }}</pre>
                </div>
              </mat-tab>
            }

          </mat-tab-group>
        </app-section-card>
      }
    }
    </div>
  `,
})
export class ApiDebugComponent implements OnInit {
  private api       = inject(SyncFromApiService);
  private project   = inject(ProjectService);
  private snack     = inject(MatSnackBar);
  private fb        = inject(FormBuilder);
  private clipboard = inject(Clipboard);

  projectId = computed(() => Number(this.project.selectedProject()?.id ?? 0));

  configs = signal<ExternalApiConfig[]>([]);
  testing = signal(false);
  result  = signal<TestApiResult | null>(null);

  form = this.fb.group({
    config_id: [null as number | null],
    url:       [''],
  });

  ngOnInit(): void {
    this.loadConfigs();
  }

  loadConfigs(): void {
    if (!this.projectId()) return;
    this.api.getConfigs(this.projectId()).subscribe({
      next: data => this.configs.set(data),
    });
  }

  onConfigSelected(): void {
    const configId = this.form.value.config_id;
    if (configId) {
      const config = this.configs().find(c => c.id === configId);
      if (config) {
        this.form.patchValue({ url: config.api_url });
      }
    }
  }

  runTest(): void {
    const { config_id, url } = this.form.value;
    if (!config_id && !url) return;

    this.testing.set(true);
    this.result.set(null);

    const payload: { config_id?: number; url?: string } = {};
    if (config_id) payload.config_id = config_id;
    if (url) payload.url = url;

    this.api.testApi(payload).subscribe({
      next: data => {
        this.result.set(data);
        this.testing.set(false);
      },
      error: err => {
        this.snack.open(err.error?.error ?? 'ทดสอบไม่สำเร็จ', 'ปิด', { duration: 4000 });
        this.testing.set(false);
      },
    });
  }

  clearResult(): void {
    this.result.set(null);
  }

  copyResponse(response: string): void {
    this.clipboard.copy(response);
    this.snack.open('คัดลอกแล้ว', 'ปิด', { duration: 2000 });
  }
}
