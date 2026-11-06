import type { Analysis, Rect, RoomT } from './types';
import { aptRooms } from './geom';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export interface Item { k: string; x: number; y: number; w: number; h: number; rot: 0 | 90 | 180 | 270; lw: number; ld: number; label?: string }

const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];
const opp: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Generate a plausible furniture layout for one room. All lengths in PDF points. */
export function furnish(an: Analysis, room: RoomT, blockers: { x: number; y: number }[]): Item[] {
  const cm = 1 / an.cmPerPt; // cm -> pt
  const R = room.inner;
  const x0 = R[0], y0 = R[1], x1 = R[2], y1 = R[3];
  const W = x1 - x0, H = y1 - y0;
  const placed: Item[] = [];
  const clear = 12 * cm;

  const lenOf = (s: Side) => (s === 'top' || s === 'bottom' ? W : H);
  const depthOf = (s: Side) => (s === 'top' || s === 'bottom' ? H : W);
  // blocked amount per side (doors / windows near that wall line)
  const blocked: Record<Side, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  const near = 55 * cm * 0.8;
  for (const b of blockers) {
    if (b.y > y0 - near && b.y < y0 + near && b.x > x0 - 10 && b.x < x1 + 10) blocked.top += 1;
    if (b.y > y1 - near && b.y < y1 + near && b.x > x0 - 10 && b.x < x1 + 10) blocked.bottom += 1;
    if (b.x > x0 - near && b.x < x0 + near && b.y > y0 - 10 && b.y < y1 + 10) blocked.left += 1;
    if (b.x > x1 - near && b.x < x1 + near && b.y > y0 - 10 && b.y < y1 + 10) blocked.right += 1;
  }
  const freeSides = (minLen: number, minDepth: number) => SIDES.filter(s => lenOf(s) >= minLen * cm && depthOf(s) >= minDepth * cm).sort((a, b) => blocked[a] - blocked[b] || lenOf(b) - lenOf(a));

  const mk = (k: string, side: Side, u: number, d: number, wl: number, dl: number, label?: string): Item => {
    // wl = length along wall, dl = depth into room (pt)
    let x = 0, y = 0, w = wl, h = dl, rot: Item['rot'] = 0;
    if (side === 'top') { x = x0 + u; y = y0 + d; rot = 0; }
    else if (side === 'bottom') { x = x0 + u; y = y1 - d - dl; rot = 180; }
    else if (side === 'left') { x = x0 + d; y = y0 + u; w = dl; h = wl; rot = 270; }
    else { x = x1 - d - dl; y = y0 + u; w = dl; h = wl; rot = 90; }
    return { k, x, y, w, h, rot, lw: wl, ld: dl, label };
  };
  const overlaps = (a: Item, b: Item, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
  const inside = (a: Item) => a.x >= x0 - 1 && a.y >= y0 - 1 && a.x + a.w <= x1 + 1 && a.y + a.h <= y1 + 1;
  const put = (it: Item, margin = 0) => { if (!inside(it) || placed.some(p => overlaps(it, p, margin))) return false; placed.push(it); return true; };
  const center = (side: Side, wl: number) => (lenOf(side) - wl) / 2;
  const t = room.type;
  const areaM = room.areaPt2 * an.cmPerPt * an.cmPerPt / 10000;

  if (t === 'bedroom' || t === 'master') {
    const bw = (t === 'master' || areaM > 11 ? 160 : areaM < 7.5 ? 90 : 140) * cm, bl = 200 * cm;
    const sides = freeSides(bw + 100 * cm, bl + 40 * cm);
    let bedSide: Side | null = sides[0] || null;
    if (bedSide) {
      const u = center(bedSide, bw);
      const bed = mk('bed', bedSide, u, 0, bw, bl); put(bed);
      const ns = 42 * cm;
      put(mk('nightstand', bedSide, u - ns - 4 * cm, 0, ns, ns));
      if (bw > 120 * cm) put(mk('nightstand', bedSide, u + bw + 4 * cm, 0, ns, ns));
      // wardrobe on another wall
      const ws = SIDES.filter(s => s !== bedSide && lenOf(s) > 130 * cm).sort((a, b) => blocked[a] - blocked[b] || lenOf(b) - lenOf(a));
      for (const s of ws) { const L = Math.min(lenOf(s) - 20 * cm, 260 * cm); if (put(mk('wardrobe', s, (lenOf(s) - L) / 2, 0, L, 60 * cm), clear)) break; }
      if (areaM > 12) { const s = ws.find(q => blocked[q] === 0 && q !== opp[bedSide!]) ; if (s) put(mk('desk', s, 10 * cm, 0, 120 * cm, 60 * cm), clear); }
    } else {
      // tiny room: bed along the longest wall
      const s = (W >= H ? 'top' : 'left') as Side;
      put(mk('bed', s, 0, 0, bl, bw));
    }
  } else if (t === 'living' || t === 'living_kitchen' || t === 'dining') {
    const longAxisH = W >= H; // kitchen/living arranged along the longer axis
    const sideA: Side = longAxisH ? (blocked.left <= blocked.right ? 'left' : 'right') : (blocked.top <= blocked.bottom ? 'top' : 'bottom'); // kitchen end
    const sideB = opp[sideA];
    if (t === 'living_kitchen') {
      // L-shaped kitchen counter along side A and one adjacent wall
      const along = (longAxisH ? H : W);
      const legLen = Math.min(along - 30 * cm, 360 * cm);
      const cnt = mk('counter', sideA, 0, 0, legLen, 62 * cm);
      put(cnt);
      // sink + hob + fridge items on the counter
      placed.push(mk('sink', sideA, legLen * 0.25, 5 * cm, 80 * cm, 46 * cm));
      placed.push(mk('hob', sideA, legLen * 0.62, 5 * cm, 60 * cm, 46 * cm));
      placed.push(mk('fridge', sideA, Math.max(0, legLen - 70 * cm), 0, 68 * cm, 66 * cm));
      // dining table next to kitchen
      const dineD = 90 * cm, dineW = 170 * cm;
      const kd = 62 * cm + 90 * cm; // counter + working zone
      const tableSide: Side = longAxisH ? 'top' : 'left';
      void tableSide;
      const cx = x0 + W / 2, cy = y0 + H / 2;
      // table positioned after the kitchen zone along the long axis
      let tx: number, ty: number, tw = dineW, th = dineD;
      if (longAxisH) { tw = dineD; th = dineW; tx = sideA === 'left' ? x0 + kd + 30 * cm : x1 - kd - 30 * cm - tw; ty = y0 + (H - th) / 2; if (legLen < H * 0.6) ty = y0 + H - th - 40 * cm; }
      else { tx = x0 + (W - tw) / 2; ty = sideA === 'top' ? y0 + kd + 30 * cm : y1 - kd - 30 * cm - th; if (legLen < W * 0.6) tx = x0 + W - tw - 40 * cm; }
      void cx; void cy;
      const table: Item = { k: 'dining', x: tx, y: ty, w: tw, h: th, rot: 0, lw: Math.max(tw, th), ld: Math.min(tw, th) };
      if (inside(table) && !placed.some(p => overlaps(table, p, 30 * cm))) placed.push(table);
      // sofa on side B
      const sw = 230 * cm, sd = 95 * cm;
      if (lenOf(sideB) > sw + 60 * cm && depthOf(sideB) > 420 * cm) {
        const sof = mk('sofa', sideB, center(sideB, sw), 40 * cm, sw, sd);
        // sofa faces the room (back on wall B) - rotate to face
        if (put(sof)) {
          put(mk('coffee', sideB, center(sideB, 110 * cm), 40 * cm + sd + 45 * cm, 110 * cm, 60 * cm));
          const tvSide = sideA; // TV opposite to sofa would collide with kitchen; use perpendicular wall instead
          void tvSide;
          const perp: Side = longAxisH ? (blocked.top <= blocked.bottom ? 'top' : 'bottom') : (blocked.left <= blocked.right ? 'left' : 'right');
          const tvLen = 170 * cm; const tv = mk('tv', perp, lenOf(perp) - tvLen - 20 * cm + (sideB === 'right' || sideB === 'bottom' ? 0 : -(lenOf(perp) - tvLen - 40 * cm)), 0, tvLen, 40 * cm);
          put(tv, 4 * cm);
        }
      }
    } else {
      const sw = 230 * cm, sd = 95 * cm;
      const s = freeSides(sw + 60 * cm, 330 * cm)[0];
      if (s) {
        put(mk('sofa', s, center(s, sw), 20 * cm, sw, sd));
        put(mk('coffee', s, center(s, 110 * cm), 20 * cm + sd + 45 * cm, 110 * cm, 60 * cm));
        const o = opp[s]; if (lenOf(o) > 200 * cm) put(mk('tv', o, center(o, 170 * cm), 0, 170 * cm, 40 * cm));
      }
      if (t === 'dining' || areaM > 24) put({ k: 'dining', x: x0 + 30 * cm, y: y0 + 30 * cm, w: 90 * cm, h: 170 * cm, rot: 0, lw: 170 * cm, ld: 90 * cm });
    }
  } else if (t === 'kitchen') {
    const ss = SIDES.filter(s => lenOf(s) > 180 * cm).sort((a, b) => blocked[a] - blocked[b] || lenOf(b) - lenOf(a));
    if (ss[0]) {
      const s = ss[0]; const L = Math.min(lenOf(s), 360 * cm);
      put(mk('counter', s, 0, 0, L, 62 * cm));
      placed.push(mk('sink', s, L * 0.3, 5 * cm, 80 * cm, 46 * cm), mk('hob', s, L * 0.65, 5 * cm, 60 * cm, 46 * cm));
      const s2 = ss.find(q => q !== s && q !== opp[s] && lenOf(q) > 200 * cm);
      if (s2) put(mk('counter', s2, 62 * cm, 0, Math.min(lenOf(s2) - 62 * cm, 240 * cm), 62 * cm));
    }
    if (areaM > 9) put({ k: 'dining', x: x0 + W / 2 - 45 * cm, y: y0 + H / 2 - 40 * cm, w: 90 * cm, h: 80 * cm, rot: 0, lw: 90 * cm, ld: 80 * cm });
  } else if (t === 'bath' || t === 'master_bath' || t === 'wc') {
    const ss = SIDES.sort((a, b) => lenOf(b) - lenOf(a));
    const long = ss[0];
    if (t === 'wc') {
      const s = lenOf('top') >= lenOf('left') ? 'top' : 'left';
      put(mk('toilet', s as Side, center(s as Side, 40 * cm), 0, 40 * cm, 68 * cm));
      const o = opp[s as Side]; put(mk('basin', o, center(o, 45 * cm), 0, 45 * cm, 35 * cm));
    } else {
      // bath or shower along the longest wall, toilet + vanity on the others
      const L = lenOf(long);
      if (L >= 170 * cm && depthOf(long) >= 170 * cm) put(mk('bath', long, 0, 0, Math.min(170 * cm, L), 72 * cm));
      else put(mk('shower', long, 0, 0, 90 * cm, 90 * cm));
      const rest = SIDES.filter(s => s !== long).sort((a, b) => blocked[a] - blocked[b]);
      let kinds = ['toilet', 'vanity'];
      for (const s of rest) { const k = kinds[0]; if (!k) break; const wl = k === 'toilet' ? 40 * cm : 65 * cm, dl = k === 'toilet' ? 68 * cm : 48 * cm; if (put(mk(k, s, center(s, wl), 0, wl, dl), 5 * cm)) kinds = kinds.slice(1); }
      if (kinds.length) for (const s of rest) { const k = kinds[0]; if (!k) break; const wl = k === 'toilet' ? 40 * cm : 65 * cm, dl = k === 'toilet' ? 68 * cm : 48 * cm; if (put(mk(k, s, 10 * cm, 0, wl, dl), 2 * cm)) kinds = kinds.slice(1); }
      if (areaM > 7) put(mk('washer', opp[long], 10 * cm, 0, 60 * cm, 60 * cm));
    }
  } else if (t === 'safe') {
    const s = freeSides(150, 200)[0] || 'top';
    put(mk('bed', s as Side, 10 * cm, 0, 90 * cm, 200 * cm));
    const o = SIDES.find(q => q !== s && lenOf(q) > 140 * cm && blocked[q] === 0);
    if (o) put(mk('desk', o, 10 * cm, 0, 120 * cm, 55 * cm), clear);
  } else if (t === 'balcony' || t === 'balcony_sun' || t === 'balcony_sukkah') {
    const s = SIDES.sort((a, b) => lenOf(b) - lenOf(a))[0];
    if (areaM > 5 && depthOf(s) > 160 * cm) { put({ k: 'bistro', x: x0 + W / 2 - 45 * cm, y: y0 + H / 2 - 45 * cm, w: 90 * cm, h: 90 * cm, rot: 0, lw: 90 * cm, ld: 90 * cm }); }
    put(mk('plant', s, 8 * cm, 8 * cm, 40 * cm, 40 * cm));
    if (lenOf(s) > 220 * cm) put(mk('plant', s, lenOf(s) - 48 * cm, 8 * cm, 40 * cm, 40 * cm));
  } else if (t === 'laundry' || t === 'storage') {
    if (areaM > 2.2) put(mk('washer', 'top', 6 * cm, 0, 60 * cm, 60 * cm));
  } else if (t === 'hall' || t === 'entrance') {
    const s = SIDES.filter(q => lenOf(q) > 160 * cm && depthOf(q) > 180 * cm).sort((a, b) => blocked[a] - blocked[b])[0];
    if (s) put(mk('shoes', s, 10 * cm, 0, 90 * cm, 35 * cm));
  }
  void aptRooms;
  return placed;
}

export function blockersForRoom(an: Analysis, room: RoomT, doors: { hx: number; hy: number; ex: number; ey: number; a: string | null; b: string | null }[], windows: { bbox: Rect; a: string | null; b: string | null }[]) {
  const out: { x: number; y: number }[] = [];
  for (const d of doors) if (d.a === room.id || d.b === room.id) out.push({ x: (d.hx + d.ex) / 2, y: (d.hy + d.ey) / 2 });
  for (const w of windows) if (w.a === room.id || w.b === room.id) out.push({ x: (w.bbox[0] + w.bbox[2]) / 2, y: (w.bbox[1] + w.bbox[3]) / 2 });
  return out;
}
