import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { BottomLineApiService, BottomLineRecord } from '../bottom-line-api.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { formatThaiDate } from '../../../shared/pipes/thai-date.pipe';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';

@Component({
  selector: 'app-bottom-line-detail',
  standalone: true,
  imports: [
    ThaiDatePipe,CommonModule, MatTableModule, MatButtonModule, MatProgressSpinnerModule, SvgIconComponent],
  templateUrl: './bottom-line-detail.component.html',
})
export class BottomLineDetailComponent implements OnInit {
  private api    = inject(BottomLineApiService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  loading = signal(true);
  record  = signal<BottomLineRecord | null>(null);
  rowColumns = ['row_number', 'unit_code', 'bottom_line_price', 'appraisal_price', 'old_unit_cost', 'old_appraisal', 'status'];

  ngOnInit(): void {
    const key = this.route.snapshot.paramMap.get('importKey') ?? '';
    this.api.getDetail(key).subscribe({
      next: r => { this.record.set(r); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  goBack(): void { this.router.navigate(['/bottom-line/history']); }

  statusLabel(s: string): string {
    const m: Record<string, string> = { matched: 'พร้อม', unmatched: 'ไม่พบยูนิต', updated: 'อัปเดตแล้ว', skipped: 'ข้าม' };
    return m[s] ?? s;
  }

  statusClass(s: string): string {
    return s === 'updated' ? 'bg-green-100 text-green-800'
         : s === 'unmatched' ? 'bg-red-100 text-red-800'
         : s === 'matched' ? 'bg-blue-100 text-blue-800'
         : 'bg-slate-100 text-slate-600';
  }

  recordStatusLabel(s: string): string {
    return s === 'completed' ? 'สำเร็จ' : s === 'failed' ? 'ล้มเหลว' : 'ย้อนกลับแล้ว';
  }

  recordStatusClass(s: string): string {
    return s === 'completed' ? 'bg-green-100 text-green-800' : s === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
  }

  formatCurrency(v: any): string {
    const n = Number(v);
    return isNaN(n) ? '—' : '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 0 });
  }

  formatDate(d: string): string {
    return formatThaiDate(d, 'auto-datetime');
  }
}
