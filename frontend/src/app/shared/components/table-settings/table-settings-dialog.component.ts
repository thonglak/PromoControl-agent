import { Component, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';
import { ColumnDef } from '../../services/table-config.service';

export interface TableSettingsDialogData {
  columns: ColumnDef[];
  tableId: string;
}

@Component({
  selector: 'app-table-settings-dialog',
  standalone: true,
  imports: [DragDropModule, MatDialogModule, MatCheckboxModule, MatButtonModule, SvgIconComponent],
  template: `
    <h2 mat-dialog-title class="!text-lg !font-semibold !text-slate-800">ตั้งค่าคอลัมน์</h2>

    <mat-dialog-content class="!pt-2 !pb-4">
      <p class="text-xs text-slate-500 mb-3">เลือกคอลัมน์ที่ต้องการแสดง ลากเพื่อจัดลำดับ</p>

      <div cdkDropList (cdkDropListDropped)="drop($event)" class="flex flex-col gap-0.5">
        @for (col of columns; track col.key) {
          <div cdkDrag [cdkDragDisabled]="!!col.locked"
               class="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-slate-100
                      hover:border-slate-300 transition-colors"
               [class.opacity-50]="!!col.locked"
               [class.cursor-grab]="!col.locked">

            <!-- Drag handle -->
            @if (!col.locked) {
              <app-icon name="bars-2" cdkDragHandle class="w-4 h-4 text-slate-300 cursor-grab" />
            } @else {
              <div class="w-4 h-4"></div>
            }

            <!-- Checkbox -->
            <mat-checkbox
              [checked]="col.visible"
              [disabled]="!!col.locked"
              (change)="col.visible = $event.checked"
              color="primary">
              <span class="text-sm text-slate-700">{{ col.label }}</span>
            </mat-checkbox>

            <!-- Lock indicator -->
            @if (col.locked) {
              <app-icon name="lock-closed" class="w-3 h-3 text-slate-300 ml-auto" />
            }
          </div>
        }
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-4 !pt-2 gap-2">
      <button mat-stroked-button (click)="reset()" class="!mr-auto">
        <app-icon name="arrow-path" class="w-4 h-4 mr-1" /> รีเซ็ต
      </button>
      <button mat-stroked-button (click)="dialogRef.close()">ยกเลิก</button>
      <button mat-flat-button color="primary" (click)="save()">บันทึก</button>
    </mat-dialog-actions>
  `,
})
export class TableSettingsDialogComponent {
  dialogRef = inject(MatDialogRef<TableSettingsDialogComponent>);
  data      = inject<TableSettingsDialogData>(MAT_DIALOG_DATA);

  columns: ColumnDef[] = this.data.columns.map(c => ({ ...c }));

  drop(event: CdkDragDrop<ColumnDef[]>): void {
    moveItemInArray(this.columns, event.previousIndex, event.currentIndex);
  }

  save(): void {
    this.dialogRef.close(this.columns);
  }

  reset(): void {
    this.dialogRef.close('reset');
  }
}
