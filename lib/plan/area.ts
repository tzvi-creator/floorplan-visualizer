import type { Analysis, AptT, Rect, RoomT } from './types';
import { TYPE_BY_ID, isOutdoor } from './types';

/**
 * Apartment area by the standard measuring rules ("שטח דירה"):
 *   - every room is measured between finished faces (net),
 *   - interior walls inside the apartment: full thickness,
 *   - exterior walls of the building (facing outside / its own balcony): full thickness,
 *   - walls shared with another apartment or a public/common area: half thickness.
 * Balconies are NOT included (reported separately, net).
 * Computed on a 5cm grid from the stored room + wall geometry.
 */
export interface GrossInfo { net: number; interiorWalls: number; exteriorWalls: number; sharedWalls: number; gross: number }

const memo = new WeakMap<Analysis, Map<string, GrossInfo>>();

export function grossArea(an: Analysis, apt: AptT): GrossInfo {
  let m = memo.get(an); if (!m) memo.set(an, m = new Map());
  const key = apt.id + '|' + apt.roomIds.length;
  const hit = m.get(key); if (hit) return hit;
  const r = compute(an, apt); m.set(key, r); return r;
}

const FREE = 0, SELF = 1, OTHER = 2, PUBLIC = 3, OUT = 4, WALL = 9;

function compute(an: Analysis, apt: AptT): GrossInfo {
  const g = 5 / an.cmPerPt; // 5cm cell in points
  const pad = 70 / an.cmPerPt;
  const bx0 = apt.bbox[0] - pad, by0 = apt.bbox[1] - pad, bx1 = apt.bbox[2] + pad, by1 = apt.bbox[3] + pad;
  const W = Math.max(1, Math.ceil((bx1 - bx0) / g)), H = Math.max(1, Math.ceil((by1 - by0) / g));
  if (W * H > 4_000_000) { const net = apt.roomIds.reduce((s, id) => { const r = an.rooms.find(x => x.id === id); return r && !isOutdoor(r.type) && TYPE_BY_ID[r.type]?.counted !== false ? s + r.areaPt2 * an.cmPerPt * an.cmPerPt / 1e4 : s; }, 0); return { net, interiorWalls: 0, exteriorWalls: 0, sharedWalls: 0, gross: net * 1.12 }; }
  const lab = new Uint8Array(W * H);
  const fill = (q: Rect, v: number) => {
    const x0 = Math.max(0, Math.floor((q[0] - bx0) / g)), x1 = Math.min(W, Math.ceil((q[2] - bx0) / g));
    const y0 = Math.max(0, Math.floor((q[1] - by0) / g)), y1 = Math.min(H, Math.ceil((q[3] - by0) / g));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) lab[y * W + x] = v;
  };
  const box: Rect = [bx0, by0, bx1, by1];
  const hit = (q: Rect) => q[0] < box[2] && q[2] > box[0] && q[1] < box[3] && q[3] > box[1];
  const bld = an.blds.find(b => b.id === apt.bldId);
  // walls first, rooms overwrite
  for (const q of bld?.walls || []) if (hit(q)) fill(q, WALL);
  for (const w of an.windows) if (w.bldId === apt.bldId) for (const q of w.rects) if (hit(q)) fill(q, WALL);
  for (const r of an.rooms) {
    if (!hit(r.bbox)) continue;
    const t = TYPE_BY_ID[r.type];
    let v: number;
    if (isOutdoor(r.type) || r.type === 'shaft') v = OUT;
    else if (r.aptId === apt.id) v = r.excluded ? OTHER : t?.counted === false ? OUT : SELF;
    else if (r.aptId) v = OTHER;
    else v = PUBLIC;
    for (const q of r.rects) if (hit(q)) fill(q, v);
  }
  // classify wall cells
  const maxD = 12; // 60cm
  const look = (x: number, y: number, dx: number, dy: number): [number, number] => { // [label, distance]
    let cx = x, cy = y;
    for (let d = 1; d <= maxD; d++) {
      cx += dx; cy += dy; if (cx < 0 || cy < 0 || cx >= W || cy >= H) return [FREE, d];
      const v = lab[cy * W + cx]; if (v !== WALL) return [v, d];
    }
    return [-1, maxD + 1];
  };
  let net = 0, interior = 0, exterior = 0, shared = 0;
  const cell = g * g * an.cmPerPt * an.cmPerPt / 1e4; // m2 per cell
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = lab[y * W + x];
    if (v === SELF) { net++; continue; }
    if (v !== WALL) continue;
    const L = look(x, y, -1, 0), R = look(x, y, 1, 0), U = look(x, y, 0, -1), D = look(x, y, 0, 1);
    const sh = L[1] + R[1], sv = U[1] + D[1];
    let a: [number, number], b: [number, number];
    if (sh <= sv) { a = L; b = R; } else { a = U; b = D; }
    if (a[0] === -1 || b[0] === -1) { // thick / unclear: count if a SELF cell is close
      const near = [L, R, U, D].some(s => s[0] === SELF && s[1] <= 4); if (near) exterior++; continue;
    }
    const aS = a[0] === SELF, bS = b[0] === SELF;
    if (aS && bS) { interior++; continue; }
    if (!aS && !bS) continue;
    const other = aS ? b : a, own = aS ? a : b;
    if (other[0] === OTHER || other[0] === PUBLIC) { if (own[1] < other[1] || (own[1] === other[1] && x % 2 === 0)) shared++; }
    else exterior++;
  }
  const n2 = (n: number) => n * cell;
  const netA = n2(net), i = n2(interior), e = n2(exterior), s = n2(shared);
  return { net: netA, interiorWalls: i, exteriorWalls: e, sharedWalls: s, gross: netA + i + e + s };
}

export function netRoomsArea(an: Analysis, apt: AptT) {
  let t = 0;
  for (const id of apt.roomIds) { const r: RoomT | undefined = an.rooms.find(x => x.id === id); if (r && !r.excluded && !isOutdoor(r.type) && TYPE_BY_ID[r.type]?.counted !== false) t += r.areaPt2 * an.cmPerPt * an.cmPerPt / 1e4; }
  return t;
}
