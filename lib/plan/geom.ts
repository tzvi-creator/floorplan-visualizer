import type { Analysis, AptT, DoorT, OpeningKind, Rect, RoomT, WindowT } from './types';
import { TYPE_BY_ID, isOutdoor, openingKind } from './types';
import { grossArea } from './area';

export const roomById = (an: Analysis, id: string | null | undefined) => (id ? an.rooms.find(r => r.id === id) : undefined);
export const aptRooms = (an: Analysis, apt: AptT) => apt.roomIds.map(i => roomById(an, i)!).filter(Boolean);

export const m2 = (an: Analysis, pt2: number) => pt2 * an.cmPerPt * an.cmPerPt / 10000;
export const roomArea = (an: Analysis, r: RoomT) => m2(an, r.areaPt2);
const r05 = (v: number) => Math.round(v / 0.05) * 0.05;
export function roomDims(an: Analysis, r: RoomT): [number, number] {
  const w = (r.inner[2] - r.inner[0]) * an.cmPerPt / 100, h = (r.inner[3] - r.inner[1]) * an.cmPerPt / 100;
  const a = r05(Math.max(w, h)), b = r05(Math.min(w, h));
  return [a, b];
}
export const fmt = (v: number, d = 2) => v.toFixed(d).replace(/\.?0+$/, m => (m === '.00' || m === '.0' ? '' : m));
export const fmtDim = (v: number) => v.toFixed(2);

export interface AptStats { total: number; net: number; walls: number; balcony: number; rooms: number; bedrooms: number; counted: number; excluded: number }
export function aptStats(an: Analysis, apt: AptT): AptStats {
  let net = 0, balcony = 0, beds = 0, living = 0, excluded = 0;
  for (const r of aptRooms(an, apt)) {
    const t = TYPE_BY_ID[r.type]; const a = roomArea(an, r);
    if (r.excluded) { excluded += a; continue; }
    if (isOutdoor(r.type)) balcony += a;
    else if (t?.counted !== false) net += a;
    if (['bedroom', 'master', 'safe'].includes(r.type)) beds++;
    if (['living', 'living_kitchen'].includes(r.type)) living = 1;
  }
  const gi = grossArea(an, apt);
  return { total: gi.gross, net: gi.net || net, walls: gi.gross - (gi.net || net), balcony, rooms: beds + (living || 1), bedrooms: beds, counted: net, excluded };
}

export function boxOf(rs: Rect[], pad = 0): Rect {
  return [Math.min(...rs.map(r => r[0])) - pad, Math.min(...rs.map(r => r[1])) - pad, Math.max(...rs.map(r => r[2])) + pad, Math.max(...rs.map(r => r[3])) + pad];
}
export const inter = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
export function clip(a: Rect, b: Rect): Rect | null {
  const r: Rect = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] - r[0] > 0.2 && r[3] - r[1] > 0.2 ? r : null;
}

export interface ScopeData { box: Rect; rooms: RoomT[]; walls: Rect[]; windows: (WindowT & { kind: OpeningKind })[]; doors: DoorT[] }
/** geometry for an apartment (or a whole building when apt is null) */
export function scopeData(an: Analysis, bldId: string, aptId: string | null, pad = 16): ScopeData {
  if (bldId === '*') {
    const box = boxOf(an.blds.map(b => b.bbox), pad + 10);
    const walls: Rect[] = []; for (const b of an.blds) for (const w of b.walls) walls.push(w);
    return { box, rooms: an.rooms, walls, windows: an.windows.map(w => ({ ...w, kind: openingKind(an, w) })), doors: an.doors };
  }
  const bld = an.blds.find(b => b.id === bldId) || an.blds[0];
  const apt = aptId ? an.apts.find(a => a.id === aptId) : undefined;
  const rooms = apt ? aptRooms(an, apt) : an.rooms.filter(r => r.bldId === bld.id);
  const box = apt ? boxOf([apt.bbox], pad) : boxOf([bld.bbox], pad);
  const walls: Rect[] = [];
  for (const w of bld.walls) { const c = clip(w, box); if (c) walls.push(c); }
  const roomIds = new Set(rooms.map(r => r.id));
  const windows = an.windows.filter(w => w.bldId === bld.id && inter(w.bbox, box) && (!apt || (w.a && roomIds.has(w.a)) || (w.b && roomIds.has(w.b)))).map(w => ({ ...w, kind: openingKind(an, w) }));
  const doors = an.doors.filter(d => d.bldId === bld.id && (!apt || (d.a && roomIds.has(d.a)) || (d.b && roomIds.has(d.b)) || inter([Math.min(d.hx, d.ex) - 2, Math.min(d.hy, d.ey) - 2, Math.max(d.hx, d.ex) + 2, Math.max(d.hy, d.ey) + 2], box) && !!(roomIds.has(d.a || '') || roomIds.has(d.b || ''))));
  return { box, rooms, walls, windows, doors };
}

export function aptOfRoom(an: Analysis, r: RoomT) { return an.apts.find(a => a.id === r.aptId); }

/** Re-derive apt.roomIds / bbox after room edits */
export function rebuildApts(an: Analysis) {
  for (const a of an.apts) {
    a.roomIds = an.rooms.filter(r => r.aptId === a.id).map(r => r.id);
    if (a.roomIds.length) a.bbox = boxOf(a.roomIds.map(i => roomById(an, i)!.bbox));
  }
}

export function planSummary(an: Analysis): string {
  const lines: string[] = [`קנה מידה: ${Math.round(an.cmPerPt / 0.03528)}:1 (1 נקודה = ${an.cmPerPt.toFixed(2)} ס"מ)`];
  for (const b of an.blds) {
    lines.push(`${b.name}: ${b.aptIds.length} דירות`);
    for (const id of b.aptIds) {
      const a = an.apts.find(x => x.id === id)!; const st = aptStats(an, a);
      lines.push(`  ${a.name}: ${st.rooms} חדרים, שטח דירה (כולל קירות) ${st.total.toFixed(1)} מ"ר, נטו ${st.net.toFixed(1)} מ"ר, מרפסות ${st.balcony.toFixed(1)} מ"ר; ` + aptRooms(an, a).map(r => `${r.name} (${roomArea(an, r).toFixed(1)} מ"ר, ${roomDims(an, r).map(v => v.toFixed(2)).join('×')})`).join(', '));
    }
  }
  return lines.join('\n');
}
