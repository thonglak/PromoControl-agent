import { Injectable } from '@angular/core';

export interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
  locked?: boolean;
}

const COL_PREFIX = 'tbl_cfg_';
const FILTER_PREFIX = 'tbl_flt_';

@Injectable({ providedIn: 'root' })
export class TableConfigService {

  // ── Column config ──────────────────────────────────────────────

  getConfig(tableId: string, defaults: ColumnDef[]): ColumnDef[] {
    const raw = localStorage.getItem(COL_PREFIX + tableId);
    if (!raw) return [...defaults];
    try {
      const saved: { key: string; visible: boolean }[] = JSON.parse(raw);
      const savedMap = new Map(saved.map((c, i) => [c.key, { visible: c.visible, order: i }]));
      const merged: (ColumnDef & { _o: number })[] = [];
      let maxOrder = saved.length;
      for (const def of defaults) {
        const s = savedMap.get(def.key);
        if (s) {
          merged.push({ ...def, visible: def.locked ? true : s.visible, _o: s.order });
        } else {
          merged.push({ ...def, _o: maxOrder++ });
        }
      }
      merged.sort((a, b) => a._o - b._o);
      return merged.map(({ _o, ...rest }) => rest);
    } catch {
      return [...defaults];
    }
  }

  saveConfig(tableId: string, columns: ColumnDef[]): void {
    const data = columns.map(c => ({ key: c.key, visible: c.visible }));
    localStorage.setItem(COL_PREFIX + tableId, JSON.stringify(data));
  }

  getVisibleKeys(columns: ColumnDef[]): string[] {
    return columns.filter(c => c.visible).map(c => c.key);
  }

  resetConfig(tableId: string): void {
    localStorage.removeItem(COL_PREFIX + tableId);
  }

  // ── Filter persistence ─────────────────────────────────────────

  saveFilters(tableId: string, filters: Record<string, any>): void {
    localStorage.setItem(FILTER_PREFIX + tableId, JSON.stringify(filters));
  }

  loadFilters<T extends Record<string, any>>(tableId: string): T | null {
    const raw = localStorage.getItem(FILTER_PREFIX + tableId);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; }
    catch { return null; }
  }

  resetFilters(tableId: string): void {
    localStorage.removeItem(FILTER_PREFIX + tableId);
  }
}
