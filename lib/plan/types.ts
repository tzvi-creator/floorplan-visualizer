export type Rect = [number, number, number, number]; // x0,y0,x1,y1 in PDF points (y down)

export interface RoomType { id: string; he: string; color: string; counted: boolean; outdoor?: boolean }

export const ROOM_TYPES: RoomType[] = [
  { id: 'living', he: 'סלון', color: '#f2e3c6', counted: true },
  { id: 'living_kitchen', he: 'סלון / מטבח', color: '#f2e3c6', counted: true },
  { id: 'kitchen', he: 'מטבח', color: '#f5d9b8', counted: true },
  { id: 'dining', he: 'פינת אוכל', color: '#f2e3c6', counted: true },
  { id: 'master', he: 'חדר שינה הורים', color: '#cfe3f1', counted: true },
  { id: 'bedroom', he: 'חדר שינה', color: '#d9e8f5', counted: true },
  { id: 'master_bath', he: 'חדר רחצה הורים', color: '#bfe3e0', counted: true },
  { id: 'bath', he: 'חדר רחצה', color: '#c9ebe8', counted: true },
  { id: 'wc', he: 'שירותים', color: '#d5eee9', counted: true },
  { id: 'hall', he: 'מסדרון', color: '#ece6da', counted: true },
  { id: 'entrance', he: 'כניסה', color: '#ece6da', counted: true },
  { id: 'safe', he: 'ממ"ד', color: '#e5dccb', counted: true },
  { id: 'laundry', he: 'חדר שירות', color: '#e2e8ec', counted: true },
  { id: 'storage', he: 'מחסן', color: '#e0dcd2', counted: true },
  { id: 'balcony_sun', he: 'מרפסת שמש', color: '#d4e9c0', counted: false, outdoor: true },
  { id: 'balcony_sukkah', he: 'מרפסת סוכה', color: '#cbe5b4', counted: false, outdoor: true },
  { id: 'balcony', he: 'מרפסת', color: '#d4e9c0', counted: false, outdoor: true },
  { id: 'shaft', he: 'פיר / וונטה', color: '#d9d9d9', counted: false },
  { id: 'stairs', he: 'חדר מדרגות', color: '#e8d0d0', counted: false },
  { id: 'elevator', he: 'מעלית', color: '#d8d4e8', counted: false },
  { id: 'lobby', he: 'לובי קומתי', color: '#efe9dd', counted: false },
  { id: 'other', he: 'אחר', color: '#e6e3dc', counted: true },
];
export const TYPE_BY_ID: Record<string, RoomType> = Object.fromEntries(ROOM_TYPES.map(t => [t.id, t]));
export const isOutdoor = (t: string) => !!TYPE_BY_ID[t]?.outdoor;
export const isCommon = (t: string) => t === 'stairs' || t === 'elevator' || t === 'lobby';

export interface RoomT {
  heavy?: number;
  link?: 'door' | 'bridge'; // bridge = reached only through windows/sliding doors (balconies, shafts)
  id: string; aptId: string | null; bldId: string | null;
  name: string; type: string; auto: boolean; // auto=false => edited by the user
  rects: Rect[]; bbox: Rect; inner: Rect; areaPt2: number; cx: number; cy: number;
  region?: number;
}
export interface DoorT { id: string; hx: number; hy: number; ex: number; ey: number; r: number; sx: number; sy: number; a: string | null; b: string | null; bldId?: string | null; entrance?: boolean }
export interface WindowT { id: string; rects: Rect[]; bbox: Rect; lenPt: number; a: string | null; b: string | null; bldId: string | null }
export type OpeningKind = 'window' | 'slider' | 'door' | 'wall';
export function openingKind(an: Analysis, w: WindowT): OpeningKind {
  const byId = (id: string | null) => (id ? an.rooms.find(r => r.id === id) : undefined);
  const A = byId(w.a), B = byId(w.b);
  const out = (r?: RoomT) => !r || isOutdoor(r.type);
  if (out(A) || out(B)) return w.lenPt * an.cmPerPt > 150 ? 'slider' : 'window';
  return 'door';
}
export interface AptT { id: string; bldId: string; name: string; number: number; roomIds: string[]; bbox: Rect }
export interface BldT { id: string; name: string; bbox: Rect; lobbyId: string | null; aptIds: string[]; cores: { x: number; y: number }[]; walls: Rect[] }

export interface Analysis {
  version: 1;
  page: { w: number; h: number };
  cmPerPt: number;
  rooms: RoomT[]; apts: AptT[]; blds: BldT[]; doors: DoorT[]; windows: WindowT[];
  warnings: string[];
  meta: { source?: string; analyzedAt?: string; aiUsed?: boolean; scaleSource?: 'manual' | 'wall-calibrated' | 'page-size' };
}

export const PT_TO_MM = 25.4 / 72;
export const areaM2 = (a: Analysis, areaPt2: number) => areaPt2 * a.cmPerPt * a.cmPerPt / 10000;
export const lenM = (a: Analysis, pt: number) => pt * a.cmPerPt / 100;
