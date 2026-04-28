import { Component, OnInit, AfterViewInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SyncFromApiService, SnapshotDetailResponse } from '../sync-from-api.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { SyncSnapshotDialogComponent, SyncSnapshotDialogData } from './dialogs/sync-snapshot-dialog.component';


@Component({
  selector: 'app-snapshot-detail',
  standalone: true,
  imports: [
    CommonModule, ThaiDatePipe,
    MatTableModule, MatPaginatorModule,
    MatButtonModule, MatProgressSpinnerModule, MatSnackBarModule,
    MatDialogModule, MatTooltipModule,
    SvgIconComponent,
  ],
  templateUrl: './snapshot-detail.component.html',
})
export class SnapshotDetailComponent implements OnInit, AfterViewInit {
  private api    = inject(SyncFromApiService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private snack  = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  snapshotId = signal(0);
  loading    = signal(true);

  // Snapshot header data
  header = signal<SnapshotDetailResponse['snapshot'] | null>(null);

  // Dynamic table
  dataSource        = new MatTableDataSource<Record<string, unknown>>([]);
  dynamicColumns    = signal<string[]>([]);
  totalRecords      = signal(0);
  currentPage       = signal(1);
  pageSize          = signal(25);

  statusLabel = computed(() => {
    const s = this.header()?.status ?? '';
    return s === 'completed' ? 'สำเร็จ' : s === 'failed' ? 'ล้มเหลว' : s;
  });

  statusClass = computed(() => {
    const s = this.header()?.status ?? '';
    return s === 'completed' ? 'bg-green-100 text-green-800'
         : s === 'failed'    ? 'bg-red-100 text-red-800'
         : 'bg-amber-100 text-amber-800';
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id') ?? 0);
    this.snapshotId.set(id);
    this.loadData();
  }

  ngAfterViewInit(): void {}

  loadData(): void {
    const id = this.snapshotId();
    if (!id) return;
    this.loading.set(true);

    this.api.getSnapshotDetail(id, this.currentPage(), this.pageSize()).subscribe({
      next: res => {
        this.header.set(res.snapshot);
        this.totalRecords.set(res.pagination.total);

        // Derive columns from first data row
        if (res.data.length > 0) {
          this.dynamicColumns.set(Object.keys(res.data[0]));
        } else {
          this.dynamicColumns.set([]);
        }
        this.dataSource.data = res.data;
        this.loading.set(false);
      },
      error: () => {
        this.snack.open('โหลดข้อมูลไม่สำเร็จ', 'ปิด', { duration: 3000 });
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.loadData();
  }

  openSync(): void {
    const h = this.header();
    if (!h) return;
    this.dialog.open(SyncSnapshotDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        snapshotId: h.id,
        snapshotCode: h.code,
        projectId: h.project_id,
      } satisfies SyncSnapshotDialogData,
    }).afterClosed().subscribe(synced => {
      if (synced) {
        this.snack.open('Sync สำเร็จ', 'ปิด', { duration: 3000 });
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/sync-from-api']);
  }

  formatCellValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    return String(val);
  }
}
