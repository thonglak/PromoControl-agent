import { Component, input, forwardRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-currency-field',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyFieldComponent),
      multi: true,
    },
  ],
  template: `
    <mat-form-field class="w-full">
      <mat-label>{{ label() }}</mat-label>
      <span matTextPrefix class="mr-1 text-gray-500">฿&nbsp;</span>
      <input matInput type="text" class="text-right font-semibold"
             [class.text-loss]="isNegative()"
             [value]="displayValue()"
             [placeholder]="placeholder()"
             [readonly]="readonly()"
             (focus)="onFocus()"
             (blur)="onBlur($event)"
             (input)="onInput($event)" />
    </mat-form-field>
  `,
})
export class CurrencyFieldComponent implements ControlValueAccessor {
  label = input.required<string>();
  placeholder = input<string>('0');
  readonly = input<boolean>(false);

  displayValue = signal('');
  isNegative = signal(false);

  private rawValue: number | null = null;
  private focused = false;
  private onChange: (v: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: unknown): void {
    const num = value == null || value === '' ? null : Number(value);
    this.rawValue = num != null && !isNaN(num) ? num : null;
    this.isNegative.set(this.rawValue != null && this.rawValue < 0);
    if (!this.focused) {
      this.displayValue.set(this.format(this.rawValue));
    }
  }

  registerOnChange(fn: (v: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  onFocus(): void {
    this.focused = true;
    this.displayValue.set(this.rawValue != null ? String(this.rawValue) : '');
  }

  onBlur(e: Event): void {
    this.focused = false;
    const input = e.target as HTMLInputElement;
    const parsed = this.parse(input.value);
    this.rawValue = parsed;
    this.isNegative.set(parsed != null && parsed < 0);
    this.displayValue.set(this.format(parsed));
    this.onChange(parsed);
    this.onTouched();
  }

  onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const parsed = this.parse(input.value);
    this.rawValue = parsed;
    this.isNegative.set(parsed != null && parsed < 0);
    this.onChange(parsed);
  }

  private format(value: number | null): string {
    if (value == null) return '';
    return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private parse(str: string): number | null {
    if (!str || str.trim() === '') return null;
    const cleaned = str.replace(/,/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
  }
}
