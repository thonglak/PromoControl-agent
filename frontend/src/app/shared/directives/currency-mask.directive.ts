import {
  Directive, ElementRef, forwardRef, inject, Input,
  OnChanges, OnDestroy, OnInit, Renderer2, SimpleChanges,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Maskito } from '@maskito/core';
import { maskitoNumberOptionsGenerator, maskitoParseNumber } from '@maskito/kit';

export interface CurrencyMaskOptions {
  precision?: number;
  align?: 'left' | 'right';
  allowNegative?: boolean;
  thousands?: string;
  decimal?: string;
  prefix?: string;
  suffix?: string;
}

const DEFAULT_OPTIONS: CurrencyMaskOptions = {
  precision: 0,
  align: 'right',
  allowNegative: false,
  thousands: ',',
  decimal: '.',
  prefix: '',
  suffix: '',
};

@Directive({
  selector: 'input[currencyMask]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyMaskDirective),
      multi: true,
    },
  ],
})
export class CurrencyMaskDirective implements ControlValueAccessor, OnInit, OnChanges, OnDestroy {
  @Input() options: CurrencyMaskOptions = {};

  private el = inject(ElementRef<HTMLInputElement>);
  private renderer = inject(Renderer2);
  private maskedInstance: Maskito | null = null;

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};
  private mergedOptions = DEFAULT_OPTIONS;
  private maskitoParams: any = {};

  ngOnInit(): void {
    this.applyMask();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.applyMask();
    }
  }

  private applyMask(): void {
    this.mergedOptions = { ...DEFAULT_OPTIONS, ...this.options };

    // ตั้ง text-align
    this.renderer.setStyle(
      this.el.nativeElement,
      'text-align',
      this.mergedOptions.align ?? 'right',
    );

    // ทำลาย mask เดิม
    this.maskedInstance?.destroy();

    const precision = this.mergedOptions.precision ?? 0;
    const thousandSep = this.mergedOptions.thousands ?? ',';
    const decimalSep = this.mergedOptions.decimal ?? '.';
    const prefix = this.mergedOptions.prefix ?? '';
    const postfix = this.mergedOptions.suffix ?? '';

    this.maskitoParams = {
      thousandSeparator: thousandSep,
      decimalSeparator: decimalSep,
      prefix,
      postfix,
    };

    const maskOptions = maskitoNumberOptionsGenerator({
      maximumFractionDigits: precision,
      minimumFractionDigits: 0,
      thousandSeparator: thousandSep,
      decimalSeparator: decimalSep,
      min: this.mergedOptions.allowNegative ? -Infinity : 0,
      prefix,
      postfix,
    });

    this.maskedInstance = new Maskito(this.el.nativeElement, maskOptions);

    // ฟัง input event เพื่อแปลงค่า string → number ส่ง form
    this.el.nativeElement.addEventListener('input', this.onInput);
    this.el.nativeElement.addEventListener('blur', this.onBlur);
  }

  private onInput = (): void => {
    const raw = this.el.nativeElement.value;
    const num = this.parseValue(raw);
    this.onChange(num);
  };

  private onBlur = (): void => {
    this.onTouched();
  };

  /** แปลง formatted string → number | null */
  private parseValue(display: string): number | null {
    if (!display || display.trim() === '') return null;
    const parsed = maskitoParseNumber(display, this.maskitoParams);
    return isNaN(parsed) ? null : parsed;
  }

  /** แปลง any value → formatted string สำหรับแสดง */
  private formatValue(value: unknown): string {
    if (value == null || value === '') return '';
    const num = Number(value);
    if (isNaN(num)) return '';

    const precision = this.mergedOptions.precision ?? 0;
    const thousands = this.mergedOptions.thousands ?? ',';
    const decimal = this.mergedOptions.decimal ?? '.';
    const prefix = this.mergedOptions.prefix ?? '';
    const suffix = this.mergedOptions.suffix ?? '';

    const parts = num.toFixed(precision).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
    const formatted = parts.length > 1 && precision > 0
      ? intPart + decimal + parts[1]
      : intPart;

    return prefix + formatted + suffix;
  }

  // ── ControlValueAccessor ──────────────────────────────────────────────

  writeValue(value: unknown): void {
    const display = this.formatValue(value);
    this.renderer.setProperty(this.el.nativeElement, 'value', display);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.renderer.setProperty(this.el.nativeElement, 'disabled', isDisabled);
  }

  ngOnDestroy(): void {
    this.maskedInstance?.destroy();
    this.el.nativeElement.removeEventListener('input', this.onInput);
    this.el.nativeElement.removeEventListener('blur', this.onBlur);
  }
}
