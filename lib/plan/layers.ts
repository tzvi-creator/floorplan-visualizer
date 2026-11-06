export interface Layers { floors: boolean; walls: boolean; openings: boolean; names: boolean; dims: boolean; dimlines: boolean; areas: boolean; furniture: boolean; balconies: boolean; summary: boolean }
export const DEFAULT_LAYERS: Layers = { floors: true, walls: true, openings: true, names: true, dims: true, dimlines: false, areas: true, furniture: false, balconies: true, summary: true };
export const LAYER_LABELS: { key: keyof Layers; he: string }[] = [
  { key: 'floors', he: 'רצפות וצבעים' },
  { key: 'walls', he: 'קירות' },
  { key: 'openings', he: 'דלתות וחלונות' },
  { key: 'names', he: 'שמות חדרים' },
  { key: 'dims', he: 'מידות חדר (אורך × רוחב)' },
  { key: 'dimlines', he: 'קווי מידה' },
  { key: 'areas', he: 'שטח כל חדר' },
  { key: 'balconies', he: 'מרפסות' },
  { key: 'furniture', he: 'ריהוט' },
  { key: 'summary', he: 'סיכום שטחי דירה' },
];
export interface PlanSettings { title?: string; subtitle?: string; description?: string; wallHeight?: number; showTable?: boolean; orientation?: 'landscape' | 'portrait'; footer?: string }
