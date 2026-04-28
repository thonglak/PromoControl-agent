import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  SyncFromApiService,
  MappingPreset,
  MappingColumn,
  TargetField,
  SourceField,
  SyncFromApiSnapshot,
  SyncTargetTable,
} from '../../sync-from-api.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

export interface MappingPresetFormDialogData {
  mode: 'create' | 'edit';
  projectId: number;
  preset?: MappingPreset;
}

// ตัวเลือก transform type
const TRANSFORM_OPTIONS: { value: MappingColumn['transform_type']; label: string }[] = [
  { value: 'none',       label: 'ไม่แปลง' },
  { value: 'number',     label: 'ตัวเลข' },
  { value: 'date',       label: 'วันที่' },
  { value: 'status_map', label: 'Map สถานะ' },
  { value: 'fk_lookup',  label: 'FK Lookup' },
];

@Component({
  selector: 'app-mapping-preset-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    SvgIconComponent,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">
      {{ data.mode === 'create' ? 'สร้าง Mapping Preset ใหม่' : 'แก้ไข Mapping Preset' }}
    </h2>

    <mat-dialog-content class="!px-6 !pt-4 !pb-2" style="max-height: 70vh;">
      <form [formGroup]="form" class="flex flex-col gap-4">

        <!-- ส่วนหัว: ชื่อ + Default -->
        <div class="flex items-start gap-4">
          <mat-form-field appearance="outline" class="flex-1">
            <mat-label>ชื่อ Preset</mat-label>
            <input matInput formControlName="name" placeholder="เช่น Default Mapping" />
            @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
              <mat-error>กรุณากรอกชื่อ Preset</mat-error>
            }
          </mat-form-field>

          <div class="flex items-center gap-2 pt-3">
            <mat-slide-toggle formControlName="is_default" color="primary">
              ตั้งเป็น Default
            </mat-slide-toggle>
          </div>
        </div>

        <!-- เลือก Target Table + Upsert Key -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p class="text-sm font-medium text-slate-700 mb-2">
            ตั้งค่าปลายทาง
          </p>
          <div class="flex gap-4">
            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>Target Table</mat-label>
              <mat-select formControlName="target_table" (selectionChange)="onTargetTableChange($event.value)">
                @if (loadingSyncTargetTables()) {
                  <mat-option disabled>กำลังโหลด...</mat-option>
                } @else {
                  @for (t of syncTargetTables(); track t.id) {
                    <mat-option [value]="t.table_name">
                      {{ t.label }} ({{ t.table_name }})
                    </mat-option>
                  }
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>Upsert Key</mat-label>
              <mat-select formControlName="upsert_key">
                @if (loadingTargetFields()) {
                  <mat-option disabled>กำลังโหลด...</mat-option>
                } @else {
                  @for (tf of targetFields(); track tf.field) {
                    <mat-option [value]="tf.field">
                      {{ tf.field }}
                    </mat-option>
                  }
                }
              </mat-select>
            </mat-form-field>
          </div>

          <!-- Project ID Mode -->
          <div class="flex gap-4 mt-2">
            <mat-form-field appearance="outline" class="flex-1">
              <mat-label>Project ID Mode</mat-label>
              <mat-select formControlName="project_id_mode">
                <mat-option value="from_snapshot">จาก Snapshot (ใช้ project เดียวกับ snapshot)</mat-option>
                <mat-option value="from_field">จาก Source Field (ระบุ field)</mat-option>
                <mat-option value="none">ไม่ใช้ project_id</mat-option>
              </mat-select>
            </mat-form-field>

            @if (form.get('project_id_mode')?.value === 'from_field') {
              <mat-form-field appearance="outline" class="flex-1">
                <mat-label>Project ID Field (source)</mat-label>
                <mat-select formControlName="project_id_field">
                  @if (loadingSourceFields()) {
                    <mat-option disabled>กำลังโหลด...</mat-option>
                  } @else if (sourceFields().length === 0) {
                    <mat-option disabled>เลือก Snapshot ก่อน</mat-option>
                  } @else {
                    @for (sf of sourceFields(); track sf.field) {
                      <mat-option [value]="sf.field">
                        <span class="font-mono text-xs">{{ sf.field }}</span>
                        @if (sf.sample !== null) {
                          <span class="ml-2 text-slate-400 text-xs">เช่น: {{ sf.sample | slice:0:30 }}</span>
                        }
                      </mat-option>
                    }
                  }
                </mat-select>
              </mat-form-field>
            }
          </div>
        </div>

        <!-- เลือก Snapshot เพื่อดู Source Fields -->
        <div class="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p class="text-sm font-medium text-slate-700 mb-2">
            เลือก Snapshot เพื่อดูตัวอย่าง Source Fields
          </p>
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Snapshot</mat-label>
            <mat-select formControlName="snapshot_id" (selectionChange)="onSnapshotChange($event.value)">
              @if (loadingSnapshots()) {
                <mat-option disabled>กำลังโหลด...</mat-option>
              } @else if (snapshots().length === 0) {
                <mat-option disabled>ไม่มี Snapshot</mat-option>
              } @else {
                @for (s of snapshots(); track s.id) {
                  <mat-option [value]="s.id">
                    {{ s.code }} — {{ s.created_at | date:'dd/MM/yyyy HH:mm' }} ({{ s.total_rows }} แถว)
                  </mat-option>
                }
              }
            </mat-select>
          </mat-form-field>
        </div>

        <!-- ตาราง Map Fields -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm font-semibold text-slate-700">จับคู่ Fields</p>
            <button mat-stroked-button type="button" (click)="addColumn()" class="!text-sm">
              <app-icon name="plus" class="w-4 h-4 mr-1 inline-block" />
              เพิ่ม Field
            </button>
          </div>

          @if (columnsArray.length === 0) {
            <div class="text-center py-8 text-slate-400 border border-dashed border-slate-300 rounded-lg">
              <app-icon name="link" class="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p class="text-sm">ยังไม่มี Field Mapping — กดปุ่ม "เพิ่ม Field" เพื่อเริ่มต้น</p>
            </div>
          } @else {
            <div class="border border-slate-200 rounded-lg">
              <table class="w-full text-sm">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 w-[220px]">
                      Source Field (API)
                    </th>
                    <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 w-[200px]">
                      Target Field (ระบบ)
                    </th>
                    <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 w-[140px]">
                      Transform
                    </th>
                    <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2">
                      Transform Value
                    </th>
                    <th class="w-10"></th>
                  </tr>
                </thead>
                <tbody formArrayName="columns">
                  @for (col of columnsArray.controls; track $index; let i = $index) {
                    <tr [formGroupName]="i"
                        class="border-t border-slate-100"
                        [class.bg-white]="i % 2 === 0"
                        [class.bg-slate-50]="i % 2 !== 0">
                      <!-- Source Field -->
                      <td class="px-2 py-1.5">
                        <mat-form-field appearance="outline" class="w-full !text-sm" subscriptSizing="dynamic">
                          <mat-select formControlName="source_field" placeholder="เลือก field">
                            @if (loadingSourceFields()) {
                              <mat-option disabled>กำลังโหลด...</mat-option>
                            } @else if (sourceFields().length === 0) {
                              <mat-option disabled>เลือก Snapshot ก่อน</mat-option>
                            } @else {
                              @for (sf of sourceFields(); track sf.field) {
                                <mat-option [value]="sf.field">
                                  <span class="font-mono text-xs">{{ sf.field }}</span>
                                  @if (sf.sample !== null) {
                                    <span class="ml-2 text-slate-400 text-xs">
                                      เช่น: {{ sf.sample | slice:0:30 }}
                                    </span>
                                  }
                                </mat-option>
                              }
                            }
                          </mat-select>
                        </mat-form-field>
                      </td>

                      <!-- Target Field -->
                      <td class="px-2 py-1.5">
                        <mat-form-field appearance="outline" class="w-full !text-sm" subscriptSizing="dynamic">
                          <mat-select formControlName="target_field" placeholder="เลือก field">
                            @if (loadingTargetFields()) {
                              <mat-option disabled>กำลังโหลด...</mat-option>
                            } @else {
                              @for (tf of targetFields(); track tf.field) {
                                <mat-option [value]="tf.field" [disabled]="isTargetFieldUsed(tf.field, i)">
                                  <span class="font-mono text-xs">{{ tf.field }}</span>
                                  <span class="ml-2 text-slate-500 text-xs">{{ tf.label }}</span>
                                </mat-option>
                              }
                            }
                          </mat-select>
                        </mat-form-field>
                      </td>

                      <!-- Transform Type -->
                      <td class="px-2 py-1.5">
                        <mat-form-field appearance="outline" class="w-full !text-sm" subscriptSizing="dynamic">
                          <mat-select formControlName="transform_type" (selectionChange)="onTransformTypeChange(i, $event.value)">
                            @for (opt of transformOptions; track opt.value) {
                              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                            }
                          </mat-select>
                        </mat-form-field>
                      </td>

                      <!-- Transform Value -->
                      <td class="px-2 py-1.5">
                        <mat-form-field appearance="outline" class="w-full !text-sm" subscriptSizing="dynamic">
                          <mat-label>Transform Value</mat-label>
                          <input matInput formControlName="transform_value"
                                 class="!font-mono !text-xs" />
                        </mat-form-field>
                      </td>

                      <!-- ปุ่มลบแถว -->
                      <td class="px-1 py-1.5 text-center">
                        <button mat-icon-button type="button"
                                class="!text-slate-400 hover:!text-red-500"
                                matTooltip="ลบแถวนี้"
                                (click)="removeColumn(i)">
                          <app-icon name="trash" class="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <!-- Error message -->
        @if (serverError()) {
          <div class="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded">
            {{ serverError() }}
          </div>
        }

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button type="button" (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" type="button"
              [disabled]="saving()"
              (click)="save()">
        @if (saving()) {
          <mat-spinner diameter="18" class="!inline-block mr-1" />
        }
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
})
export class MappingPresetFormDialogComponent implements OnInit {
  readonly data      = inject<MappingPresetFormDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<MappingPresetFormDialogComponent>);
  private  api       = inject(SyncFromApiService);
  private  fb        = inject(FormBuilder);

  saving               = signal(false);
  serverError          = signal<string | null>(null);
  loadingSnapshots     = signal(false);
  loadingSourceFields  = signal(false);
  loadingTargetFields  = signal(false);
  loadingSyncTargetTables = signal(false);

  snapshots        = signal<SyncFromApiSnapshot[]>([]);
  sourceFields     = signal<SourceField[]>([]);
  targetFields     = signal<TargetField[]>([]);
  syncTargetTables = signal<SyncTargetTable[]>([]);

  readonly transformOptions = TRANSFORM_OPTIONS;

  readonly fkLookupPlaceholder = JSON.stringify({
    lookup_table: 'house_models',
    lookup_field: 'code',
    scope_by_project: true,
    create_if_missing: true,
    create_fields: { name: '{value}', code: '{value}' }
  }, null, 2);

  form = this.fb.group({
    name:             [this.data.preset?.name ?? '', Validators.required],
    target_table:     [this.data.preset?.target_table ?? 'project_units', Validators.required],
    upsert_key:       [this.data.preset?.upsert_key ?? 'unit_code', Validators.required],
    project_id_mode:  [this.data.preset?.project_id_mode ?? 'from_snapshot', Validators.required],
    project_id_field: [this.data.preset?.project_id_field ?? null as string | null],
    is_default:       [!!Number(this.data.preset?.is_default ?? false)],
    snapshot_id:      [null as number | null],
    columns:          this.fb.array([] as FormGroup[]),
  });

  get columnsArray(): FormArray<FormGroup> {
    return this.form.get('columns') as FormArray<FormGroup>;
  }

  ngOnInit(): void {
    this.loadSyncTargetTables();
    this.loadSnapshots();
    this.loadTargetFields(this.form.get('target_table')?.value ?? 'project_units');

    // โหลดข้อมูล columns เมื่อแก้ไข
    if (this.data.mode === 'edit' && this.data.preset) {
      this.loadPresetDetail(this.data.preset.id);
    }
  }

  private loadSyncTargetTables(): void {
    this.loadingSyncTargetTables.set(true);
    this.api.getSyncTargetTables().subscribe({
      next: data => {
        this.syncTargetTables.set(data);
        this.loadingSyncTargetTables.set(false);
      },
      error: () => this.loadingSyncTargetTables.set(false),
    });
  }

  private loadSnapshots(): void {
    this.loadingSnapshots.set(true);
    this.api.getSnapshots(this.data.projectId).subscribe({
      next: data => {
        this.snapshots.set(data);
        this.loadingSnapshots.set(false);
        // ถ้าแก้ไข — ตั้ง snapshot ล่าสุดเป็น default
        if (this.data.mode === 'edit' && data.length > 0) {
          this.form.get('snapshot_id')?.setValue(data[0].id);
          this.loadSourceFields(data[0].id);
        }
      },
      error: () => this.loadingSnapshots.set(false),
    });
  }

  private loadTargetFields(targetTable: string = 'project_units'): void {
    this.loadingTargetFields.set(true);
    this.api.getTargetFields(targetTable).subscribe({
      next: data => { this.targetFields.set(data); this.loadingTargetFields.set(false); },
      error: () => this.loadingTargetFields.set(false),
    });
  }

  onTargetTableChange(tableName: string): void {
    // โหลด target fields ใหม่ตาม table ที่เลือก
    this.loadTargetFields(tableName);

    // ตั้ง default upsert key จาก sync_target_tables
    const selected = this.syncTargetTables().find(t => t.table_name === tableName);
    if (selected) {
      this.form.get('upsert_key')?.setValue(selected.default_upsert_key);
    }

    // เคลียร์ target_field ที่เลือกไว้ใน columns ทั้งหมด (เพราะ field อาจไม่ตรงกับ table ใหม่)
    this.columnsArray.controls.forEach(ctrl => {
      ctrl.get('target_field')?.setValue('');
    });
  }

  private loadPresetDetail(id: number): void {
    this.api.getMappingPreset(id).subscribe({
      next: detail => {
        // เติม columns จาก preset
        detail.columns
          .sort((a, b) => a.sort_order - b.sort_order)
          .forEach(col => this.addColumn(col));
      },
    });
  }

  onSnapshotChange(snapshotId: number): void {
    this.loadSourceFields(snapshotId);
  }

  private loadSourceFields(snapshotId: number): void {
    this.loadingSourceFields.set(true);
    this.sourceFields.set([]);
    this.api.getSourceFields(snapshotId).subscribe({
      next: data => { this.sourceFields.set(data); this.loadingSourceFields.set(false); },
      error: () => this.loadingSourceFields.set(false),
    });
  }

  addColumn(col?: MappingColumn): void {
    const index = this.columnsArray.length;
    // ถ้าเป็น fk_lookup แต่ transform_value ว่าง → ใส่ template ให้
    let transformValue = col?.transform_value ?? null;
    if (col?.transform_type === 'fk_lookup' && (!transformValue || transformValue.trim() === '')) {
      transformValue = this.fkLookupPlaceholder;
    }
    this.columnsArray.push(this.fb.group({
      source_field:    [col?.source_field    ?? '', Validators.required],
      target_field:    [col?.target_field    ?? '', Validators.required],
      transform_type:  [col?.transform_type  ?? 'none'],
      transform_value: [transformValue],
      sort_order:      [col?.sort_order      ?? index],
    }));
  }

  removeColumn(index: number): void {
    this.columnsArray.removeAt(index);
  }

  isTargetFieldUsed(field: string, currentIndex: number): boolean {
    return this.columnsArray.controls.some(
      (ctrl, i) => i !== currentIndex && ctrl.get('target_field')?.value === field
    );
  }

  getTransformType(index: number): string {
    return this.columnsArray.at(index)?.get('transform_type')?.value ?? 'none';
  }

  onTransformTypeChange(index: number, newType: string): void {
    const ctrl = this.columnsArray.at(index);
    if (!ctrl) return;
    const currentValue = ctrl.get('transform_value')?.value;
    // ถ้าเปลี่ยนเป็น fk_lookup และยังไม่มีค่า → ใส่ template ให้
    if (newType === 'fk_lookup' && (!currentValue || currentValue.trim() === '')) {
      ctrl.get('transform_value')?.setValue(this.fkLookupPlaceholder);
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;
    // ตรวจสอบ transform_value สำหรับ fk_lookup / status_map
    const rawColumns = v.columns ?? [];
    for (let i = 0; i < rawColumns.length; i++) {
      const c = rawColumns[i] as Partial<MappingColumn>;
      if ((c.transform_type === 'fk_lookup' || c.transform_type === 'status_map') && (!c.transform_value || c.transform_value.trim() === '')) {
        this.serverError.set(`แถวที่ ${i + 1}: กรุณากรอก ${c.transform_type === 'fk_lookup' ? 'FK Config' : 'JSON Map'}`);
        this.saving.set(false);
        return;
      }
      if (c.transform_type === 'fk_lookup' && c.transform_value) {
        try { JSON.parse(c.transform_value); } catch {
          this.serverError.set(`แถวที่ ${i + 1}: FK Config ไม่ใช่ JSON ที่ถูกต้อง`);
          this.saving.set(false);
          return;
        }
      }
    }

    const columns: MappingColumn[] = rawColumns.map((c: Partial<MappingColumn>, i: number) => ({
      source_field:    c.source_field!,
      target_field:    c.target_field!,
      transform_type:  c.transform_type ?? 'none',
      transform_value: c.transform_value ?? null,
      sort_order:      i,
    }));

    if (this.data.mode === 'create') {
      this.api.createMappingPreset({
        project_id: this.data.projectId,
        name: v.name!,
        target_table: v.target_table!,
        upsert_key: v.upsert_key!,
        project_id_mode: v.project_id_mode!,
        project_id_field: v.project_id_mode === 'from_field' ? v.project_id_field : null,
        is_default: v.is_default ?? false,
        columns,
      }).subscribe({
        next: () => this.dialogRef.close(true),
        error: err => this.handleError(err),
      });
    } else {
      this.api.updateMappingPreset(this.data.preset!.id, {
        name: v.name!,
        target_table: v.target_table!,
        upsert_key: v.upsert_key!,
        project_id_mode: v.project_id_mode!,
        project_id_field: v.project_id_mode === 'from_field' ? v.project_id_field : null,
        is_default: v.is_default ?? false,
        columns,
      }).subscribe({
        next: () => this.dialogRef.close(true),
        error: err => this.handleError(err),
      });
    }
  }

  private handleError(err: { error?: { errors?: Record<string, string>; error?: string } }): void {
    const msg = err.error?.errors
      ? Object.values(err.error.errors).join(', ')
      : (err.error?.error ?? 'เกิดข้อผิดพลาด');
    this.serverError.set(msg);
    this.saving.set(false);
  }
}
