import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PromotionItemApiService, PromotionItem } from '../promotion-item-api.service';
import { HouseModelApiService, HouseModel } from '../../house-models/house-model-api.service';
import { UnitApiService, Unit } from '../../units/unit-api.service';
import { ProjectService } from '../../../../core/services/project.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';
import { CurrencyMaskDirective } from '../../../../shared/directives/currency-mask.directive';

/** แปลง Date หรือ Moment → YYYY-MM-DD string */
function toISODateStr(d: any): string {
  if (!d) return '';
  const y = typeof d.year === 'function' ? d.year() : d.getFullYear();
  const m = String((typeof d.month === 'function' ? d.month() : d.getMonth()) + 1).padStart(2, '0');
  const dd = String(typeof d.date === 'function' ? d.date() : d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export interface PromotionItemFormDialogData {
  mode: 'create' | 'edit';
  item?: PromotionItem;
}

@Component({
  selector: 'app-promotion-item-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatSlideToggleModule, MatRadioModule,
    MatDatepickerModule,
    MatProgressSpinnerModule, CurrencyMaskDirective, SvgIconComponent,
  ],
  templateUrl: './promotion-item-form-dialog.component.html',
})
export class PromotionItemFormDialogComponent implements OnInit {
  data      = inject<PromotionItemFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<PromotionItemFormDialogComponent>);
  private api       = inject(PromotionItemApiService);
  private hmApi     = inject(HouseModelApiService);
  private unitApi   = inject(UnitApiService);
  private project   = inject(ProjectService);
  private fb        = inject(FormBuilder);

  saving       = signal(false);
  serverError  = signal<string | null>(null);
  houseModels  = signal<HouseModel[]>([]);
  units        = signal<Unit[]>([]);

  private item = this.data.item;

  form = this.fb.group({
    name:               [this.item?.name ?? '', Validators.required],
    category:           [this.item?.category ?? 'discount', Validators.required],
    value_mode:         [this.item?.value_mode ?? 'fixed', Validators.required],
    max_value:          [this.item?.max_value ?? null as number | null],
    default_used_value: [this.item?.default_used_value ?? null as number | null],
    discount_convert_value: [this.item?.discount_convert_value ?? null as number | null],
    is_unit_standard:   [this.item?.is_unit_standard ?? false],
    is_active:          [this.item?.is_active ?? true],
    sort_order:         [this.item?.sort_order ?? 0],
    // Eligibility radios
    hm_mode:            [this.item && this.item.eligible_house_models.length > 0 ? 'specific' : 'all'],
    eligible_hm_ids:    [this.item?.eligible_house_models.map(h => h.house_model_id) ?? [] as number[]],
    date_mode:          [this.item && (this.item.eligible_start_date || this.item.eligible_end_date) ? 'range' : 'none'],
    eligible_start:     [this.item?.eligible_start_date ? new Date(this.item.eligible_start_date) : null as Date | null],
    eligible_end:       [this.item?.eligible_end_date ? new Date(this.item.eligible_end_date) : null as Date | null],
    unit_mode:          [this.item && this.item.eligible_units.length > 0 ? 'specific' : 'all'],
    eligible_unit_ids:  [this.item?.eligible_units.map(u => u.unit_id) ?? [] as number[]],
  });

  get projectId(): number { return Number(this.project.selectedProject()?.id ?? 0); }

  ngOnInit(): void {
    if (this.projectId) {
      this.hmApi.getList(this.projectId).subscribe({ next: m => this.houseModels.set(m) });
      this.unitApi.getList(this.projectId).subscribe({ next: u => this.units.set(u) });
    }
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.serverError.set(null);

    const v = this.form.value;

    const payload: any = {
      project_id:         this.projectId,
      name:               v.name,
      category:           v.category,
      value_mode:         v.value_mode,
      default_value:      0,
      max_value:          v.max_value ?? null,
      default_used_value: v.default_used_value ?? null,
      discount_convert_value: v.discount_convert_value ?? null,
      is_unit_standard:   v.is_unit_standard ?? false,
      is_active:          v.is_active ?? true,
      sort_order:         v.sort_order ?? 0,
      eligible_start_date: v.date_mode === 'range' && v.eligible_start ? this.toDateStr(v.eligible_start) : null,
      eligible_end_date:   v.date_mode === 'range' && v.eligible_end ? this.toDateStr(v.eligible_end) : null,
      eligible_house_model_ids: v.hm_mode === 'specific' ? (v.eligible_hm_ids ?? []) : [],
      eligible_unit_ids:        v.unit_mode === 'specific' ? (v.eligible_unit_ids ?? []) : [],
    };

    const obs = this.data.mode === 'create'
      ? this.api.create(payload)
      : this.api.update(this.item!.id, payload);

    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        this.serverError.set(err.error?.error ?? 'เกิดข้อผิดพลาด');
        this.saving.set(false);
      },
    });
  }

  private toDateStr(d: any): string {
    return toISODateStr(d);
  }
}
