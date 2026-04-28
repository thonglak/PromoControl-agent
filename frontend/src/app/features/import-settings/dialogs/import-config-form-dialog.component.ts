import { Component, inject, signal, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';

import { ImportConfigApiService, ImportConfig, ImportConfigColumn } from '../import-config-api.service';
import { Project } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

export interface ImportConfigFormDialogData {
  mode: 'create' | 'edit';
  projectId: number;
  config?: ImportConfig;
}

const DATA_TYPE_OPTIONS = [
  { value: 'string', label: 'ข้อความ' },
  { value: 'number', label: 'ตัวเลข' },
  { value: 'date', label: 'วันที่' },
  { value: 'decimal', label: 'ทศนิยม' },
];

const IMPORT_TYPE_OPTIONS = [
  { value: 'bottom_line', label: 'Bottom Line' },
  { value: 'unit', label: 'ยูนิต' },
  { value: 'promotion', label: 'โปรโมชั่น' },
  { value: 'custom', label: 'อื่นๆ' },
];

@Component({
  selector: 'app-import-config-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatButtonToggleModule, MatCheckboxModule,
    MatTableModule, MatProgressSpinnerModule, MatTooltipModule,
    SvgIconComponent,
  ],
  template: `
    <div class="flex flex-col" style="max-height: 90vh;">
      <h2 mat-dialog-title class="!text-lg !font-semibold !text-[#16324F] !px-6 !pt-5 !pb-3 flex-shrink-0">
        {{ data.mode === 'create' ? 'สร้าง Config ใหม่' : 'แก้ไข Config' }}
      </h2>

      <mat-dialog-content class="!px-6 !pb-2 overflow-y-auto flex-1">
        <form [formGroup]="form" class="flex flex-col gap-4 pt-1">

          <!-- Row 1: ชื่อ + ประเภท -->
          <div class="grid grid-cols-2 gap-4">
            <mat-form-field appearance="outline">
              <mat-label>ชื่อ Config</mat-label>
              <input matInput formControlName="config_name" maxlength="100" placeholder="เช่น Default PJ001" />
              @if (form.get('config_name')?.hasError('required') && form.get('config_name')?.touched) {
                <mat-error>กรุณากรอกชื่อ Config</mat-error>
              }
              @if (form.get('config_name')?.hasError('maxlength')) {
                <mat-error>ชื่อต้องไม่เกิน 100 ตัวอักษร</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>ประเภท Import</mat-label>
              <mat-select formControlName="import_type">
                @for (opt of importTypeOptions; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <!-- Row 2: โครงการ + Target Table -->
          <div class="grid grid-cols-2 gap-4">
            <mat-form-field appearance="outline">
              <mat-label>โครงการ</mat-label>
              <mat-select formControlName="project_id">
                @for (p of projects(); track p.id) {
                  <mat-option [value]="p.id">{{ p.name }}</mat-option>
                }
              </mat-select>
              @if (form.get('project_id')?.hasError('required') && form.get('project_id')?.touched) {
                <mat-error>กรุณาเลือกโครงการ</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Target Table</mat-label>
              <input matInput formControlName="target_table" placeholder="เช่น project_units" />
            </mat-form-field>
          </div>

          <!-- Row 3: ประเภทไฟล์ + ชื่อ Sheet -->
          <div class="grid grid-cols-2 gap-4 items-start">
            <div>
              <label class="text-sm text-gray-600 mb-2 block">ประเภทไฟล์</label>
              <mat-button-toggle-group formControlName="file_type" class="border border-gray-200 rounded-lg">
                <mat-button-toggle value="xlsx">xlsx</mat-button-toggle>
                <mat-button-toggle value="xls">xls</mat-button-toggle>
                <mat-button-toggle value="csv">csv</mat-button-toggle>
              </mat-button-toggle-group>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>ชื่อ Sheet (ถ้ามี)</mat-label>
              <input matInput formControlName="sheet_name" placeholder="Sheet1" />
            </mat-form-field>
          </div>

          <!-- Row 4: Header Row + Data Start Row + Default -->
          <div class="grid grid-cols-3 gap-4 items-center">
            <mat-form-field appearance="outline">
              <mat-label>แถว Header</mat-label>
              <input matInput type="number" formControlName="header_row" min="1" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>แถวเริ่มต้นข้อมูล</mat-label>
              <input matInput type="number" formControlName="data_start_row" min="2" />
            </mat-form-field>

            <mat-checkbox formControlName="is_default" color="primary" class="text-sm">
              ตั้งเป็น Default
            </mat-checkbox>
          </div>

          <!-- Column Mapping Section -->
          <div class="mt-2">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-[#16324F] uppercase tracking-wide">Column Mapping</h3>
              <button mat-stroked-button type="button" (click)="addColumn()" class="text-sm">
                <app-icon name="plus" class="w-4 h-4 mr-1" />
                เพิ่ม Column
              </button>
            </div>

            <div class="overflow-x-auto rounded-lg border border-gray-200">
              <table mat-table [dataSource]="columnsFormArray.controls" class="w-full min-w-[860px]">

                <!-- ลำดับ -->
                <ng-container matColumnDef="sort_order">
                  <th mat-header-cell *matHeaderCellDef class="!bg-gray-50 !text-xs !font-semibold !text-gray-600 !w-16 !text-center">
                    ลำดับ
                  </th>
                  <td mat-cell *matCellDef="let ctrl; let i = index" [formGroup]="asGroup(ctrl)" class="!text-center !text-sm text-gray-500">
                    {{ i + 1 }}
                  </td>
                </ng-container>

                <!-- Column Excel -->
                <ng-container matColumnDef="source_column">
                  <th mat-header-cell *matHeaderCellDef class="!bg-gray-50 !text-xs !font-semibold !text-gray-600">
                    Column Excel
                  </th>
                  <td mat-cell *matCellDef="let ctrl" [formGroup]="asGroup(ctrl)">
                    <mat-form-field appearance="outline" class="w-24 !text-sm">
                      <input matInput formControlName="source_column" placeholder="A" />
                    </mat-form-field>
                  </td>
                </ng-container>

                <!-- Field ในระบบ -->
                <ng-container matColumnDef="target_field">
                  <th mat-header-cell *matHeaderCellDef class="!bg-gray-50 !text-xs !font-semibold !text-gray-600">
                    Field ในระบบ
                  </th>
                  <td mat-cell *matCellDef="let ctrl" [formGroup]="asGroup(ctrl)">
                    <mat-form-field appearance="outline" class="w-36 !text-sm">
                      <input matInput formControlName="target_field" placeholder="unit_code" />
                    </mat-form-field>
                  </td>
                </ng-container>

                <!-- Label ไทย -->
                <ng-container matColumnDef="field_label">
                  <th mat-header-cell *matHeaderCellDef class="!bg-gray-50 !text-xs !font-semibold !text-gray-600">
                    Label ไทย
                  </th>
                  <td mat-cell *matCellDef="let ctrl" [formGroup]="asGroup(ctrl)">
                    <mat-form-field appearance="outline" class="w-36 !text-sm">
                      <input matInput formControlName="field_label" placeholder="รหัสยูนิต" />
                    </mat-form-field>
                  </td>
                </ng-container>

                <!-- ประเภทข้อมูล -->
                <ng-container matColumnDef="data_type">
                  <th mat-header-cell *matHeaderCellDef class="!bg-gray-50 !text-xs !font-semibold !text-gray-600">
                    ประเภทข้อมูล
                  </th>
                  <td mat-cell *matCellDef="let ctrl" [formGroup]="asGroup(ctrl)">
                    <mat-form-field appearance="outline" class="w-28 !text-sm">
                      <mat-select formControlName="data_type">
                        @for (opt of dataTypeOptions; track opt.value) {
                          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  </td>
                </ng-container>

                <!-- จำเป็น -->
                <ng-container matColumnDef="is_required">
                  <th mat-header-cell *matHeaderCellDef class="!bg-gray-50 !text-xs !font-semibold !text-gray-600 !text-center">
                    จำเป็น
                  </th>
                  <td mat-cell *matCellDef="let ctrl" [formGroup]="asGroup(ctrl)" class="!text-center">
                    <mat-checkbox formControlName="is_required" color="primary" />
                  </td>
                </ng-container>

                <!-- Key Field -->
                <ng-container matColumnDef="is_key_field">
                  <th mat-header-cell *matHeaderCellDef class="!bg-gray-50 !text-xs !font-semibold !text-gray-600 !text-center">
                    Key Field
                  </th>
                  <td mat-cell *matCellDef="let ctrl" [formGroup]="asGroup(ctrl)" class="!text-center">
                    <mat-checkbox formControlName="is_key_field" color="primary" />
                  </td>
                </ng-container>

                <!-- Actions -->
                <ng-container matColumnDef="col_actions">
                  <th mat-header-cell *matHeaderCellDef class="!bg-gray-50 !text-xs !font-semibold !text-gray-600 !text-center">
                    ลบ
                  </th>
                  <td mat-cell *matCellDef="let ctrl; let i = index" class="!text-center">
                    <button mat-icon-button type="button" matTooltip="ลบ Column" (click)="removeColumn(i)">
                      <app-icon name="trash" class="w-4 h-4 text-red-400" />
                    </button>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="columnTableCols"></tr>
                <tr mat-row *matRowDef="let row; columns: columnTableCols;" class="hover:bg-gray-50"></tr>
                <tr class="mat-row" *matNoDataRow>
                  <td class="mat-cell text-center py-6 text-slate-400 text-sm" [attr.colspan]="columnTableCols.length">
                    ยังไม่มี Column Mapping — คลิก "เพิ่ม Column" เพื่อเริ่มต้น
                  </td>
                </tr>
              </table>
            </div>
          </div>

          @if (serverError()) {
            <div class="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">{{ serverError() }}</div>
          }
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="!px-6 !pb-5 !pt-3 gap-2 flex-shrink-0 border-t border-gray-100">
        <button mat-stroked-button type="button" (click)="dialogRef.close()">ยกเลิก</button>
        <button mat-flat-button type="button" class="!bg-[#16324F] !text-white"
                [disabled]="saving()" (click)="save()">
          @if (saving()) { <mat-spinner diameter="16" class="!inline-block mr-2" /> }
          บันทึก
        </button>
      </mat-dialog-actions>
    </div>
  `,
})
export class ImportConfigFormDialogComponent implements OnInit {
  data      = inject<ImportConfigFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ImportConfigFormDialogComponent>);
  private api  = inject(ImportConfigApiService);
  private fb   = inject(FormBuilder);
  private http = inject(HttpClient);

  @ViewChild(MatTable) private table!: MatTable<any>;

  saving      = signal(false);
  serverError = signal<string | null>(null);
  projects    = signal<Project[]>([]);

  dataTypeOptions   = DATA_TYPE_OPTIONS;
  importTypeOptions = IMPORT_TYPE_OPTIONS;
  columnTableCols   = ['sort_order', 'source_column', 'target_field', 'field_label', 'data_type', 'is_required', 'is_key_field', 'col_actions'];

  form = this.fb.group({
    config_name:   [this.data.config?.config_name   ?? '', [Validators.required, Validators.maxLength(100)]],
    import_type:   [this.data.config?.import_type   ?? 'bottom_line', Validators.required],
    project_id:    [this.data.config?.project_id    ?? this.data.projectId, Validators.required],
    target_table:  [this.data.config?.target_table  ?? ''],
    file_type:     [this.data.config?.file_type     ?? 'xlsx'],
    sheet_name:    [this.data.config?.sheet_name    ?? ''],
    header_row:    [this.data.config?.header_row    ?? 1],
    data_start_row:[this.data.config?.data_start_row ?? 2],
    is_default:    [!!Number(this.data.config?.is_default)],
    columns:       this.fb.array(
      (this.data.config?.columns ?? []).map(c => this.buildColumnGroup(c))
    ),
  });

  get columnsFormArray(): FormArray { return this.form.get('columns') as FormArray; }

  ngOnInit(): void {
    this.http.get<{ data: Project[] }>('/api/projects').pipe(map(r => r.data)).subscribe({
      next: list => this.projects.set(list),
      error: () => {},
    });
  }

  buildColumnGroup(col?: Partial<ImportConfigColumn>): FormGroup {
    return this.fb.group({
      id:            [col?.id ?? null],
      source_column: [col?.source_column ?? ''],
      target_field:  [col?.target_field  ?? ''],
      field_label:   [col?.field_label   ?? ''],
      data_type:     [col?.data_type     ?? 'string'],
      is_required:   [!!Number(col?.is_required)],
      is_key_field:  [!!Number(col?.is_key_field)],
    });
  }

  addColumn(): void {
    this.columnsFormArray.push(this.buildColumnGroup());
    this.table?.renderRows();
  }

  removeColumn(index: number): void {
    this.columnsFormArray.removeAt(index);
    this.table?.renderRows();
  }

  asGroup(ctrl: unknown): FormGroup { return ctrl as FormGroup; }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;
    const payload = {
      config_name:    v.config_name!,
      import_type:    v.import_type!,
      project_id:     Number(v.project_id!),
      target_table:   v.target_table ?? '',
      file_type:      (v.file_type ?? 'xlsx') as 'xlsx' | 'xls' | 'csv',
      sheet_name:     v.sheet_name || null,
      header_row:     Number(v.header_row),
      data_start_row: Number(v.data_start_row),
      is_default:     v.is_default ?? false,
      columns: (v.columns ?? []).map((c: Partial<ImportConfigColumn>, i: number) => ({
        ...c,
        sort_order: i + 1,
      })) as ImportConfigColumn[],
    };

    const obs = this.data.mode === 'create'
      ? this.api.create(payload)
      : this.api.update(this.data.config!.id, payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        const msg = err.error?.errors
          ? Object.values<string>(err.error.errors).join(', ')
          : (err.error?.error ?? 'เกิดข้อผิดพลาด');
        this.serverError.set(msg);
        this.saving.set(false);
      },
    });
  }
}
