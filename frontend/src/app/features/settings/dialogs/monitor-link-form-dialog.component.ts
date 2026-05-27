import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

interface ProjectOption {
  id: number;
  code: string;
  name: string;
}

export interface MonitorLinkFormData {
  /** ถ้ามี = edit; ถ้าไม่มี = create */
  id?: number;
  name?: string;
  projectIds?: number[];
}

@Component({
  selector: 'app-monitor-link-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatCheckboxModule, MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-base">{{ data.id ? 'แก้ไขลิงค์ Monitor' : 'สร้างลิงค์ Monitor ใหม่' }}</h2>

    <mat-dialog-content class="!pb-2">
      <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
        <mat-label>ชื่อลิงค์</mat-label>
        <input matInput [(ngModel)]="name" placeholder="เช่น ผู้บริหาร, ฝ่ายตลาด" maxlength="100">
      </mat-form-field>

      <p class="text-xs text-slate-500 mt-4 mb-2">เลือกโครงการที่จะให้ดู (อย่างน้อย 1):</p>

      @if (loadingProjects()) {
        <div class="py-6 text-center"><mat-spinner diameter="24" class="mx-auto" /></div>
      } @else {
        <div class="border border-slate-200 rounded max-h-72 overflow-y-auto">
          @for (p of projects(); track p.id) {
            <label class="flex items-start gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0">
              <mat-checkbox [checked]="isSelected(p.id)" (change)="toggle(p.id, $event.checked)" class="!mt-0.5" />
              <div class="min-w-0 flex-1">
                <p class="text-sm text-slate-800 font-medium leading-tight">
                  <span class="font-mono text-xs text-slate-500">{{ p.code }}</span>
                  · {{ p.name }}
                </p>
              </div>
            </label>
          } @empty {
            <p class="text-sm text-slate-400 text-center py-6">ไม่พบโครงการ</p>
          }
        </div>
        <p class="text-xs text-slate-400 mt-1.5">เลือกแล้ว {{ selected().size }} โครงการ</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!pt-2 gap-2">
      <button mat-stroked-button (click)="ref.close()">ยกเลิก</button>
      <button mat-flat-button color="primary"
        [disabled]="saving() || name().trim() === '' || selected().size === 0"
        (click)="save()">
        @if (saving()) { <mat-spinner diameter="16" class="!inline-block mr-2" /> }
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
})
export class MonitorLinkFormDialogComponent implements OnInit {
  readonly data: MonitorLinkFormData = inject(MAT_DIALOG_DATA) ?? {};
  readonly ref = inject(MatDialogRef<MonitorLinkFormDialogComponent>);
  private http = inject(HttpClient);

  readonly loadingProjects = signal(true);
  readonly saving = signal(false);
  readonly projects = signal<ProjectOption[]>([]);

  readonly name = signal<string>(this.data.name ?? '');
  readonly selected = signal<Set<number>>(new Set(this.data.projectIds ?? []));

  ngOnInit(): void {
    this.http.get<{ data: ProjectOption[] }>('/api/projects').subscribe({
      next: res => {
        this.projects.set(res.data ?? []);
        this.loadingProjects.set(false);
      },
      error: () => this.loadingProjects.set(false),
    });
  }

  isSelected(id: number): boolean {
    return this.selected().has(id);
  }

  toggle(id: number, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(id); else next.delete(id);
    this.selected.set(next);
  }

  save(): void {
    const payload = {
      name: this.name().trim(),
      project_ids: Array.from(this.selected()),
    };
    this.saving.set(true);

    const req = this.data.id
      ? this.http.put(`/api/monitor-links/${this.data.id}`, payload)
      : this.http.post(`/api/monitor-links`, payload);

    req.subscribe({
      next: res => { this.saving.set(false); this.ref.close(res ?? true); },
      error: err => {
        this.saving.set(false);
        alert(err?.error?.messages?.name || err?.error?.messages?.project_ids || err?.error?.error || 'บันทึกไม่สำเร็จ');
      },
    });
  }
}
