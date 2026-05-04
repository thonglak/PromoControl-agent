import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { SalesEntryService, SalesTransactionDetail } from '../services/sales-entry.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { TransferDialogComponent } from '../transfer-dialog/transfer-dialog.component';
import { CancelSaleDialogComponent } from '../cancel-sale-dialog/cancel-sale-dialog.component';

@Component({
  selector: 'app-sales-detail',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatTooltipModule, MatDialogModule,
    SvgIconComponent, PageHeaderComponent, SectionCardComponent,
    StatCardComponent, StatusChipComponent, ThaiDatePipe,
  ],
  template: `
    <div class="p-6" style="max-width: 1440px; margin: 0 auto;">
      @if (loading()) {
        <div class="section-card p-12 text-center">
          <mat-spinner diameter="36" class="mx-auto mb-3"></mat-spinner>
          <p class="text-sm" style="color: var(--color-text-secondary)">กำลังโหลดรายละเอียด...</p>
        </div>
      } @else if (data()) {

        <!-- ═══ Status Banners ═══ -->
        @if (tx().status === 'cancelled') {
          <div class="status-banner status-banner--error mb-4">
            <app-icon name="x-circle" class="w-5 h-5 flex-shrink-0" style="color: var(--color-error)" />
            <div>
              <strong>รายการนี้ถูกยกเลิกแล้ว</strong>
              @if (tx().cancel_date) {
                <p class="mt-1 mb-0 text-sm">วันที่ยกเลิก: {{ tx().cancel_date | thaiDate:'auto' }}</p>
              }
              @if (tx().cancel_reason) {
                <p class="mt-1 mb-0 text-sm">เหตุผล: {{ tx().cancel_reason }}</p>
              }
              <p class="mt-1 mb-0 text-sm" style="color: var(--color-text-secondary)">
                บันทึกโดย: {{ tx().cancelled_by_name }} &middot; {{ tx().cancelled_at | thaiDate:'auto-datetime' }}
              </p>
            </div>
          </div>
        }
        @if (tx().unit_status === 'transferred' && tx().status !== 'cancelled') {
          <div class="status-banner status-banner--info mb-4">
            <app-icon name="check-circle" class="w-5 h-5 flex-shrink-0" style="color: var(--color-info)" />
            <div>
              <strong>โอนกรรมสิทธิ์แล้ว</strong>
              <p class="mt-1 mb-0 text-sm" style="color: var(--color-text-secondary)">
                วันที่โอน: {{ tx().transfer_date | thaiDate:'auto' }} &middot;
                บันทึกโดย: {{ tx().transferred_by_name }} &middot; {{ tx().transferred_at | thaiDate:'auto-datetime' }}
              </p>
            </div>
          </div>
        }

        <!-- ═══ Page Header ═══ -->
        <app-page-header
          [title]="'รายละเอียดรายการขาย'"
          [subtitle]="tx().sale_no ? '#' + tx().sale_no : ''">
          <div actions class="flex items-center gap-2 flex-wrap">
            <app-status-chip type="transaction_status" [value]="tx().status" />
            @if (tx().unit_status) {
              <app-status-chip type="unit_status" [value]="tx().unit_status" />
            }
            <div class="w-px h-6 mx-1" style="background: var(--color-gray-300)"></div>
            <button mat-stroked-button (click)="goBack()">
              <app-icon name="arrow-left" class="w-4 h-4 mr-1" /> กลับ
            </button>
            @if (tx().status === 'active' && tx().unit_status === 'sold') {
              <button mat-flat-button color="primary" (click)="openTransferDialog()">โอนกรรมสิทธิ์</button>
            }
            @if (tx().status === 'active' && tx().unit_status !== 'transferred') {
              <button mat-stroked-button color="warn" (click)="openCancelDialog()">ยกเลิกขาย</button>
            }
            @if (canEdit()) {
              <button mat-flat-button color="primary" (click)="goToEdit()">
                <app-icon name="pencil" class="w-4 h-4 mr-1" /> แก้ไข
              </button>
            }
          </div>
        </app-page-header>

        <!-- ═══ 2-Column Layout ═══ -->
        <div class="main-grid">

          <!-- ──── Left Column: เนื้อหาหลัก ──── -->
          <div class="left-col">

            <!-- ข้อมูลยูนิต -->
            <app-section-card title="ข้อมูลยูนิต" icon="building-office" class="mb-8">
              <div class="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <div class="detail-field">
                  <span class="detail-label">โครงการ</span>
                  <span class="detail-value">{{ tx().project_name }}</span>
                </div>
                <div class="detail-field">
                  <span class="detail-label">ยูนิต</span>
                  <span class="detail-value font-mono">{{ tx().unit_code }}</span>
                </div>
                <div class="detail-field">
                  <span class="detail-label">วันที่ขาย</span>
                  <span class="detail-value">{{ tx().sale_date | thaiDate:'auto' }}</span>
                </div>
                <div class="detail-field">
                  <span class="detail-label">ราคาหน้าสัญญา</span>
                  <span class="detail-value tabular-nums">
                    @if (tx().contract_price != null) {
                      ฿{{ n(tx().contract_price) | number:'1.0-0' }}
                    } @else {
                      <span style="color: var(--color-gray-400)">—</span>
                    }
                  </span>
                </div>
                <div class="detail-field">
                  <span class="detail-label">ราคาขาย</span>
                  <span class="detail-value tabular-nums">฿{{ n(tx().base_price) | number:'1.0-0' }}</span>
                </div>
              </div>
            </app-section-card>

            <!-- โปรโมชั่น: งบยูนิต -->
            @if (unitItems().length > 0) {
              <app-section-card title="โปรโมชั่น — งบยูนิต" icon="gift" [noPadding]="true" class="mb-8">
                <span card-actions class="badge badge--info">{{ unitItems().length }} รายการ</span>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr>
                        <th class="tbl-th text-left w-12 pl-6">#</th>
                        <th class="tbl-th text-left">รายการ</th>
                        <th class="tbl-th text-right">มูลค่าที่ใช้</th>
                        <th class="tbl-th text-center w-28">แปลงส่วนลด</th>
                        <th class="tbl-th text-left pr-6">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of unitItems(); track item.id; let i = $index) {
                        <tr class="tbl-row">
                          <td class="tbl-td pl-6 tabular-nums" style="color: var(--color-gray-400)">{{ i + 1 }}</td>
                          <td class="tbl-td">
                            <div class="font-medium" style="color: var(--color-text-primary)">{{ item.promotion_item_name || 'รายการ #' + item.promotion_item_id }}</div>
                            <app-status-chip type="promotion_category" [value]="item.promotion_category" class="mt-0.5" />
                          </td>
                          <td class="tbl-td text-right tabular-nums font-semibold" style="color: var(--color-text-primary)">฿{{ n(item.used_value) | number:'1.0-0' }}</td>
                          <td class="tbl-td text-center">
                            @if (item.convert_to_discount === '1' || item.convert_to_discount === true) {
                              <app-icon name="check" class="w-4 h-4 mx-auto" style="color: var(--color-success)" />
                            } @else {
                              <span style="color: var(--color-gray-300)">—</span>
                            }
                          </td>
                          <td class="tbl-td text-xs pr-6" style="color: var(--color-text-secondary)">{{ item.remark || '—' }}</td>
                        </tr>
                      }
                    </tbody>
                    <tfoot>
                      <tr class="tbl-foot">
                        <td colspan="2" class="tbl-td pl-6 text-right font-semibold">รวมงบยูนิต</td>
                        <td class="tbl-td text-right tabular-nums font-bold" style="color: var(--color-primary-700); font-size: 15px">฿{{ unitTotal() | number:'1.0-0' }}</td>
                        <td colspan="2" class="tbl-td pr-6"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </app-section-card>
            }

            <!-- โปรโมชั่น: งบอื่นๆ -->
            @if (otherItems().length > 0) {
              <app-section-card title="โปรโมชั่น — งบอื่นๆ" icon="gift" [noPadding]="true" class="mb-8">
                <span card-actions class="badge badge--warn">{{ otherItems().length }} รายการ</span>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr>
                        <th class="tbl-th text-left w-12 pl-6">#</th>
                        <th class="tbl-th text-left">รายการ</th>
                        <th class="tbl-th text-left">แหล่งงบ</th>
                        <th class="tbl-th text-right">มูลค่าที่ใช้</th>
                        <th class="tbl-th text-center w-28">แปลงส่วนลด</th>
                        <th class="tbl-th text-left pr-6">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of otherItems(); track item.id; let i = $index) {
                        <tr class="tbl-row">
                          <td class="tbl-td pl-6 tabular-nums" style="color: var(--color-gray-400)">{{ i + 1 }}</td>
                          <td class="tbl-td">
                            <div class="font-medium" style="color: var(--color-text-primary)">{{ item.promotion_item_name || 'รายการ #' + item.promotion_item_id }}</div>
                            <app-status-chip type="promotion_category" [value]="item.promotion_category" class="mt-0.5" />
                          </td>
                          <td class="tbl-td"><app-status-chip type="budget_source" [value]="fundingToChipValue(item.funding_source_type)" /></td>
                          <td class="tbl-td text-right tabular-nums font-semibold" style="color: var(--color-text-primary)">฿{{ n(item.used_value) | number:'1.0-0' }}</td>
                          <td class="tbl-td text-center">
                            @if (item.convert_to_discount === '1' || item.convert_to_discount === true) {
                              <app-icon name="check" class="w-4 h-4 mx-auto" style="color: var(--color-success)" />
                            } @else {
                              <span style="color: var(--color-gray-300)">—</span>
                            }
                          </td>
                          <td class="tbl-td text-xs pr-6" style="color: var(--color-text-secondary)">{{ item.remark || '—' }}</td>
                        </tr>
                      }
                    </tbody>
                    <tfoot>
                      <tr class="tbl-foot">
                        <td colspan="3" class="tbl-td pl-6 text-right font-semibold">รวมงบอื่นๆ</td>
                        <td class="tbl-td text-right tabular-nums font-bold" style="color: var(--color-primary-700); font-size: 15px">฿{{ otherTotal() | number:'1.0-0' }}</td>
                        <td colspan="2" class="tbl-td pr-6"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </app-section-card>
            }

            <!-- ไม่มีรายการ -->
            @if (items().length === 0) {
              <app-section-card class="mb-6">
                <div class="text-center py-8">
                  <app-icon name="inbox" class="w-12 h-12 mx-auto mb-3" style="color: var(--color-gray-300)" />
                  <p class="text-sm font-medium" style="color: var(--color-text-secondary)">ไม่มีรายการโปรโมชั่น</p>
                </div>
              </app-section-card>
            }

            <!-- Budget Movements -->
            @if (movements().length > 0) {
              <app-section-card title="เคลื่อนไหวงบประมาณ" icon="arrows-right-left" [noPadding]="true" class="mb-6">
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr>
                        <th class="tbl-th text-left pl-6">เลขที่</th>
                        <th class="tbl-th text-left">ประเภท</th>
                        <th class="tbl-th text-left">แหล่งงบ</th>
                        <th class="tbl-th text-right">จำนวนเงิน</th>
                        <th class="tbl-th text-left pr-6">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (mv of movements(); track mv.id) {
                        <tr class="tbl-row">
                          <td class="tbl-td pl-6 font-mono text-xs" style="color: var(--color-text-secondary)">{{ mv.movement_no || '—' }}</td>
                          <td class="tbl-td"><app-status-chip type="movement_type" [value]="mv.movement_type" /></td>
                          <td class="tbl-td"><app-status-chip type="budget_source" [value]="fundingToChipValue(mv.budget_source_type)" /></td>
                          <td class="tbl-td text-right tabular-nums font-semibold"
                            [class.text-loss]="n(mv.amount) < 0"
                            [class.text-profit]="n(mv.amount) > 0">
                            ฿{{ n(mv.amount) | number:'1.0-0' }}
                          </td>
                          <td class="tbl-td pr-6"><app-status-chip type="movement_status" [value]="mv.status" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </app-section-card>
            }
          </div>

          <!-- ──── Right Column: สรุปการเงิน (sticky) ──── -->
          <div class="right-col">
            <div class="sticky-sidebar">

              <!-- สรุปการขาย — เน้นเฉพาะ sales metrics (ไม่ซ้อนกับ panel งบประมาณด้านล่าง) -->
              <div class="section-card summary-box">
                <h3 class="font-semibold mb-4" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">สรุปการขาย</h3>

                <div class="space-y-1 text-sm">
                  <!-- ราคาขาย -->
                  <div class="s-row">
                    <span class="s-label">ราคาขาย (Base Price)</span>
                    <span class="s-value tabular-nums">{{ n(tx().base_price) | number:'1.0-0' }}</span>
                  </div>

                  <!-- ส่วนลดทั้งหมด -->
                  <div class="s-row">
                    <span class="s-label">ส่วนลดทั้งหมด</span>
                    <span class="s-value tabular-nums text-discount">
                      @if (n(tx().total_discount) > 0) { - }{{ n(tx().total_discount) | number:'1.0-0' }}
                    </span>
                  </div>

                  <!-- ราคาสุทธิ (highlight) -->
                  <div class="s-row s-row--highlight">
                    <span class="font-bold">ราคาสุทธิ (Net Price)</span>
                    <span class="tabular-nums text-xl font-bold">{{ n(tx().net_price) | number:'1.0-0' }}</span>
                  </div>

                  <div class="s-sep"></div>

                  <!-- ต้นทุนของแถม -->
                  <div class="s-row">
                    <span class="s-label">ต้นทุนของแถม</span>
                    <span class="s-value tabular-nums">{{ n(tx().total_promo_cost) | number:'1.0-0' }}</span>
                  </div>

                  <!-- ค่าใช้จ่ายอุดหนุน -->
                  <div class="s-row">
                    <span class="s-label">ค่าใช้จ่ายอุดหนุน</span>
                    <span class="s-value tabular-nums">{{ n(tx().total_expense_support) | number:'1.0-0' }}</span>
                  </div>

                  <!-- สุทธิหลังของแถม (subtotal) -->
                  <div class="s-row font-semibold" style="border-top: 1px solid var(--color-gray-200); padding-top: 8px; color: var(--color-text-primary)">
                    <span>สุทธิหลังของแถม</span>
                    <span class="tabular-nums">{{ netAfterPromo() | number:'1.0-0' }}</span>
                  </div>

                  <!-- ต้นทุนยูนิต -->
                  <div class="s-row">
                    <span class="s-label">ต้นทุนยูนิต</span>
                    <span class="s-value tabular-nums">{{ n(tx().unit_cost) | number:'1.0-0' }}</span>
                  </div>

                  <div class="s-sep"></div>

                  <!-- กำไร -->
                  <div class="s-row s-row--profit"
                    [class.text-profit]="n(tx().profit) >= 0"
                    [class.text-loss]="n(tx().profit) < 0">
                    <span class="text-base font-bold">กำไร (Profit)</span>
                    <span class="tabular-nums text-base font-bold">{{ n(tx().profit) | number:'1.0-0' }}</span>
                  </div>
                </div>
              </div>

              <!-- สรุปการใช้งบประมาณ — สถานะงบของยูนิตและการใช้ในรายการนี้ -->
              <div class="section-card summary-box mt-4">
                <h3 class="font-semibold mb-1" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">สรุปการใช้งบประมาณ</h3>
                <p class="text-xs mb-4" style="color: var(--color-text-secondary)">สถานะงบของยูนิตและการใช้ในรายการนี้</p>

                <!-- ── ส่วนที่ 1: สถานะงบของยูนิต (3 buckets) ─────────── -->
                <p class="bg-section-label">สถานะงบของยูนิต</p>
                <div class="space-y-2 text-sm">
                  <!-- งบมาตรฐาน (UNIT_STANDARD) -->
                  <div class="bg-bucket">
                    <div class="bg-bucket__head">
                      <span class="bg-bucket__name">
                        <span class="bg-dot" style="background: var(--color-primary)"></span>
                        งบมาตรฐาน (Unit)
                      </span>
                      <span class="tabular-nums font-medium">฿{{ n(bs().unit_budget) | number:'1.0-0' }}</span>
                    </div>
                    <div class="bg-bucket__row">
                      <span class="s-label">ใช้ไปแล้ว</span>
                      <span class="tabular-nums text-discount">{{ n(bs().unit_budget_used) | number:'1.0-0' }}</span>
                    </div>
                    <div class="bg-bucket__row">
                      <span class="s-label">คงเหลือ</span>
                      <span class="tabular-nums font-semibold"
                        [class.text-loss]="n(bs().unit_budget_remaining) < 0"
                        [class.text-profit]="n(bs().unit_budget_remaining) >= 0">
                        {{ n(bs().unit_budget_remaining) | number:'1.0-0' }}
                      </span>
                    </div>
                  </div>

                  <!-- งบ Pool -->
                  <div class="bg-bucket">
                    <div class="bg-bucket__head">
                      <span class="bg-bucket__name">
                        <span class="bg-dot" style="background: var(--color-info)"></span>
                        งบ Pool (โครงการ)
                      </span>
                      <span class="tabular-nums font-medium">฿{{ n(bs().pool_budget) | number:'1.0-0' }}</span>
                    </div>
                    <div class="bg-bucket__row">
                      <span class="s-label">ใช้ไปแล้ว</span>
                      <span class="tabular-nums text-discount">{{ n(bs().pool_budget_used) | number:'1.0-0' }}</span>
                    </div>
                    <div class="bg-bucket__row">
                      <span class="s-label">คงเหลือ</span>
                      <span class="tabular-nums font-semibold"
                        [class.text-loss]="n(bs().pool_budget_remaining) < 0"
                        [class.text-profit]="n(bs().pool_budget_remaining) >= 0">
                        {{ n(bs().pool_budget_remaining) | number:'1.0-0' }}
                      </span>
                    </div>
                  </div>

                  <!-- งบผู้บริหาร (MANAGEMENT_SPECIAL) -->
                  <div class="bg-bucket">
                    <div class="bg-bucket__head">
                      <span class="bg-bucket__name">
                        <span class="bg-dot" style="background: var(--color-warning)"></span>
                        งบผู้บริหาร
                      </span>
                      <span class="tabular-nums font-medium">฿{{ n(bs().mgmt_budget) | number:'1.0-0' }}</span>
                    </div>
                    <div class="bg-bucket__row">
                      <span class="s-label">ใช้ไปแล้ว</span>
                      <span class="tabular-nums text-discount">{{ n(bs().mgmt_budget_used) | number:'1.0-0' }}</span>
                    </div>
                    <div class="bg-bucket__row">
                      <span class="s-label">คงเหลือ</span>
                      <span class="tabular-nums font-semibold"
                        [class.text-loss]="n(bs().mgmt_budget_remaining) < 0"
                        [class.text-profit]="n(bs().mgmt_budget_remaining) >= 0">
                        {{ n(bs().mgmt_budget_remaining) | number:'1.0-0' }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="s-sep"></div>

                <!-- ── ส่วนที่ 2: การใช้ในรายการขายนี้ ─────────────── -->
                <p class="bg-section-label">การใช้ในรายการขายนี้</p>
                <div class="space-y-1 text-sm">
                  <div class="s-row">
                    <span class="s-label">งบยูนิต</span>
                    <span class="s-value tabular-nums">{{ unitTotal() | number:'1.0-0' }}</span>
                  </div>
                  <div class="s-row">
                    <span class="s-label">งบนอก (Pool + ผู้บริหาร)</span>
                    <span class="s-value tabular-nums">{{ otherTotal() | number:'1.0-0' }}</span>
                  </div>
                  <div class="s-row font-semibold" style="border-top: 1px solid var(--color-gray-200); padding-top: 6px; color: var(--color-text-primary)">
                    <span>รวมที่ใช้</span>
                    <span class="tabular-nums">{{ allItemsTotal() | number:'1.0-0' }}</span>
                  </div>
                  <div class="s-row text-xs" style="color: var(--color-gray-500)">
                    <span>งบนอกสุทธิที่ใช้
                      <span matTooltip="งบอื่นที่ใช้ในรายการนี้ - งบยูนิตคงเหลือ" class="cursor-help">ⓘ</span>
                    </span>
                    <span class="tabular-nums font-medium"
                      [class.text-discount]="netExtraBudgetUsed() > 0"
                      [class.text-profit]="netExtraBudgetUsed() <= 0">
                      {{ netExtraBudgetUsed() | number:'1.0-0' }}
                    </span>
                  </div>
                </div>

                <div class="s-sep"></div>

                <!-- งบรวมคงเหลือ (highlight) -->
                <div class="s-row s-row--highlight">
                  <span class="font-bold">งบรวมคงเหลือทั้งยูนิต</span>
                  <span class="tabular-nums text-base font-bold"
                    [class.text-loss]="n(bs().total_remaining) < 0">
                    {{ n(bs().total_remaining) | number:'1.0-0' }}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>

      } @else {
        <div class="section-card p-12 text-center">
          <app-icon name="inbox" class="w-12 h-12 mx-auto mb-3" style="color: var(--color-gray-300)" />
          <p class="font-medium mb-1" style="color: var(--color-text-primary)">ไม่พบรายการขาย</p>
          <p class="text-sm mb-4" style="color: var(--color-text-secondary)">รายการที่คุณค้นหาอาจถูกลบหรือไม่มีอยู่</p>
          <button mat-flat-button color="primary" (click)="goBack()">
            <app-icon name="arrow-left" class="w-4 h-4 mr-1" /> กลับไปรายการขาย
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* ── 2-Column Layout ── */
    .main-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 28px;
    }
    @media (min-width: 1024px) {
      .main-grid {
        grid-template-columns: 1fr 340px;
      }
    }
    @media (min-width: 1280px) {
      .main-grid {
        grid-template-columns: 1fr 380px;
      }
    }
    .sticky-sidebar {
      position: sticky;
      top: 24px;
    }

    /* ── Status Banners ── */
    .status-banner {
      padding: 14px 20px;
      display: flex;
      gap: 12px;
      align-items: flex-start;
      border-radius: var(--radius-md);
      font-size: 14px;
    }
    .status-banner--error {
      background: var(--color-error-subtle);
      border-left: 4px solid var(--color-error);
      color: var(--color-error);
    }
    .status-banner--info {
      background: var(--color-info-subtle);
      border-left: 4px solid var(--color-info);
      color: var(--color-info);
    }

    /* ── Detail fields ── */
    .detail-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .detail-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--color-gray-500);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .detail-value {
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text-primary);
    }

    /* ── Badge ── */
    .badge {
      font-size: 12px;
      padding: 2px 10px;
      border-radius: var(--radius-full);
      font-weight: 600;
    }
    .badge--info { background: var(--color-info-subtle); color: var(--color-info); }
    .badge--warn { background: var(--color-warning-subtle); color: var(--color-discount); }

    /* ── Table ── */
    .tbl-th {
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--color-gray-500);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--color-gray-50);
      white-space: nowrap;
      border-bottom: 1px solid var(--color-border);
    }
    .tbl-td {
      padding: 10px 12px;
      vertical-align: middle;
    }
    .tbl-row {
      border-bottom: 1px solid var(--color-gray-100);
      transition: background 0.15s;
    }
    .tbl-row:hover { background: var(--color-primary-100); }
    .tbl-row:last-child { border-bottom: none; }
    .tbl-foot td {
      border-top: 2px solid var(--color-gray-300);
      padding-top: 12px;
    }

    /* ── Financial Summary ── */
    .fin-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }
    .fin-label {
      font-size: 13px;
      color: var(--color-text-secondary);
    }
    .fin-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text-primary);
    }
    .fin-divider {
      border-top: 1px solid var(--color-gray-200);
    }
    .budget-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .budget-source-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
    }
    /* ── Summary Box ── */
    .summary-box {
      padding: var(--space-5);
    }
    .s-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
    }
    .s-label {
      color: var(--color-text-secondary);
    }
    .s-value {
      font-weight: 500;
      color: var(--color-text-primary);
    }
    .s-row--highlight {
      background: var(--color-primary-100);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      margin: 4px 0;
      color: var(--color-primary);
    }
    .s-row--profit {
      padding: 8px 12px;
      border-radius: var(--radius-sm);
    }
    .s-sep {
      border-top: 1px solid var(--color-gray-300);
      margin: 8px 0;
    }
    .fin-divider-bold {
      border-top: 2px solid var(--color-gray-300);
      margin: 2px 0;
    }

    /* ── Budget section label ── */
    .bg-section-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--color-gray-500);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 8px 0;
    }

    /* ── Budget Bucket (สรุปการใช้งบประมาณ) ── */
    .bg-bucket {
      padding: 10px 12px;
      border: 1px solid var(--color-gray-200);
      border-radius: var(--radius-sm);
      background: var(--color-gray-50);
    }
    .bg-bucket__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 6px;
      margin-bottom: 6px;
      border-bottom: 1px solid var(--color-gray-200);
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .bg-bucket__name {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }
    .bg-bucket__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 3px 0;
      font-size: 12px;
    }
    .bg-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      display: inline-block;
    }
  `],
})
export class SalesDetailComponent implements OnInit {
  private salesSvc = inject(SalesEntryService);
  private project = inject(ProjectService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  readonly loading = signal(false);
  readonly data = signal<SalesTransactionDetail | null>(null);

  readonly tx = computed(() => this.data()?.sales_transaction ?? {} as any);
  readonly items = computed(() => this.data()?.items ?? []);
  readonly movements = computed(() => this.data()?.budget_movements ?? []);
  readonly bs = computed(() => (this.data() as any)?.budget_summary ?? {} as any);

  readonly unitItems = computed(() =>
    this.items().filter((it: any) => it.funding_source_type === 'UNIT_STANDARD')
  );
  readonly otherItems = computed(() =>
    this.items().filter((it: any) => it.funding_source_type !== 'UNIT_STANDARD')
  );
  readonly unitTotal = computed(() =>
    this.unitItems().reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
  );
  readonly otherTotal = computed(() =>
    this.otherItems().reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
  );
  readonly poolTotal = computed(() =>
    this.items().filter((it: any) => it.funding_source_type === 'PROJECT_POOL')
      .reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
  );
  readonly mgmtTotal = computed(() =>
    this.items().filter((it: any) => it.funding_source_type === 'MANAGEMENT_SPECIAL')
      .reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
  );
  readonly allItemsTotal = computed(() =>
    this.items().reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
  );

  readonly canEdit = computed(() => {
    const role = this.auth.currentUser()?.role;
    const txStatus = this.tx()?.status;
    const unitStatus = this.tx()?.unit_status;
    // ห้ามแก้ไขถ้ายกเลิกแล้วหรือโอนแล้ว
    if (txStatus === 'cancelled' || unitStatus === 'transferred') return false;
    // ตรวจสิทธิ์จาก role + project access (จาก user.projects)
    if (role !== 'admin' && role !== 'manager') return false;
    const projectId = this.tx()?.project_id;
    const user = this.auth.currentUser();
    if (!projectId || !user) return false;
    const proj = user.projects?.find((p: any) => String(p.id) === String(projectId));
    return proj?.access_level === 'edit';
  });

  n(v: any): number { return Number(v) || 0; }

  readonly netAfterPromo = computed(() =>
    this.n(this.tx().net_price) - this.n(this.tx().total_promo_burden)
  );

  readonly netExtraBudgetUsed = computed(() =>
    this.otherTotal() - this.n((this.data() as any)?.budget_summary?.unit_budget_remaining ?? 0)
  );

  fundingToChipValue(source: string): string {
    const map: Record<string, string> = {
      UNIT_STANDARD: 'unit_standard',
      PROJECT_POOL: 'pool',
      MANAGEMENT_SPECIAL: 'executive',
    };
    return map[source] ?? source;
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id > 0) this.loadDetail(id);
  }

  private loadDetail(id: number): void {
    this.loading.set(true);
    this.salesSvc.getTransaction(id).subscribe({
      next: res => { this.data.set(res); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.snack.open('ไม่สามารถโหลดข้อมูลได้', 'ปิด', { duration: 4000 });
      },
    });
  }

  goBack(): void { this.router.navigate(['/sales/list']); }
  goToEdit(): void {
    const id = this.tx().id;
    if (id) this.router.navigate(['/sales', id, 'edit']);
  }

  openTransferDialog(): void {
    const ref = this.dialog.open(TransferDialogComponent, {
      width: '450px',
      data: { transaction: { id: this.tx().id, sale_no: this.tx().sale_no, unit_code: this.tx().unit_code, net_price: this.tx().net_price } }
    });
    ref.afterClosed().subscribe(result => {
      if (result?.success) {
        const totalReturned = Number(result?.data?.total_returned ?? 0);
        const msg = totalReturned > 0
          ? `โอนกรรมสิทธิ์สำเร็จ — คืนงบเข้า Pool ฿${totalReturned.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
          : 'โอนกรรมสิทธิ์สำเร็จ';
        this.snack.open(msg, 'ปิด', { duration: 4000 });
        this.loadDetail(this.tx().id);
      }
    });
  }

  openCancelDialog(): void {
    const ref = this.dialog.open(CancelSaleDialogComponent, {
      width: '520px',
      data: { id: this.tx().id, sale_no: this.tx().sale_no, unit_code: this.tx().unit_code, net_price: this.tx().net_price, sale_date: this.tx().sale_date }
    });
    ref.afterClosed().subscribe(result => {
      if (result?.success) {
        this.snack.open('ยกเลิกรายการขายสำเร็จ', 'ปิด', { duration: 3000 });
        this.loadDetail(this.tx().id);
      }
    });
  }
}
