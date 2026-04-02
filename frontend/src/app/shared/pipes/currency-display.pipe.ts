import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currencyDisplay', standalone: true })
export class CurrencyDisplayPipe implements PipeTransform {
  transform(value: number | null | undefined, showSymbol = true, decimals = 0): string {
    if (value == null) return '-';
    const formatted = Math.abs(value).toLocaleString('th-TH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const prefix = showSymbol ? '฿' : '';
    return value < 0 ? `${prefix}-${formatted}` : `${prefix}${formatted}`;
  }
}
