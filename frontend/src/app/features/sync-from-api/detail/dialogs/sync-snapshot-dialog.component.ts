import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SyncFromApiService, MappingPreset, SyncResult } from '../../sync-from-api.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

export interface SyncSnapshotDialogData {
  snapshotId: number;
  snapshotCode: string;
  projectId: number;
}

@Component({
  selector: 'app-sync-snapshot-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatSelectModule, MatButtonModule,
    MatProgressSpinnerModule, SvgIconComponent,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      Sync ข้อมูลเข้าระบบ
    </h2>

    <mat-dialog-content class="!px-6 !pt-4 !pb-2">

      <!-- ยังไม่มีผลลัพธ์ → แสดง form เลือก preset -->
      @if (!syncResult()) {
        <p class="text-sm text-slate-600 mb-4">
          เลือก Mapping Preset เพื่อจับคู่ข้อมูลจาก Snapshot
          <span class="font-mono font-semibold">{{ data.snapshotCode }}</span>
          เข้า project_units
        </p>

        <form [formGroup]="form" class="flex flex-col gap-3">
          <mat-form-field appearance="outline">
            <mat-label>Mapping Preset</mat-label>
            <mat-select formControlName="preset_id">
              @if (loadingPresets()) {
                <mat-option disabled>กำลังโหลด...</mat-option>
              } @else if (presets().length === 0) {
                <mat-option disabled>ไม่มี Preset — กรุณาสร้างก่อน</mat-option>
              } @else {
                @for (p of presets(); track p.id) {
                  <mat-option [value]="p.id">
                    {{ p.name }}
                    @if (!!Number(p.is_default)) {
                      <span class="ml-1 text-xs text-green-600">(Default)</span>
                    }
                    <span class="ml-1 text-xs text-slate-400">({{ p.columns_count }} fields)</span>
                  </mat-option>
                }
              }
            </mat-select>
            @if (form.get('preset_id')?.hasError('required') && form.get('preset_id')?.touched) {
              <mat-error>กรุณาเลือก Mapping Preset</mat-error>
            }
          </mat-form-field>
        </form>

        @if (serverError()) {
          <div class="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded mt-2">
            {{ serverError() }}
          </div>
        }
      }

      <!-- แสดงผลลัพธ์ sync -->
      @if (syncResult(); as r) {
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">
            <app-icon name="check-circle" class="w-5 h-5" />
            <span class="font-medium">Sync สำเร็จ!</span>
          </div>

          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="bg-blue-50 rounded-lg p-3">
              <p class="text-2xl font-bold text-blue-700">{{ r.created }}</p>
              <p class="text-xs text-blue-600">สร้างใหม่</p>
            </div>
            <div class="bg-amber-50 rounded-lg p-3">
              <p class="text-2xl font-bold text-amber-700">{{ r.updated }}</p>
              <p class="text-xs text-amber-600">อัปเดต</p>
            </div>
            <div class="bg-slate-50 rounded-lg p-3">
              <p class="text-2xl font-bold text-slate-500">{{ r.skipped }}</p>
              <p class="text-xs text-slate-500">ข้าม</p>
            </div>
          </div>

          @if (r.errors.length > 0) {
            <div class="bg-red-50 border border-red-200 rounded-lg p-3">
              <p class="text-sm font-medium text-red-700 mb-1">ข้อผิดพลาด ({{ r.errors.length }} รายการ)</p>
              <ul class="text-xs text-red-600 list-disc list-inside max-h-32 overflow-auto">
                @for (e of r.errors; track $index) {
                  <li>แถว {{ e.row }}: {{ e.error }}</li>
                }
              </ul>
            </div>
          }
        </div>
      }

    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      @if (!syncResult()) {
        <button mat-stroked-button type="button" (click)="dialogRef.close()">ยกเลิก</button>
        <button mat-flat-button color="primary" type="button"
                [disabled]="syncing() || presets().length === 0"
                (click)="doSync()">
          @if (syncing()) {
            <mat-spinner diameter="18" class="!inline-block mr-1" />
          }
          Sync เข้าระบบ
        </button>
      } @else {
        <button mat-flat-button color="primary" type="button" (click)="dialogRef.close(true)">
          ปิด
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class SyncSnapshotDialogComponent implements OnInit {
  readonly data      = inject<SyncSnapshotDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<SyncSnapshotDialogComponent>);
  private api        = inject(SyncFromApiService);
  private fb         = inject(FormBuilder);

  readonly Number = Number;

  loadingPresets = signal(false);
  syncing        = signal(false);
  serverError    = signal<string | null>(null);
  presets        = signal<MappingPreset[]>([]);
  syncResult     = signal<SyncResult | null>(null);

  form = this.fb.group({
    preset_id: [null as number | null, Validators.required],
  });

  ngOnInit(): void {
    this.loadPresets();
  }

  private loadPresets(): void {
    this.loadingPresets.set(true);
    this.api.getMappingPresets(this.data.projectId).subscribe({
      next: data => {
        this.presets.set(data);
        this.loadingPresets.set(false);

        // auto-select default preset
        const defaultPreset = data.find(p => !!Number(p.is_default));
        if (defaultPreset) {
          this.form.patchValue({ preset_id: defaultPreset.id });
        }
      },
      error: () => this.loadingPresets.set(false),
    });
  }

  doSync(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.syncing.set(true);
    this.serverError.set(null);

    const presetId = this.form.value.preset_id!;

    this.api.syncSnapshot(this.data.snapshotId, presetId).subscribe({
      next: result => {
        this.syncResult.set(result);
        this.syncing.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.error ?? 'เกิดข้อผิดพลาด');
        this.syncing.set(false);
      },
    });
  }
}
