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
    <div class="p-3 sm:p-6 pb-24 lg:pb-6" style="max-width: 1440px; margin: 0 auto;">
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
          <div actions class="header-actions">
            <div class="flex items-center gap-2 flex-wrap">
              <app-status-chip type="transaction_status" [value]="tx().status" />
              @if (tx().unit_status) {
                <app-status-chip type="unit_status" [value]="tx().unit_status" />
              }
            </div>
            <div class="hidden sm:block w-px h-6 mx-1" style="background: var(--color-gray-300)"></div>
            <div class="flex items-center gap-2 flex-wrap">
              <button mat-stroked-button (click)="goBack()" class="btn-back">
                <app-icon name="arrow-left" class="w-4 h-4 sm:mr-1" /> <span class="hidden sm:inline">กลับ</span>
              </button>
              @if (tx().status === 'active' && tx().unit_status === 'sold') {
                <button mat-flat-button color="primary" (click)="openTransferDialog()">โอนกรรมสิทธิ์</button>
              }
              @if (tx().status === 'active' && tx().unit_status !== 'transferred') {
                <button mat-stroked-button color="warn" (click)="openCancelDialog()">ยกเลิกขาย</button>
              }
              @if (canEdit() && tx().status !== 'legacy') {
                <button mat-flat-button color="primary" (click)="goToEdit()">
                  <app-icon name="pencil" class="w-4 h-4 mr-1" /> แก้ไข
                </button>
              }
            </div>
          </div>
        </app-page-header>

        <!-- ═══ 2-Column Layout ═══ -->
        <div class="main-grid">

          <!-- ──── Left Column: เนื้อหาหลัก ──── -->
          <div class="left-col">

            <!-- ข้อมูลยูนิต — 3 zones: identity / pricing / loan extras -->
            <app-section-card title="ข้อมูลยูนิต" icon="building-office" class="mb-8">

              <!-- Zone 1: identity (inline compact) -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm pb-3"
                style="border-bottom: 1px solid var(--color-border)">
                <span>
                  <span style="color: var(--color-gray-500)">โครงการ</span>
                  <span class="ml-1 font-medium" style="color: var(--color-text-primary)">{{ tx().project_name }}</span>
                </span>
                <span style="color: var(--color-gray-300)">·</span>
                <span>
                  <span style="color: var(--color-gray-500)">ยูนิต</span>
                  <span class="ml-1 font-mono font-medium" style="color: var(--color-text-primary)">{{ tx().unit_code }}</span>
                </span>
                <span style="color: var(--color-gray-300)">·</span>
                <span>
                  <span style="color: var(--color-gray-500)">วันที่ขาย</span>
                  <span class="ml-1 font-medium" style="color: var(--color-text-primary)">{{ tx().sale_date | thaiDate:'auto' }}</span>
                </span>
                @if (anyTx().house_model_name) {
                  <span style="color: var(--color-gray-300)">·</span>
                  <span>
                    <span style="color: var(--color-gray-500)">แบบบ้าน</span>
                    <span class="ml-1 font-medium" style="color: var(--color-text-primary)">{{ anyTx().house_model_name }}</span>
                  </span>
                }
                @if (anyTx().area_sqm) {
                  <span style="color: var(--color-gray-300)">·</span>
                  <span>
                    <span style="color: var(--color-gray-500)">พื้นที่</span>
                    <span class="ml-1 font-medium tabular-nums" style="color: var(--color-text-primary)">{{ n(anyTx().area_sqm) | number:'1.2-2' }} ตร.ม.</span>
                  </span>
                }
                @if (anyTx().land_area_sqw && anyTx().project_type !== 'condo') {
                  <span style="color: var(--color-gray-300)">·</span>
                  <span>
                    <span style="color: var(--color-gray-500)">ที่ดิน</span>
                    <span class="ml-1 font-medium tabular-nums" style="color: var(--color-text-primary)">{{ n(anyTx().land_area_sqw) | number:'1.2-2' }} ตร.ว.</span>
                  </span>
                }
                @if (tx().unit_status) {
                  <span style="color: var(--color-gray-300)">·</span>
                  <span class="inline-flex items-center gap-1">
                    <span style="color: var(--color-gray-500)">สถานะ</span>
                    <app-status-chip type="unit_status" [value]="tx().unit_status" />
                  </span>
                }
              </div>

              <!-- Zone 2: pricing (เด่น) -->
              <div class="grid grid-cols-2 gap-4 py-4">
                <div>
                  <p class="text-xs mb-1" style="color: var(--color-gray-500)">ราคาขาย</p>
                  <p class="text-xl font-bold tabular-nums" style="color: var(--color-text-primary)">
                    ฿{{ n(tx().base_price) | number:'1.0-0' }}
                  </p>
                </div>
                <div>
                  <p class="text-xs mb-1" style="color: var(--color-gray-500)">ราคาหน้าสัญญา</p>
                  <p class="text-xl font-bold tabular-nums" style="color: var(--color-text-primary)">
                    @if (tx().contract_price != null) {
                      ฿{{ n(tx().contract_price) | number:'1.0-0' }}
                    } @else {
                      <span style="color: var(--color-gray-400); font-weight: normal">—</span>
                    }
                  </p>
                </div>
              </div>

              <!-- Zone 3: loan extras — โผล่เมื่อมี -->
              @if (n(tx().loan_markup_amount) > 0 || n(tx().additional_expense_amount) > 0) {
                <div class="pt-3" style="border-top: 1px solid var(--color-border)">
                  <p class="text-xs font-semibold mb-2" style="color: var(--color-gray-600)">
                    ข้อมูลส่วนเสริม (สำหรับยื่นกู้)
                  </p>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    @if (n(tx().loan_markup_amount) > 0) {
                      <div class="detail-field">
                        <span class="detail-label">ขอบวกเพิ่ม</span>
                        <span class="detail-value tabular-nums">฿{{ n(tx().loan_markup_amount) | number:'1.0-0' }}</span>
                      </div>
                    }
                    @if (n(tx().additional_expense_amount) > 0) {
                      <div class="detail-field">
                        <span class="detail-label">
                          ค่าธรรมเนียมโอนบวกเพิ่ม
                          <span class="text-[10px] font-normal ml-1" style="color: var(--color-gray-500)">
                            ({{ additionalExpenseModeLabel() }})
                          </span>
                        </span>
                        <span class="detail-value tabular-nums">฿{{ n(tx().additional_expense_amount) | number:'1.0-0' }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            </app-section-card>

            <!-- โปรโมชั่น: งบยูนิต -->
            @if (unitItems().length > 0) {
              <app-section-card title="Premium (งบยูนิต)" icon="gift" [noPadding]="true" class="mb-8">
                <span card-actions class="badge badge--info">{{ unitItems().length }} รายการ</span>

                <!-- Mobile: card list -->
                <div class="md:hidden p-3 space-y-2">
                  @for (item of unitItems(); track item.id; let i = $index) {
                    <div class="m-card">
                      <div class="m-card__head">
                        <div class="m-card__name">{{ item.promotion_item_name || 'รายการ #' + item.promotion_item_id }}</div>
                        <div class="tabular-nums font-semibold text-sm whitespace-nowrap">฿{{ n(item.used_value) | number:'1.0-0' }}</div>
                      </div>
                      <div class="m-card__chips">
                        <app-status-chip type="promotion_category" [value]="item.promotion_category" />
                        @if (convertState(item) === 'full') {
                          <span class="badge badge--success">แปลงส่วนลดทั้งหมด</span>
                        } @else if (convertState(item) === 'partial') {
                          <span class="badge badge--info">แปลงส่วนลดบางส่วน ฿{{ n(item.discount_convert_value) | number:'1.0-0' }}</span>
                        }
                      </div>
                      @if (convertState(item) === 'partial') {
                        <div class="text-xs mt-1 flex gap-3" style="color: var(--color-text-secondary)">
                          <span>↳ ของแถมจริง: <span class="tabular-nums font-medium">฿{{ (n(item.used_value) - n(item.discount_convert_value)) | number:'1.0-0' }}</span></span>
                          <span>↳ ส่วนลด: <span class="tabular-nums font-medium">฿{{ n(item.discount_convert_value) | number:'1.0-0' }}</span></span>
                        </div>
                      }
                      @if (item.remark) {
                        <div class="m-card__remark">{{ item.remark }}</div>
                      }
                    </div>
                  }
                  <div class="m-card__foot">
                    <span class="text-sm font-semibold">รวมงบยูนิต</span>
                    <span class="tabular-nums font-bold" style="color: var(--color-primary-700); font-size: 15px">฿{{ unitTotal() | number:'1.0-0' }}</span>
                  </div>
                </div>

                <!-- Desktop: table -->
                <div class="hidden md:block overflow-x-auto">
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
                          <td class="tbl-td text-right tabular-nums font-semibold" style="color: var(--color-text-primary)">
                            ฿{{ n(item.used_value) | number:'1.0-0' }}
                            @if (convertState(item) === 'partial') {
                              <div class="text-xs font-normal mt-0.5" style="color: var(--color-text-secondary)">
                                ของแถม ฿{{ (n(item.used_value) - n(item.discount_convert_value)) | number:'1.0-0' }} · ลด ฿{{ n(item.discount_convert_value) | number:'1.0-0' }}
                              </div>
                            }
                          </td>
                          <td class="tbl-td text-center">
                            @if (convertState(item) === 'full') {
                              <span class="badge badge--success">ทั้งหมด</span>
                            } @else if (convertState(item) === 'partial') {
                              <span class="text-xs tabular-nums" style="color: var(--color-primary)">฿{{ n(item.discount_convert_value) | number:'1.0-0' }}</span>
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

            <!-- ของแถมเพิ่มเติม (งบผู้บริหาร) -->
            @if (otherItems().length > 0 || transferFeeAsPremium() > 0) {
              <app-section-card title="ของแถมเพิ่มเติม (งบผู้บริหาร)" icon="gift" [noPadding]="true" class="mb-8">
                <span card-actions class="badge badge--warn">{{ otherItems().length }} รายการ</span>

                <!-- Info card: ค่าธรรมเนียมโอน mode=as_premium -->
                @if (transferFeeAsPremium() > 0) {
                  <div class="m-3 p-3 rounded-lg flex items-start gap-3"
                    style="background-color: var(--color-primary-100); border: 1px solid var(--color-primary-300)">
                    <app-icon name="banknotes" class="w-5 h-5 mt-0.5 flex-shrink-0" style="color: var(--color-primary-700)" />
                    <div class="flex-1 min-w-0">
                      <div class="flex items-baseline justify-between gap-2">
                        <span class="text-sm font-semibold" style="color: var(--color-text-primary)">
                          ค่าธรรมเนียมโอนบวกเพิ่ม
                        </span>
                        <span class="text-base font-semibold tabular-nums" style="color: var(--color-text-primary)">
                          ฿{{ transferFeeAsPremium() | number:'1.0-0' }}
                        </span>
                      </div>
                      <p class="text-xs mt-1 m-0" style="color: var(--color-gray-600)">
                        หักจากงบผู้บริหาร (ตั้งค่าใน "ส่วนข้อมูลยูนิต" → วิธีคิดค่าธรรมเนียมโอน)
                      </p>
                    </div>
                  </div>
                }

                <!-- Mobile: card list -->
                <div class="md:hidden p-3 space-y-2">
                  @for (item of otherItems(); track item.id; let i = $index) {
                    <div class="m-card">
                      <div class="m-card__head">
                        <div class="m-card__name">{{ item.promotion_item_name || 'รายการ #' + item.promotion_item_id }}</div>
                        <div class="tabular-nums font-semibold text-sm whitespace-nowrap">฿{{ n(item.used_value) | number:'1.0-0' }}</div>
                      </div>
                      <div class="m-card__chips">
                        <app-status-chip type="promotion_category" [value]="item.promotion_category" />
                      </div>
                      @if (item.remark) {
                        <div class="m-card__remark">{{ item.remark }}</div>
                      }
                    </div>
                  }
                  <div class="m-card__foot">
                    <span class="text-sm font-semibold">รวมงบอื่นๆ</span>
                    <span class="tabular-nums font-bold" style="color: var(--color-primary-700); font-size: 15px">฿{{ otherTotal() | number:'1.0-0' }}</span>
                  </div>
                </div>

                <!-- Desktop: table -->
                <div class="hidden md:block overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr>
                        <th class="tbl-th text-left w-12 pl-6">#</th>
                        <th class="tbl-th text-left">รายการ</th>
                        <th class="tbl-th text-right">มูลค่าที่ใช้</th>
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
                          <td class="tbl-td text-right tabular-nums font-semibold" style="color: var(--color-text-primary)">฿{{ n(item.used_value) | number:'1.0-0' }}</td>
                          <td class="tbl-td text-xs pr-6" style="color: var(--color-text-secondary)">{{ item.remark || '—' }}</td>
                        </tr>
                      }
                    </tbody>
                    <tfoot>
                      <tr class="tbl-foot">
                        <td colspan="2" class="tbl-td pl-6 text-right font-semibold">รวมงบอื่นๆ</td>
                        <td class="tbl-td text-right tabular-nums font-bold" style="color: var(--color-primary-700); font-size: 15px">฿{{ otherTotal() | number:'1.0-0' }}</td>
                        <td class="tbl-td pr-6"></td>
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
                    <span class="tabular-nums text-lg sm:text-xl font-bold">{{ n(tx().net_price) | number:'1.0-0' }}</span>
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

              <!-- สรุปการใช้งบประมาณ — per-source พร้อม progress bar -->
              <div class="section-card summary-box mt-4">
                <h3 class="font-semibold mb-1" style="font-size: var(--font-size-card-title); color: var(--color-text-primary)">สรุปการใช้งบประมาณ</h3>
                <p class="text-xs mb-3" style="color: var(--color-gray-500)">งบแต่ละแหล่งของยูนิตนี้ — ใช้ไปเท่าไหร่ และเหลือเท่าไหร่</p>

                <!-- งบยูนิต -->
                <div class="bg-src">
                  <div class="bg-src__top">
                    <span class="bg-src__name">
                      <span class="bg-dot" style="background: var(--color-primary)"></span>
                      งบยูนิต
                    </span>
                    <span class="bg-src__remain">
                      <span class="bg-src__remain-label">คงเหลือ</span>
                      <span class="tabular-nums font-bold"
                        [class.text-loss]="n(bs().unit_budget_remaining) < 0"
                        [class.text-profit]="n(bs().unit_budget_remaining) >= 0">
                        {{ n(bs().unit_budget_remaining) | number:'1.0-0' }}
                      </span>
                    </span>
                  </div>
                  <div class="bg-bar">
                    <div class="bg-bar__fill"
                      [class.bg-bar__fill--over]="n(bs().unit_budget_remaining) < 0"
                      [style.width.%]="budgetPct(bs().unit_budget_used, bs().unit_budget)"
                      style="--bar-color: var(--color-primary)"></div>
                  </div>
                  <div class="bg-src__foot">
                    <span>ใช้ไป <span class="tabular-nums text-discount font-medium">{{ n(bs().unit_budget_used) | number:'1.0-0' }}</span></span>
                    <span>งบทั้งหมด <span class="tabular-nums">{{ n(bs().unit_budget) | number:'1.0-0' }}</span></span>
                  </div>
                </div>

                <!-- งบผู้บริหาร -->
                <div class="bg-src">
                  <div class="bg-src__top">
                    <span class="bg-src__name">
                      <span class="bg-dot" style="background: var(--color-warning)"></span>
                      งบผู้บริหาร
                    </span>
                    <span class="bg-src__remain">
                      <span class="bg-src__remain-label">คงเหลือ</span>
                      <span class="tabular-nums font-bold"
                        [class.text-loss]="n(bs().mgmt_budget_remaining) < 0"
                        [class.text-profit]="n(bs().mgmt_budget_remaining) >= 0">
                        {{ n(bs().mgmt_budget_remaining) | number:'1.0-0' }}
                      </span>
                    </span>
                  </div>
                  <div class="bg-bar">
                    <div class="bg-bar__fill"
                      [class.bg-bar__fill--over]="n(bs().mgmt_budget_remaining) < 0"
                      [style.width.%]="budgetPct(bs().mgmt_budget_used, bs().mgmt_budget)"
                      style="--bar-color: var(--color-warning)"></div>
                  </div>
                  <div class="bg-src__foot">
                    <span>ใช้ไป <span class="tabular-nums text-discount font-medium">{{ n(bs().mgmt_budget_used) | number:'1.0-0' }}</span></span>
                    <span>งบทั้งหมด <span class="tabular-nums">{{ n(bs().mgmt_budget) | number:'1.0-0' }}</span></span>
                  </div>
                </div>

                <div class="s-sep"></div>

                <!-- Footer summary -->
                <div class="space-y-1 text-sm">
                  <div class="s-row font-semibold" style="color: var(--color-text-primary)">
                    <span>รวมที่ใช้รายการนี้</span>
                    <span class="tabular-nums">{{ allItemsTotal() | number:'1.0-0' }}</span>
                  </div>
                  <div class="s-row text-xs" style="color: var(--color-gray-500)">
                    <span>งบนอกสุทธิที่ใช้ (Y)
                      <span [matTooltip]="netExtraTooltip()" matTooltipClass="tooltip-multiline" class="cursor-help">ⓘ</span>
                    </span>
                    <span class="tabular-nums font-medium"
                      [class.text-discount]="netExtraBudgetUsed() > 0"
                      [class.text-profit]="netExtraBudgetUsed() <= 0">
                      {{ netExtraBudgetUsed() | number:'1.0-0' }}
                    </span>
                  </div>
                </div>

                <!-- งบคงเหลือรวม (X) — highlight -->
                <div class="s-row s-row--highlight mt-2">
                  <span class="font-bold">งบคงเหลือรวม (X)
                    <span [matTooltip]="totalRemainingTooltip()" matTooltipClass="tooltip-multiline" class="cursor-help font-normal">ⓘ</span>
                  </span>
                  <span class="tabular-nums text-base font-bold"
                    [class.text-loss]="n(bs().total_remaining) < 0">
                    {{ n(bs().total_remaining) | number:'1.0-0' }}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- ═══ Mobile Sticky Bottom Bar (< lg) ═══ -->
        <div class="m-bottom-bar lg:hidden">
          <div class="m-bottom-bar__inner">
            <div class="m-bottom-bar__col">
              <span class="m-bottom-bar__label">ราคาสุทธิ</span>
              <span class="m-bottom-bar__value tabular-nums" style="color: var(--color-primary)">
                ฿{{ n(tx().net_price) | number:'1.0-0' }}
              </span>
            </div>
            <div class="m-bottom-bar__col m-bottom-bar__col--end">
              <span class="m-bottom-bar__label">กำไร</span>
              <span class="m-bottom-bar__value tabular-nums"
                [class.text-profit]="n(tx().profit) >= 0"
                [class.text-loss]="n(tx().profit) < 0">
                {{ n(tx().profit) | number:'1.0-0' }}
              </span>
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

    /* ── Budget source row (สรุปการใช้งบประมาณ — redesign พร้อม progress bar) ── */
    .bg-src {
      padding: 10px 0;
    }
    .bg-src + .bg-src {
      border-top: 1px solid var(--color-gray-200);
    }
    .bg-src__top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 7px;
    }
    .bg-src__name {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 13px;
      color: var(--color-text-primary);
    }
    .bg-src__remain {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      font-size: 14px;
    }
    .bg-src__remain-label {
      font-size: 11px;
      color: var(--color-gray-500);
    }
    .bg-bar {
      height: 6px;
      border-radius: 999px;
      background: var(--color-gray-200);
      overflow: hidden;
    }
    .bg-bar__fill {
      height: 100%;
      border-radius: 999px;
      background: var(--bar-color, var(--color-primary));
      transition: width 0.35s ease;
    }
    .bg-bar__fill--over {
      background: var(--color-loss) !important;
    }
    .bg-src__foot {
      display: flex;
      justify-content: space-between;
      margin-top: 5px;
      font-size: 11px;
      color: var(--color-gray-500);
    }

    /* ── Header Actions (mobile-friendly) ── */
    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn-back {
      min-width: 0;
    }
    /* Stack title และ actions เป็นแนวตั้งบนมือถือ ลดความเบียด */
    @media (max-width: 640px) {
      :host ::ng-deep app-page-header > div {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
      }
      :host ::ng-deep app-page-header > div > div:last-child {
        justify-content: flex-start;
      }
    }

    /* ── Mobile item card (แทน table บนมือถือ) ── */
    .m-card {
      padding: 12px;
      border: 1px solid var(--color-gray-200);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
    }
    .m-card__head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }
    .m-card__name {
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text-primary);
      line-height: 1.35;
      flex: 1;
      min-width: 0;
    }
    .m-card__chips {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .m-card__remark {
      font-size: 12px;
      color: var(--color-text-secondary);
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px dashed var(--color-gray-200);
    }
    .m-card__foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      margin-top: 4px;
      background: var(--color-gray-50);
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-gray-200);
    }

    /* ── badge variant: success (ใช้ในการ์ดมือถือ) ── */
    .badge--success {
      background: var(--color-success-subtle, rgba(16,185,129,0.12));
      color: var(--color-success);
    }

    /* ── Mobile sticky bottom bar (KPI หลัก) ── */
    .m-bottom-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #fff;
      border-top: 1px solid var(--color-gray-200);
      box-shadow: 0 -2px 12px rgba(15, 23, 42, 0.06);
      z-index: 40;
      padding: 10px 14px;
      padding-bottom: calc(10px + env(safe-area-inset-bottom, 0));
    }
    .m-bottom-bar__inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      max-width: 1440px;
      margin: 0 auto;
    }
    .m-bottom-bar__col {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .m-bottom-bar__col--end {
      align-items: flex-end;
    }
    .m-bottom-bar__label {
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .m-bottom-bar__value {
      font-size: 17px;
      font-weight: 700;
      line-height: 1.2;
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
  readonly bs = computed(() => (this.data() as any)?.budget_summary ?? {} as any);

  readonly unitItems = computed(() =>
    this.items().filter((it: any) => it.funding_source_type === 'UNIT_STANDARD')
  );
  readonly otherItems = computed(() =>
    this.items().filter((it: any) => it.funding_source_type !== 'UNIT_STANDARD')
  );
  /** ค่าธรรมเนียมโอน mode=as_premium — กิน MGMT_SPECIAL จริง ต้องนับใน "งบอื่น/งบนอก" ทุกที่
   *  mode=as_unit_expense ไม่นับเพราะ amount ถูกผูกเป็น Panel A item แล้ว (อยู่ใน items) */
  readonly transferFeeAsPremium = computed(() => {
    const tx = this.tx() as any;
    return tx?.additional_expense_mode === 'as_premium'
      ? Number(tx?.additional_expense_amount ?? 0)
      : 0;
  });

  /** label สำหรับ mode ของ additional_expense ใน Zone 3 */
  readonly additionalExpenseModeLabel = computed(() => {
    const mode = (this.tx() as any)?.additional_expense_mode;
    switch (mode) {
      case 'as_premium': return 'ใช้งบผู้บริหาร';
      case 'as_unit_expense': return 'ใช้งบยูนิต';
      default: return 'ลูกค้าจ่ายเอง';
    }
  });

  readonly unitTotal = computed(() =>
    this.unitItems().reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
  );
  readonly otherTotal = computed(() =>
    this.otherItems().reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
    + this.transferFeeAsPremium()
  );
  readonly poolTotal = computed(() =>
    this.items().filter((it: any) => it.funding_source_type === 'PROJECT_POOL')
      .reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
  );
  readonly mgmtTotal = computed(() =>
    this.items().filter((it: any) => it.funding_source_type === 'MANAGEMENT_SPECIAL')
      .reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
    + this.transferFeeAsPremium()
  );
  readonly allItemsTotal = computed(() =>
    this.items().reduce((sum: number, it: any) => sum + Number(it.used_value ?? 0), 0)
    + this.transferFeeAsPremium()
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

  /** % การใช้งบ (used/total) สำหรับ progress bar — clamp 0..100; total=0 ถือว่าเต็มถ้ามีการใช้ */
  budgetPct(used: any, total: any): number {
    const u = this.n(used), t = this.n(total);
    if (t <= 0) return u > 0 ? 100 : 0;
    return Math.min(100, Math.max(0, (u / t) * 100));
  }

  /** สถานะการแปลงส่วนลดของรายการ premium: 'none' | 'partial' | 'full' */
  convertState(item: any): 'none' | 'partial' | 'full' {
    const d = this.n(item.discount_convert_value);
    const u = this.n(item.used_value);
    if (d <= 0 || u <= 0) return 'none';
    return d >= u ? 'full' : 'partial';
  }

  /** typed-loose accessor — รองรับ field ที่ backend join เข้ามา (house_model_name, area_sqm ฯลฯ) */
  readonly anyTx = computed(() => this.tx() as any);

  readonly netAfterPromo = computed(() =>
    this.n(this.tx().net_price) - this.n(this.tx().total_promo_burden)
  );

  readonly netExtraBudgetUsed = computed(() =>
    this.otherTotal() - this.n((this.data() as any)?.budget_summary?.unit_budget_remaining ?? 0)
  );

  /** tooltip อธิบายสูตร "งบนอกสุทธิที่ใช้ (Y)" พร้อมตัวเลขจริงของรายการนี้ */
  readonly netExtraTooltip = computed(() => {
    const fmt = (v: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(v);
    const other      = this.otherTotal();
    const fee        = this.transferFeeAsPremium();
    const unitRemain = this.n((this.data() as any)?.budget_summary?.unit_budget_remaining ?? 0);
    const y          = this.netExtraBudgetUsed();
    // หมายเหตุค่าธรรมเนียมโอนแบบใช้งบผู้บริหาร (รวมอยู่ใน "งบอื่นที่ใช้" แล้ว)
    const feeNote = fee > 0 ? ` (รวมค่าธรรมเนียมโอนใช้งบผู้บริหาร ${fmt(fee)})` : '';
    return (
      'งบนอกสุทธิที่ใช้ (Y) = งบอื่นที่ใช้ในรายการนี้ − งบยูนิตคงเหลือ\n\n' +
      `• งบอื่นที่ใช้ (งบผู้บริหาร ที่ไม่ใช่งบยูนิต): ${fmt(other)}${feeNote}\n` +
      `• งบยูนิตคงเหลือ: ${fmt(unitRemain)}\n` +
      `→ Y = ${fmt(other)} − ${fmt(unitRemain)} = ${fmt(y)}\n\n` +
      'ค่าบวก = ใช้งบเกินงบยูนิต (ต้องดึงจากงบนอก) · ค่า ≤ 0 = งบยูนิตยังพอ ไม่ได้ใช้งบนอก'
    );
  });

  /** tooltip อธิบายสูตร "งบคงเหลือรวม (X)" พร้อมตัวเลขจริงของยูนิตนี้ */
  readonly totalRemainingTooltip = computed(() => {
    const fmt = (v: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(v);
    const b     = this.bs();
    const unit  = this.n(b?.unit_budget_remaining);
    const mgmt  = this.n(b?.mgmt_budget_remaining);
    const pool  = this.n(b?.pool_budget_remaining);
    const total = this.n(b?.total_remaining);
    // แสดงงบส่วนกลาง (Pool) เฉพาะเมื่อมีค่า — sales-entry ใหม่ไม่ใช้ Pool แล้ว (มีได้ในข้อมูลเก่า)
    const poolLine = pool !== 0 ? `• งบส่วนกลางคงเหลือ: ${fmt(pool)}\n` : '';
    const parts = pool !== 0
      ? `${fmt(unit)} + ${fmt(mgmt)} + ${fmt(pool)}`
      : `${fmt(unit)} + ${fmt(mgmt)}`;
    return (
      'งบคงเหลือรวม (X) = งบคงเหลือทุกแหล่งของยูนิตนี้\n\n' +
      `• งบยูนิตคงเหลือ: ${fmt(unit)}\n` +
      `• งบผู้บริหารคงเหลือ: ${fmt(mgmt)}\n` +
      poolLine +
      `→ X = ${parts} = ${fmt(total)}\n\n` +
      'ค่าบวก = ยังมีงบเหลือใช้ · ค่าติดลบ = ใช้งบเกินงบที่มี'
    );
  });

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
