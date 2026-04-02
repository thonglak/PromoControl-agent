import { Directive, ElementRef, HostListener, inject, Input, OnInit, OnDestroy } from '@angular/core';
import { NgControl } from '@angular/forms';
import { Subscription } from 'rxjs';

/**
 * appNumberFormat — format ตัวเลขด้วย comma (1,234,567) ขณะกรอก
 *
 * - FormControl เก็บค่าเป็น number เสมอ
 * - รองรับทั้ง [formControl], formControlName, [ngModel]
 * - เปลี่ยน type="number" → type="text" อัตโนมัติ (เพราะ comma ใส่ใน number ไม่ได้)
 *
 * Usage:
 *   <input matInput appNumberFormat formControlName="amount">
 *   <input matInput appNumberFormat [ngModel]="val" (ngModelChange)="onChange($event)">
 */
@Directive({
  selector: '[appNumberFormat]',
  standalone: true,
})
export class NumberFormatDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef<HTMLInputElement>);
  private control = inject(NgControl, { optional: true });

  /** จำนวนทศนิยม (default: 0 = จำนวนเต็ม) */
  @Input() decimals = 0;

  private sub?: Subscription;
  private updating = false;

  ngOnInit(): void {
    const input = this.el.nativeElement;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';

    // format ค่าเริ่มต้น
    if (this.control?.control) {
      const v = this.control.control.value;
      if (v != null && v !== '' && v !== 0) {
        this.setDisplay(this.fmt(Number(v)));
      }

      // format เมื่อ setValue จากภายนอก (เช่น checkbox "คืนทั้งจำนวน", patchValue)
      this.sub = this.control.control.valueChanges.subscribe(val => {
        if (this.updating) return;
        if (val == null || val === '') return;
        const num = typeof val === 'string' ? this.parse(val) : Number(val);
        const formatted = this.fmt(num);
        if (this.parse(input.value) !== num) {
          this.setDisplay(formatted);
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const raw = input.value;

    // ช่องว่างหรือ - → ปล่อยผ่าน
    if (raw === '' || raw === '-') {
      this.writeValue(raw === '' ? null : 0);
      return;
    }

    // กำลังพิมพ์ทศนิยม เช่น "123." → ยังไม่ format
    if (this.decimals > 0 && raw.endsWith('.')) {
      this.writeValue(this.parse(raw));
      return;
    }

    // จำตำแหน่ง cursor
    const pos = input.selectionStart ?? 0;
    const commasBefore = (raw.substring(0, pos).match(/,/g) || []).length;

    const num = this.parse(raw);
    const formatted = this.fmt(num);
    this.setDisplay(formatted);

    // คำนวณ cursor ใหม่
    const commasAfter = (formatted.substring(0, pos + 3).match(/,/g) || []).length;
    const newPos = Math.max(0, Math.min(formatted.length, pos + (commasAfter - commasBefore)));
    requestAnimationFrame(() => input.setSelectionRange(newPos, newPos));

    this.writeValue(num);
  }

  @HostListener('focus')
  onFocus(): void {
    // select all เมื่อ focus เพื่อให้พิมพ์ทับง่าย
    const input = this.el.nativeElement;
    if (input.value) {
      setTimeout(() => input.select(), 0);
    }
  }

  @HostListener('blur')
  onBlur(): void {
    const raw = this.el.nativeElement.value;
    if (raw === '' || raw === '-') return;
    const num = this.parse(raw);
    this.setDisplay(this.fmt(num));
    this.writeValue(num);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    // อนุญาต: navigation, control keys
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
         'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
         'Home', 'End'].includes(e.key)) return;
    if ((e.ctrlKey || e.metaKey) && 'acvxz'.includes(e.key.toLowerCase())) return;

    // อนุญาต: ตัวเลข
    if (/^\d$/.test(e.key)) return;

    // อนุญาต: จุดทศนิยม (ถ้า decimals > 0 และยังไม่มีจุด)
    if (this.decimals > 0 && e.key === '.' && !this.el.nativeElement.value.includes('.')) return;

    // อนุญาต: เครื่องหมายลบ (ตำแหน่งแรกเท่านั้น)
    if (e.key === '-' && this.el.nativeElement.selectionStart === 0
        && !this.el.nativeElement.value.includes('-')) return;

    e.preventDefault();
  }

  @HostListener('paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    e.preventDefault();
    const text = e.clipboardData?.getData('text') ?? '';
    const num = this.parse(text);
    if (isNaN(num)) return;
    this.setDisplay(this.fmt(num));
    this.writeValue(num);
  }

  // ── helpers ──

  private parse(s: string): number {
    const n = parseFloat(s.replace(/[,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  private fmt(n: number): string {
    if (isNaN(n)) return '';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: this.decimals,
    });
  }

  private setDisplay(v: string): void {
    this.el.nativeElement.value = v;
  }

  private writeValue(v: number | null): void {
    if (!this.control?.control) return;
    this.updating = true;
    this.control.control.setValue(v, { emitEvent: true });
    this.control.control.markAsDirty();
    this.control.control.markAsTouched();
    this.updating = false;
  }
}
