import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';

import { UnitBudgetSettingRow } from '../services/budget.service';

@Component({
  selector: 'app-unit-budget-breakdown-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatTableModule],
  template: `
    <h2 mat-dialog-title>รายการที่นำมาคำนวณ — ยูนิต {{ data.unit_code }}</h2>
    <mat-dialog-content style="max-height: 70vh">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 16px; padding: 12px 16px; background: var(--color-surface-container); border-radius: 8px">
        <div><span style="color: var(--color-text-secondary)">แบบบ้าน:</span> <strong>{{ data.house_model_name || '—' }}</strong></div>
        <div><span style="color: var(--color-text-secondary)">จำนวนรายการ:</span> <strong>{{ data.item_count }}</strong></div>
        <div><span style="color: var(--color-text-secondary)">งบเดิม:</span> <strong class="num">{{ data.current_budget | number }}</strong></div>
        <div><span style="color: var(--color-text-secondary)">งบที่คำนวณได้:</span>
          <strong class="num" style="color: var(--color-primary)">{{ data.calculated_budget | number }}</strong>
        </div>
      </div>

      @if (data.items.length > 0) {
        <table mat-table [dataSource]="data.items" style="width: 100%">
          <ng-container matColumnDef="code">
            <th mat-header-cell *matHeaderCellDef>รหัส</th>
            <td mat-cell *matCellDef="let r" class="font-mono">{{ r.code }}</td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>ชื่อรายการ</th>
            <td mat-cell *matCellDef="let r">{{ r.name }}</td>
          </ng-container>
          <ng-container matColumnDef="value">
            <th mat-header-cell *matHeaderCellDef style="text-align: right">มูลค่า</th>
            <td mat-cell *matCellDef="let r" class="num">{{ r.value | number }}</td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let r; columns: cols"></tr>

          <ng-container matColumnDef="totalLabel">
            <td mat-footer-cell *matFooterCellDef colspan="2" style="text-align: right; font-weight: 600">รวม</td>
          </ng-container>
          <ng-container matColumnDef="totalValue">
            <td mat-footer-cell *matFooterCellDef class="num" style="font-weight: 700; color: var(--color-primary)">
              {{ data.calculated_budget | number }}
            </td>
          </ng-container>
          <tr mat-footer-row *matFooterRowDef="footerCols"></tr>
        </table>
      } @else {
        <div style="text-align: center; padding: 32px; color: var(--color-text-secondary)">
          ไม่มีรายการโปรโมชั่นมาตรฐานที่ยูนิตนี้มีสิทธิ์ใช้
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ปิด</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: var(--font-mono, ui-monospace, monospace);
    }
  `],
})
export class UnitBudgetBreakdownDialogComponent {
  readonly data: UnitBudgetSettingRow = inject(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<UnitBudgetBreakdownDialogComponent>);
  readonly cols = ['code', 'name', 'value'];
  readonly footerCols = ['totalLabel', 'totalValue'];
}
