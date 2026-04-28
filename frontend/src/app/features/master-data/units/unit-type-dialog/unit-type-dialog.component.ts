import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UnitTypeApiService, UnitType } from '../unit-type-api.service';
import { SvgIconComponent } from '../../../../shared/components/svg-icon/svg-icon.component';

export interface UnitTypeDialogData { projectId: number; }

@Component({
  selector: 'app-unit-type-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatTableModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatSlideToggleModule,
    MatTooltipModule, SvgIconComponent,
  ],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">จัดการประเภทยูนิต</h2>
    <mat-dialog-content>
      <!-- Add form -->
      <form [formGroup]="addForm" (ngSubmit)="add()" class="flex items-end gap-3 mb-4 pt-2">
        <mat-form-field appearance="outline" class="flex-1">
          <mat-label>ชื่อประเภท</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-20">
          <mat-label>ลำดับ</mat-label>
          <input matInput type="number" formControlName="sort_order" />
        </mat-form-field>
        <button mat-flat-button color="primary" type="submit" [disabled]="addForm.invalid || saving()" class="!h-[56px]">
          <app-icon name="plus" class="w-4 h-4 mr-1" /> เพิ่ม
        </button>
      </form>

      <!-- Table -->
      <table mat-table [dataSource]="types()" class="w-full">
        <ng-container matColumnDef="sort_order">
          <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !bg-slate-50 !w-16">ลำดับ</th>
          <td mat-cell *matCellDef="let t" class="!text-sm !text-center">{{ t.sort_order }}</td>
        </ng-container>
        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !bg-slate-50">ชื่อ</th>
          <td mat-cell *matCellDef="let t" class="!text-sm !font-medium !text-slate-800">{{ t.name }}</td>
        </ng-container>
        <ng-container matColumnDef="is_active">
          <th mat-header-cell *matHeaderCellDef class="!text-xs !font-semibold !text-slate-500 !bg-slate-50 !text-center">สถานะ</th>
          <td mat-cell *matCellDef="let t" class="!text-center">
            <mat-slide-toggle [checked]="!!+t.is_active" (change)="toggleActive(t)" color="primary" />
          </td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef class="!text-xs !bg-slate-50 !w-16"></th>
          <td mat-cell *matCellDef="let t" class="!text-center">
            <button mat-icon-button matTooltip="ลบ" class="!text-slate-400 hover:!text-red-600" (click)="confirmDelete(t)">
              <app-icon name="trash" class="w-4 h-4" />
            </button>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="['sort_order','name','is_active','actions']"></tr>
        <tr mat-row *matRowDef="let row; columns: ['sort_order','name','is_active','actions'];" class="hover:bg-slate-50"></tr>
      </table>
      @if (types().length === 0) {
        <p class="text-center text-sm text-slate-400 py-6">ยังไม่มีประเภทยูนิต</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2">
      <button mat-stroked-button (click)="dialogRef.close(changed())">ปิด</button>
    </mat-dialog-actions>
  `,
})
export class UnitTypeDialogComponent implements OnInit {
  data      = inject<UnitTypeDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<UnitTypeDialogComponent>);
  private api   = inject(UnitTypeApiService);
  private snack = inject(MatSnackBar);
  private fb    = inject(FormBuilder);

  types   = signal<UnitType[]>([]);
  saving  = signal(false);
  changed = signal(false);

  addForm = this.fb.group({
    name:       ['', Validators.required],
    sort_order: [0],
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.api.getAll(this.data.projectId).subscribe({ next: d => this.types.set(d) });
  }

  add(): void {
    if (this.addForm.invalid) return;
    this.saving.set(true);
    this.api.create({ project_id: this.data.projectId, ...this.addForm.value }).subscribe({
      next: () => { this.saving.set(false); this.changed.set(true); this.addForm.reset({ sort_order: 0 }); this.load(); },
      error: err => { this.saving.set(false); this.snack.open(err.error?.error ?? 'เกิดข้อผิดพลาด', 'ปิด', { duration: 3000 }); },
    });
  }

  toggleActive(t: UnitType): void {
    this.api.update(t.id, { is_active: !t.is_active }).subscribe({ next: () => { this.changed.set(true); this.load(); } });
  }

  confirmDelete(t: UnitType): void {
    if (!confirm('ยืนยันลบ "' + t.name + '"?')) return;
    this.api.delete(t.id).subscribe({
      next: () => { this.changed.set(true); this.load(); this.snack.open('ลบสำเร็จ', 'ปิด', { duration: 2000 }); },
      error: err => this.snack.open(err.error?.error ?? 'ลบไม่สำเร็จ', 'ปิด', { duration: 4000 }),
    });
  }
}
