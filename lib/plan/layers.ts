export interface Layers { original: boolean; floors: boolean; walls: boolean; openings: boolean; names: boolean; dims: boolean; dimlines: boolean; areas: boolean; furniture: boolean; balconies: boolean; summary: boolean }
export const DEFAULT_LAYERS: Layers = { original: true, floors: true, walls: true, openings: true, names: true, dims: true, dimlines: false, areas: true, furniture: false, balconies: true, summary: true };
export const LAYER_LABELS: { key: keyof Layers; he: string }[] = [
  { key: 'original', he: 'התכנית המקורית (PDF)' },
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

export const LAYER_PRESETS: { he: string; layers: Layers }[] = [
  { he: 'התכנית המקורית בלבד', layers: { original: true, floors: false, walls: false, openings: false, names: false, dims: false, dimlines: false, areas: false, furniture: false, balconies: true, summary: false } },
  { he: 'הניתוח על גבי התכנית', layers: { ...DEFAULT_LAYERS, original: true, floors: true, walls: true, openings: true, names: true, dims: false, areas: false } },
  { he: 'הניתוח בלבד', layers: { ...DEFAULT_LAYERS, original: false } },
];
