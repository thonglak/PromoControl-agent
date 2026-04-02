import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProjectService } from '../../../core/services/project.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { ConfirmClearDialogComponent } from './confirm-clear-dialog.component';

@Component({
  selector: 'app-clear-transactions',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    SvgIconComponent,
  ],
  template: `
    <div class="p-6 max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-slate-800 mb-2">เครื่องมือทดสอบ</h1>
      <p class="text-sm text-slate-500 mb-6">ใช้สำหรับล้างข้อมูลในระหว่างทดสอบเท่านั้น</p>

      <mat-card class="!rounded-xl border border-red-200 !shadow-sm">
        <mat-card-content class="!p-6">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <app-icon name="trash" class="w-6 h-6 text-red-500" />
            </div>
            <div class="flex-1">
              <h2 class="text-lg font-semibold text-slate-800 mb-1">ล้างข้อมูลการขาย & งบประมาณ</h2>
              <p class="text-sm text-slate-500 mb-4">ล้างข้อมูลทั้งหมดของโครงการ <strong class="text-slate-700">{{ projectName() }}</strong></p>

              <div class="bg-red-50 rounded-lg p-4 mb-4">
                <p class="text-sm font-medium text-red-800 mb-2">ข้อมูลที่จะถูกลบ:</p>
                <ul class="text-sm text-red-700 space-y-1 ml-4 list-disc">
                  <li>รายการขายทั้งหมด (sales_transactions + items)</li>
                  <li>รายการเคลื่อนไหวงบประมาณทั้งหมด (budget_movements)</li>
                  <li>การตั้งงบผูกยูนิตทั้งหมด (unit_budget_allocations)</li>
                  <li>Reset สถานะยูนิตที่ขายแล้วกลับเป็น "available"</li>
                  <li>Reset เลขที่เอกสาร (SALE, BUDGET_MOVE) กลับเริ่มใหม่</li>
                </ul>
              </div>

              @if (result()) {
                <div class="bg-green-50 rounded-lg p-4 mb-4">
                  <p class="text-sm font-medium text-green-800 mb-2">ผลลัพธ์:</p>
                  <ul class="text-sm text-green-700 space-y-1 ml-4 list-disc">
                    <li>ลบรายการขาย: {{ result()!.deleted_transactions }} รายการ</li>
                    <li>ลบรายการขาย items: {{ result()!.deleted_transaction_items }} รายการ</li>
                    <li>ลบ budget movements: {{ result()!.deleted_budget_movements }} รายการ</li>
                    <li>ลบ budget allocations: {{ result()!.deleted_budget_allocations }} รายการ</li>
                    <li>Reset ยูนิต: {{ result()!.reset_units }} ยูนิต</li>
                  </ul>
                </div>
              }

              <button mat-flat-button
                      color="warn"
                      [disabled]="loading()"
                      (click)="onClear()"
                      class="!rounded-lg">
                @if (loading()) {
                  <mat-spinner diameter="20" class="inline-block mr-2" />
                }
                ล้างข้อมูลทั้งหมด
              </button>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class ClearTransactionsComponent {
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private projectService = inject(ProjectService);

  readonly loading = signal(false);
  readonly result = signal<any>(null);
  readonly projectName = () => this.projectService.selectedProject()?.name ?? '—';

  onClear(): void {
    const project = this.projectService.selectedProject();
    if (!project) {
      this.snackBar.open('กรุณาเลือกโครงการก่อน', 'ปิด', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(ConfirmClearDialogComponent, {
      width: '420px',
      data: { projectName: project.name },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.executeClear(+project.id);
    });
  }

  private executeClear(projectId: number): void {
    this.loading.set(true);
    this.result.set(null);

    this.http.post<any>('/api/dev/clear-transactions', { project_id: projectId }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.result.set(res.summary);
        this.snackBar.open('ล้างข้อมูลสำเร็จ', 'ปิด', { duration: 5000 });
      },
      error: (err) => {
        this.loading.set(false);
        this.snackBar.open(err.error?.error ?? 'เกิดข้อผิดพลาด', 'ปิด', { duration: 5000 });
      },
    });
  }
}
