import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface StatusConfig {
  label: string;
  bgColor: string;
  textColor: string;
}

@Component({
  selector: 'app-status-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center px-3 py-1 text-xs font-medium"
          style="border-radius: var(--radius-full)"
          [style.background-color]="config().bgColor"
          [style.color]="config().textColor"
          [class.line-through]="strikethrough()"
          [class.opacity-60]="dimmed()">
      {{ config().label }}
    </span>
  `
})
export class StatusChipComponent {
  type = input.required<string>();
  value = input.required<string>();
  strikethrough = input<boolean>(false);
  dimmed = input<boolean>(false);

  config = computed((): StatusConfig => {
    const S = 'var(--color-success)';
    const E = 'var(--color-error)';
    const W = 'var(--color-warning)';
    const I = 'var(--color-info)';
    const P7 = 'var(--color-primary-700)';
    const G = 'var(--color-gray-500)';

    const Sb = 'var(--color-success-subtle)';
    const Eb = 'var(--color-error-subtle)';
    const Wb = 'var(--color-warning-subtle)';
    const Ib = 'var(--color-info-subtle)';
    const Pb = 'var(--color-primary-subtle)';
    const Nb = 'var(--color-neutral-subtle)';

    const configs: Record<string, Record<string, StatusConfig>> = {
      unit_status: {
        available:   { label: 'ว่าง',     bgColor: Sb, textColor: S },
        reserved:    { label: 'จอง',      bgColor: Pb, textColor: P7 },
        sold:        { label: 'ขายแล้ว',   bgColor: Ib, textColor: I },
        transferred: { label: 'โอนแล้ว',   bgColor: Nb, textColor: G },
      },
      transaction_status: {
        active:    { label: 'ปกติ',    bgColor: Sb, textColor: S },
        cancelled: { label: 'ยกเลิก',  bgColor: Eb, textColor: E },
      },
      movement_type: {
        ALLOCATE:           { label: 'ALLOCATE',           bgColor: Ib, textColor: I },
        USE:                { label: 'USE',                bgColor: Eb, textColor: E },
        RETURN:             { label: 'RETURN',             bgColor: Sb, textColor: S },
        ADJUST:             { label: 'ADJUST',             bgColor: Wb, textColor: W },
        TRANSFER_IN:        { label: 'TRANSFER_IN',        bgColor: Ib, textColor: I },
        TRANSFER_OUT:       { label: 'TRANSFER_OUT',       bgColor: Wb, textColor: W },
        SPECIAL_BUDGET_USE: { label: 'SPECIAL_BUDGET_USE', bgColor: Eb, textColor: E },
      },
      movement_status: {
        pending:  { label: 'รอ',       bgColor: Wb, textColor: W },
        approved: { label: 'อนุมัติ',   bgColor: Sb, textColor: S },
        rejected: { label: 'ปฏิเสธ',   bgColor: Eb, textColor: E },
        voided:   { label: 'ยกเลิก',   bgColor: Nb, textColor: G },
      },
      budget_source: {
        unit_standard: { label: 'งบมาตรฐาน',  bgColor: Ib, textColor: I },
        pool:          { label: 'งบ Pool',     bgColor: Sb, textColor: S },
        executive:     { label: 'งบผู้บริหาร',  bgColor: Wb, textColor: W },
      },
      promotion_category: {
        discount:        { label: 'ส่วนลด',           bgColor: Wb, textColor: W },
        premium:         { label: 'ของแถม',           bgColor: Ib, textColor: I },
        expense_support: { label: 'สนับสนุนค่าใช้จ่าย', bgColor: Nb, textColor: G },
      },
      user_role: {
        admin:   { label: 'Admin',   bgColor: Eb, textColor: E },
        manager: { label: 'Manager', bgColor: Wb, textColor: W },
        sales:   { label: 'Sales',   bgColor: Ib, textColor: I },
        finance: { label: 'Finance', bgColor: Sb, textColor: S },
        viewer:  { label: 'Viewer',  bgColor: Nb, textColor: G },
      },
      user_status: {
        active:   { label: 'ใช้งาน',    bgColor: Sb, textColor: S },
        inactive: { label: 'ปิดใช้งาน', bgColor: Eb, textColor: E },
      },
      project_status: {
        active:    { label: 'เปิด',     bgColor: Sb, textColor: S },
        inactive:  { label: 'ปิด',      bgColor: Nb, textColor: G },
        completed: { label: 'เสร็จสิ้น', bgColor: Ib, textColor: I },
      },
      project_type: {
        condo:     { label: 'คอนโด',       bgColor: Ib, textColor: I },
        house:     { label: 'บ้าน',        bgColor: Sb, textColor: S },
        townhouse: { label: 'ทาวน์เฮาส์',  bgColor: Wb, textColor: W },
        mixed:     { label: 'ผสม',         bgColor: Nb, textColor: G },
      },
    };
    return configs[this.type()]?.[this.value()] ??
      { label: this.value(), bgColor: Nb, textColor: G };
  });
}
