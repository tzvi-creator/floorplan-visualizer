import type { RawPage, RawPath } from './extract';
import type { Analysis, AptT, BldT, DoorT, Rect, RoomT, WindowT } from './types';
import { PT_TO_MM } from './types';

const isDark = (c: string) => {
  if (!c || c[0] !== '#' || c.length < 7) return false;
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
  return r < 70 && g < 70 && b < 70;
};

const isGrayish = (c: string) => { if (!c || c[0] !== '#' || c.length < 7) return false; const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); return Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r < 0xb8; };

export interface AnalyzeOptions { neckCm?: number; cmPerPt?: number; scaleDenom?: number; source?: string; onProgress?: (s: string) => void }

interface Reg { id: number; area: number; per: number; x0: number; y0: number; x1: number; y1: number; sx: number; sy: number; border: boolean; cavity: boolean; hatch: number; heavy: number; bnd: number }

export function guessScaleDenom(page: { w: number; h: number }): number {
  const mmW = Math.max(page.w, page.h) * PT_TO_MM;
  if (mmW > 1000) return 50;     // A0/A1 sheets: usually 1:50
  if (mmW > 700) return 50;
  if (mmW > 400) return 100;     // A3
  return 100;
}

export function analyzePage(raw: RawPage, opt: AnalyzeOptions = {}): Analysis {
  const log = opt.onProgress || (() => {});
  const denom = opt.scaleDenom || guessScaleDenom({ w: raw.width, h: raw.height });
  const cmPerPt = opt.cmPerPt || (PT_TO_MM * denom) / 10;
  const warnings: string[] = [];

  // ---------- raster of walls ----------
  const res = Math.max(1, Math.sqrt((raw.width * raw.height) / 9e6));
  const W = Math.ceil(raw.width / res), H = Math.ceil(raw.height / res);
  const mask = new Uint8Array(W * H); // bit1 solid, bit2 heavy, bit4 door chord
  const S = 1 / res;
  const stamp = (x: number, y: number, th: number, bit: number) => {
    for (let j = 0; j < th; j++) { const yy = y + j; if (yy < 0 || yy >= H) continue; for (let i = 0; i < th; i++) { const xx = x + i; if (xx >= 0 && xx < W) mask[yy * W + xx] |= bit; } }
  };
  const line = (ax: number, ay: number, bx: number, by: number, th: number, bit: number, cb?: (x: number, y: number) => void) => {
    let x0 = Math.round(ax * S), y0 = Math.round(ay * S); const x1 = Math.round(bx * S), y1 = Math.round(by * S);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      if (cb) cb(x0, y0); else stamp(x0, y0, th, bit);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };
  const MINLW = 0.55;
  const stairRuns = findStairs(raw.paths, cmPerPt);
  const inStair = (p: RawPath) => { if (p.pts.length !== 2) return false; for (const s of stairRuns) { if (p.pts.every(q => q[0] > s.x0 - 2 && q[0] < s.x1 + 2 && q[1] > s.y0 - 2 && q[1] < s.y1 + 2)) return true; } return false; };
  for (const p of raw.paths) {
    if (!p.stroke || !isDark(p.sc) || p.lw < MINLW) continue;
    if (inStair(p)) continue;
    const th = p.lw >= 1.3 ? 2 : 1, bit = p.lw >= 1.4 ? 3 : 1;
    for (let i = 1; i < p.pts.length; i++) line(p.pts[i - 1][0], p.pts[i - 1][1], p.pts[i][0], p.pts[i][1], th, bit);
    if (p.closed && p.pts.length > 2) { const a = p.pts[p.pts.length - 1], b = p.pts[0]; line(a[0], a[1], b[0], b[1], th, bit); }
  }
  log('מסנן טקסטים וסמלים קטנים');
  const stack = new Int32Array(W * H);
  // remove small solid components (text glyph outlines, dimensions digits)
  {
    const seen = new Uint8Array(W * H);
    const comp: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (!(mask[i] & 1) || seen[i]) continue;
      let sp = 0; stack[sp++] = i; seen[i] = 1; comp.length = 0;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (sp) {
        const j = stack[--sp]; comp.push(j);
        const x = j % W, y = (j / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const k = yy * W + xx; if ((mask[k] & 1) && !seen[k]) { seen[k] = 1; stack[sp++] = k; }
        }
      }
      if (Math.max(x1 - x0, y1 - y0) * res < 48) for (const j of comp) mask[j] = 0;
    }
  }

  // ---------- door arcs -> chords ----------
  log('מזהה פתחי דלתות');
  const found = findDoors(raw.paths, cmPerPt);
  const hasSolidNear = (x: number, y: number, rad: number) => {
    const cx = Math.round(x * S), cy = Math.round(y * S), r = Math.ceil(rad * S);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const xx = cx + i, yy = cy + j; if (xx >= 0 && yy >= 0 && xx < W && yy < H && (mask[yy * W + xx] & 1)) return true; }
    return false;
  };
  const doorsRaw: DoorRaw[] = [];
  const probe = Math.max(5, 14 / cmPerPt);
  for (const d of found) {
    const ux = (d.ex - d.hx) / d.r, uy = (d.ey - d.hy) / d.r;
    const farOk = hasSolidNear(d.ex + ux * 3, d.ey + uy * 3, probe * 0.7);
    const nearOk = hasSolidNear(d.hx - ux * 3, d.hy - uy * 3, probe * 0.7);
    if (!farOk && !nearOk) continue;
    doorsRaw.push(d);
  }
  // dedupe doors
  const doorsU: DoorRaw[] = [];
  for (const d of doorsRaw) if (!doorsU.some(o => Math.hypot(o.hx - d.hx, o.hy - d.hy) < 4 && Math.hypot(o.ex - d.ex, o.ey - d.ey) < 4)) doorsU.push(d);
  for (const d of doorsU) line(d.hx, d.hy, d.ex, d.ey, 2, 4);
  // gaps between wall stubs with no door symbol (open doorways)
  {
    const cmPx = cmPerPt * res; // cm per pixel
    const wmin = Math.round(58 / cmPx), wmax = Math.round(128 / cmPx);
    const tmin = Math.max(2, Math.round(3.5 / res)), tmax = Math.round(34 / res);
    const found2: DoorRaw[] = [];
    const scan = (horiz: boolean) => {
      const A = horiz ? H : W, B = horiz ? W : H; // A = number of rows(lines), B = line length
      const at = (a: number, b: number) => horiz ? mask[a * W + b] & 5 : mask[b * W + a] & 5;
      let prev = new Map<string, { s: number; e: number; a0: number; n: number }>();
      for (let a = 0; a <= A; a++) {
        const cur = new Map<string, { s: number; e: number; a0: number; n: number }>();
        if (a < A) {
          let b = 0;
          while (b < B) {
            if (at(a, b)) { b++; continue; }
            let e = b; while (e + 1 < B && !at(a, e + 1)) e++;
            const w = e - b + 1;
            if (b > 0 && e < B - 1 && w >= wmin && w <= wmax) { const k = b + ':' + e; const p = prev.get(k); cur.set(k, p ? { ...p, n: p.n + 1 } : { s: b, e, a0: a, n: 1 }); }
            b = e + 1;
          }
        }
        for (const [k, v] of prev) {
          if (cur.has(k)) continue;
          if (v.n < tmin || v.n > tmax) continue;
          const mid = v.s + (v.e - v.s) / 2, aStart = v.a0 - 1, aEnd = v.a0 + v.n;
          if (aStart < 0 || aEnd >= A) continue;
          if (at(aStart, Math.round(mid)) || at(aEnd, Math.round(mid))) continue; // not a through passage
          // both sides must open up wider than the channel
          const wideAt = (aa: number) => { let l = Math.round(mid), r = Math.round(mid); while (l > 0 && !at(aa, l - 1)) l--; while (r < B - 1 && !at(aa, r + 1)) r++; return r - l + 1; };
          if (wideAt(aStart) < v.e - v.s + 1 + 4 && wideAt(aEnd) < v.e - v.s + 1 + 4) continue;
          const am = v.a0 + v.n / 2;
          const x0 = horiz ? v.s : am, x1 = horiz ? v.e : am, y0 = horiz ? am : v.s, y1 = horiz ? am : v.e;
          found2.push({ hx: x0 * res, hy: y0 * res, ex: (horiz ? v.e + 1 : am) * res, ey: (horiz ? am : v.e + 1) * res, r: (v.e - v.s + 1) * res, sx: x1 * res, sy: y1 * res });
        }
        prev = cur;
      }
    };
    scan(true); scan(false);
    for (const d of found2) { if (!doorsU.some(o => Math.hypot((o.hx + o.ex) / 2 - (d.hx + d.ex) / 2, (o.hy + o.ey) / 2 - (d.hy + d.ey) / 2) < 12)) { doorsU.push(d); line(d.hx, d.hy, d.ex, d.ey, 2, 4); } }
  }

  // ---------- label free regions ----------
  log('מאתר חדרים וגבולות');
  const labels = new Int32Array(W * H);
  const regs: Reg[] = [{ id: 0, area: 0, per: 0, x0: 0, y0: 0, x1: 0, y1: 0, sx: 0, sy: 0, border: false, cavity: false, hatch: 0, heavy: 0, bnd: 0 }];
  for (let i = 0; i < W * H; i++) {
    if ((mask[i] & 5) || labels[i]) continue;
    const id = regs.length;
    const r: Reg = { id, area: 0, per: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0, border: false, cavity: false, hatch: 0, heavy: 0, bnd: 0 };
    let sp = 0; stack[sp++] = i; labels[i] = id;
    while (sp) {
      const j = stack[--sp]; const x = j % W, y = (j / W) | 0;
      r.area++; r.sx += x; r.sy += y;
      if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
      let edge = false;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { r.border = true; edge = true; }
      if (x > 0) { const k = j - 1; if (mask[k] & 5) edge = true; else if (!labels[k]) { labels[k] = id; stack[sp++] = k; } }
      if (x < W - 1) { const k = j + 1; if (mask[k] & 5) edge = true; else if (!labels[k]) { labels[k] = id; stack[sp++] = k; } }
      if (y > 0) { const k = j - W; if (mask[k] & 5) edge = true; else if (!labels[k]) { labels[k] = id; stack[sp++] = k; } }
      if (y < H - 1) { const k = j + W; if (mask[k] & 5) edge = true; else if (!labels[k]) { labels[k] = id; stack[sp++] = k; } }
      if (edge) r.per++;
    }
    r.cavity = !r.border && (2 * r.area / Math.max(1, r.per)) * res < 20 / 1; // mean width < 20pt
    regs.push(r);
  }
  // ----- split regions at narrow necks (doorways without symbols) via distance-transform cores -----
  {
    const cmPx = cmPerPt * res;
    const Rpx = Math.max(3, Math.round((opt.neckCm || 50) / cmPx));
    const isCand = (i: number) => { const l = labels[i]; if (!l) return false; const r = regs[l]; return !r.cavity && !r.border && r.area * res * res * cmPerPt * cmPerPt / 10000 > 0.4; };
    const BIG = 60000;
    const dt = new Uint16Array(W * H);
    for (let i = 0; i < W * H; i++) dt[i] = isCand(i) ? BIG : 0;
    for (let y = 1; y < H; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!dt[i]) continue;
      const a = dt[i - 1] + 3, b = dt[i - W] + 3, c = dt[i - W - 1] + 4, d = dt[i - W + 1] + 4;
      let m = dt[i]; if (a < m) m = a; if (b < m) m = b; if (c < m) m = c; if (d < m) m = d; dt[i] = m;
    }
    for (let y = H - 2; y >= 0; y--) for (let x = W - 2; x >= 1; x--) {
      const i = y * W + x; if (!dt[i]) continue;
      const a = dt[i + 1] + 3, b = dt[i + W] + 3, c = dt[i + W + 1] + 4, d = dt[i + W - 1] + 4;
      let m = dt[i]; if (a < m) m = a; if (b < m) m = b; if (c < m) m = c; if (d < m) m = d; dt[i] = m;
    }
    const thr = Rpx * 3;
    const core = new Int32Array(W * H); // 0 none
    const coreSize: number[] = [0];
    for (let i = 0; i < W * H; i++) {
      if (dt[i] < thr || core[i]) continue;
      const id = coreSize.length; let n = 0; let sp = 0; stack[sp++] = i; core[i] = id;
      while (sp) {
        const j = stack[--sp]; n++; const x = j % W;
        if (x > 0 && dt[j - 1] >= thr && !core[j - 1]) { core[j - 1] = id; stack[sp++] = j - 1; }
        if (x < W - 1 && dt[j + 1] >= thr && !core[j + 1]) { core[j + 1] = id; stack[sp++] = j + 1; }
        if (j >= W && dt[j - W] >= thr && !core[j - W]) { core[j - W] = id; stack[sp++] = j - W; }
        if (j < W * H - W && dt[j + W] >= thr && !core[j + W]) { core[j + W] = id; stack[sp++] = j + W; }
      }
      coreSize.push(n);
    }
    // cores per region
    const coresOf = new Map<number, Set<number>>();
    const minCore = Math.round(60 / (res * res));
    for (let i = 0; i < W * H; i++) { const c = core[i]; if (!c || coreSize[c] < minCore) continue; const l = labels[i]; let st = coresOf.get(l); if (!st) coresOf.set(l, st = new Set()); st.add(c); }
    const multi = new Set<number>(); for (const [l, st] of coresOf) if (st.size >= 2) multi.add(l);
    if (multi.size) {
      // multi-source BFS growth inside each region
      const nl = new Int32Array(W * H); let next = regs.length;
      const coreLabel = new Map<number, number>(); // core -> new label (first core of a region keeps its id)
      const used = new Set<number>();
      for (const [l, st] of coresOf) if (multi.has(l)) for (const c of st) { if (!used.has(l)) { coreLabel.set(c, l); used.add(l); } else coreLabel.set(c, next++); }
      let qa: number[] = [];
      for (let i = 0; i < W * H; i++) { const c = core[i]; if (c && coreLabel.has(c) && multi.has(labels[i])) { nl[i] = coreLabel.get(c)!; qa.push(i); } }
      while (qa.length) {
        const qb: number[] = [];
        for (const j of qa) {
          const x = j % W, l = labels[j], v = nl[j];
          if (x > 0 && labels[j - 1] === l && !nl[j - 1]) { nl[j - 1] = v; qb.push(j - 1); }
          if (x < W - 1 && labels[j + 1] === l && !nl[j + 1]) { nl[j + 1] = v; qb.push(j + 1); }
          if (j >= W && labels[j - W] === l && !nl[j - W]) { nl[j - W] = v; qb.push(j - W); }
          if (j < W * H - W && labels[j + W] === l && !nl[j + W]) { nl[j + W] = v; qb.push(j + W); }
        }
        qa = qb;
      }
      for (let i = 0; i < W * H; i++) if (nl[i]) labels[i] = nl[i];
      // rebuild region stats
      const nr: Reg[] = []; for (let k = 0; k < next; k++) nr.push({ id: k, area: 0, per: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0, border: false, cavity: false, hatch: 0, heavy: 0, bnd: 0 });
      for (let i = 0; i < W * H; i++) {
        const l = labels[i]; if (!l) continue; const r = nr[l]; const x = i % W, y = (i / W) | 0;
        r.area++; r.sx += x; r.sy += y; if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) r.border = true;
        if ((x > 0 && (mask[i - 1] & 5)) || (x < W - 1 && (mask[i + 1] & 5)) || (y > 0 && (mask[i - W] & 5)) || (y < H - 1 && (mask[i + W] & 5))) r.per++;
      }
      for (const r of nr) { if (r.id && r.area) { const o = regs[r.id]; r.cavity = o ? o.cavity : false; if (o) r.border = r.border || o.border; } }
      regs.length = 0; for (const r of nr) regs.push(r);
      for (const r of regs) if (r.id && r.area === 0) r.cavity = true; // empty ids
    }
  }
  const N = regs.length;
  for (const r of regs) if (r.id > 0 && r.area * res * res * cmPerPt * cmPerPt / 10000 > 350) { r.border = true; r.cavity = false; }

  // hatch (diagonal thin strokes) counting inside regions
  for (const p of raw.paths) {
    if (!p.stroke || p.pts.length !== 2 || p.lw >= MINLW || !isDark(p.sc)) continue;
    const [a, b] = p.pts; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 3 || L > 90) continue;
    const ang = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
    if (ang < 22 || ang > 68) continue;
    line(a[0], a[1], b[0], b[1], 1, 0, (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) { const l = labels[y * W + x]; if (l) regs[l].hatch++; } });
  }
  // heavy boundary ratio (safe rooms are drawn with heavy outlines)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; const m = mask[i];
    if (!(m & 1)) continue;
    const l = labels[i - 1] || labels[i + 1] || labels[i - W] || labels[i + W];
    if (l) { regs[l].bnd++; if (m & 2) regs[l].heavy++; }
  }

  // adjacency between regions across thin solid runs (<=5px)
  log('בונה גרף שכנויות');
  const adj = new Map<number, number>();
  const addAdj = (a: number, b: number) => { if (a === b) return; const k = a < b ? a * N + b : b * N + a; adj.set(k, (adj.get(k) || 0) + 1); };
  const neck = new Map<number, number>();
  const addNeck = (a: number, b: number) => { const k = a < b ? a * N + b : b * N + a; neck.set(k, (neck.get(k) || 0) + 1); };
  const maxRun = Math.ceil(5 / res) + 1;
  for (let y = 0; y < H; y++) {
    let last = 0, run = 0;
    for (let x = 0; x < W; x++) {
      const l = labels[y * W + x];
      if (l) { if (last && run > 0 && run <= maxRun) addAdj(last, l); else if (last && run === 0 && last !== l) { addAdj(last, l); addNeck(last, l); } last = l; run = 0; } else run++;
      if (run > maxRun) last = 0;
    }
  }
  for (let x = 0; x < W; x++) {
    let last = 0, run = 0;
    for (let y = 0; y < H; y++) {
      const l = labels[y * W + x];
      if (l) { if (last && run > 0 && run <= maxRun) addAdj(last, l); else if (last && run === 0 && last !== l) { addAdj(last, l); addNeck(last, l); } last = l; run = 0; } else run++;
      if (run > maxRun) last = 0;
    }
  }
  const nb = new Map<number, Map<number, number>>();
  for (const [k, w] of adj) {
    const a = Math.floor(k / N), b = k % N;
    if (!nb.has(a)) nb.set(a, new Map()); if (!nb.has(b)) nb.set(b, new Map());
    nb.get(a)!.set(b, w); nb.get(b)!.set(a, w);
  }

  const minRoomPx = (0.5 * 10000 / (cmPerPt * cmPerPt)) / (res * res); // 0.5 m2
  const isRoomReg = (r: Reg) => r.id > 0 && !r.cavity && !r.border && r.area >= minRoomPx;
  const exteriorReg = (id: number) => id > 0 && regs[id].border;

  // ---------- opening cells: thick, un-hatched wall-band cells (windows / door frames) ----------
  interface Cell { id: number; ra: number; rb: number }
  const openCells: Cell[] = [];
  for (const r of regs) {
    if (!r.cavity || r.area < 12) continue;
    const meanW = (2 * r.area / Math.max(1, r.per)) * res;
    const lenPt = Math.max(r.x1 - r.x0, r.y1 - r.y0) * res;
    if (meanW < 8.2 || lenPt < 24) continue;
    if (r.hatch / r.area > 0.04) continue;
    if (Math.min((r.x1 - r.x0 + 1) * res, (r.y1 - r.y0 + 1) * res) > 40) continue;
    const ns = nb.get(r.id); if (!ns) continue;
    const list = [...ns.entries()].filter(([n]) => !regs[n].cavity).sort((p, q) => q[1] - p[1]);
    if (!list.length) continue;
    const pick = list.filter(([n]) => isRoomReg(regs[n]) || regs[n].border);
    if (!pick.length) continue;
    openCells.push({ id: r.id, ra: pick[0][0], rb: pick[1] ? pick[1][0] : 0 });
  }

  // ---------- doors -> region edges ----------
  const regAt = (x: number, y: number, rad = 2): number => {
    const cx = Math.round(x * S), cy = Math.round(y * S);
    for (let r = 0; r <= rad; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = cx + i, yy = cy + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const l = labels[yy * W + xx]; if (l) return l;
    }
    return 0;
  };
  const doors: (DoorT & { ra: number; rb: number })[] = [];
  doorsU.forEach((d, i) => {
    const mx = (d.hx + d.ex) / 2, my = (d.hy + d.ey) / 2;
    const ux = (d.ex - d.hx) / d.r, uy = (d.ey - d.hy) / d.r; const nx = -uy, ny = ux;
    const side = (sgn: number) => {
      for (const dist of [6, 9, 13, 18]) { const l = regAt(mx + sgn * nx * dist, my + sgn * ny * dist, 1); if (l && !regs[l].cavity) return l; }
      return 0;
    };
    const ra = side(1), rb = side(-1);
    doors.push({ id: 'd' + i, hx: d.hx, hy: d.hy, ex: d.ex, ey: d.ey, r: d.r, sx: d.sx, sy: d.sy, a: null, b: null, ra, rb });
  });

  // ---------- cores: stairs + elevators ----------
  log('מאתר ליבת בניין (מדרגות ומעליות)');
  const elev = findElevators(raw.paths, cmPerPt);
  // cluster stair runs
  const cores: { x: number; y: number; n: number }[] = [];
  for (const s of stairRuns) {
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
    const c = cores.find(c => Math.hypot(c.x - cx, c.y - cy) < 260 / cmPerPt * 1.0);
    if (c) { c.x = (c.x * c.n + cx) / (c.n + 1); c.y = (c.y * c.n + cy) / (c.n + 1); c.n++; } else cores.push({ x: cx, y: cy, n: 1 });
  }
  const regArea = (id: number) => regs[id].area * res * res * cmPerPt * cmPerPt / 10000; // m2
  const doorGraph = new Map<number, Set<number>>();
  const farEdge = (a: number, b: number) => Math.hypot((regs[a].sx / regs[a].area - regs[b].sx / regs[b].area) * res, (regs[a].sy / regs[a].area - regs[b].sy / regs[b].area) * res) > 560;
  for (const d of doors) {
    if (!d.ra || !d.rb || d.ra === d.rb) continue;
    if (farEdge(d.ra, d.rb)) continue;
    if (!doorGraph.has(d.ra)) doorGraph.set(d.ra, new Set()); if (!doorGraph.has(d.rb)) doorGraph.set(d.rb, new Set());
    doorGraph.get(d.ra)!.add(d.rb); doorGraph.get(d.rb)!.add(d.ra);
  }
  const cellGraph = new Map<number, Set<number>>();
  for (const [k, w] of neck) { const a = Math.floor(k / N), b = k % N; if (w < 3 || !isRoomReg(regs[a]) || !isRoomReg(regs[b]) || farEdge(a, b)) continue; if (!doorGraph.has(a)) doorGraph.set(a, new Set()); if (!doorGraph.has(b)) doorGraph.set(b, new Set()); doorGraph.get(a)!.add(b); doorGraph.get(b)!.add(a); }
  for (const c of openCells) {
    if (!isRoomReg(regs[c.ra]) || !c.rb || !isRoomReg(regs[c.rb]) || c.ra === c.rb) continue;
    if (!cellGraph.has(c.ra)) cellGraph.set(c.ra, new Set()); if (!cellGraph.has(c.rb)) cellGraph.set(c.rb, new Set());
    cellGraph.get(c.ra)!.add(c.rb); cellGraph.get(c.rb)!.add(c.ra);
  }
  // thin partitions (<15cm wall bands) join rooms of the same apartment
  const partGraph = new Map<number, Set<number>>();
  for (const r of regs) {
    if (!r.cavity || r.area < 6) continue;
    const meanW = (2 * r.area / Math.max(1, r.per)) * res;
    if (meanW >= 8.4) continue;
    const ns = nb.get(r.id); if (!ns) continue;
    const list = [...ns.entries()].filter(([n, w]) => !regs[n].cavity && isRoomReg(regs[n]) && w >= 4).map(([n]) => n);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; if (farEdge(a, b)) continue;
      if (!partGraph.has(a)) partGraph.set(a, new Set()); if (!partGraph.has(b)) partGraph.set(b, new Set());
      partGraph.get(a)!.add(b); partGraph.get(b)!.add(a);
    }
  }
  const bridgeAdj = (a: number) => { // weights between room regions through cavities & direct
    const out = new Map<number, number>();
    const na = nb.get(a); if (!na) return out;
    for (const [b, w] of na) {
      if (regs[b].cavity) { const nc = nb.get(b); if (nc) for (const [c, w2] of nc) if (c !== a && !regs[c].cavity) out.set(c, (out.get(c) || 0) + Math.min(w, w2)); }
      else out.set(b, (out.get(b) || 0) + w);
    }
    return out;
  };

  const roomOfRegion = new Map<number, RoomT>();
  const roomRegs = regs.filter(isRoomReg);
  const assign = new Map<number, { bld: number; apt: number | null; role?: string; orphan?: boolean }>();
  interface Bld { cx: number; cy: number; lobby: number; stairs: number }
  const blds: Bld[] = [];
  if (process.env.DBG) { const E: any[] = []; const ce = (a: number, b: number) => { const A = regs[a], B = regs[b]; return [(A.sx / A.area) * res, (A.sy / A.area) * res, (B.sx / B.area) * res, (B.sy / B.area) * res]; }; for (const [a, st] of doorGraph) for (const b of st) if (a < b) E.push([...ce(a, b), 'door']); for (const [a, st] of cellGraph) for (const b of st) if (a < b) E.push([...ce(a, b), 'cell']); for (const [k, w] of neck) { const a = Math.floor(k / N), b = k % N; if (w >= 3) E.push([...ce(a, b), 'neck']); } (globalThis as any).__edges = E; }
  const edgesOf = (r: number) => [...(doorGraph.get(r) || []), ...(cellGraph.get(r) || [])];
  const centerOf = (r: Reg) => [(r.sx / r.area) * res, (r.sy / r.area) * res] as [number, number];
  for (const c of cores) {
    const runs = stairRuns.filter(sr => Math.hypot((sr.x0 + sr.x1) / 2 - c.x, (sr.y0 + sr.y1) / 2 - c.y) < 220);
    if (!runs.length) continue;
    const sb: Rect = [Math.min(...runs.map(r => r.x0)), Math.min(...runs.map(r => r.y0)), Math.max(...runs.map(r => r.x1)), Math.max(...runs.map(r => r.y1))];
    // lobby = the hub region (most connections to other spaces) near the stair block
    let lobby = 0, best = 0;
    for (const r of roomRegs) {
      const [cx, cy] = centerOf(r);
      if (Math.hypot(cx - c.x, cy - c.y) > 450 || regArea(r.id) < 4) continue;
      const nbs = new Set(edgesOf(r.id).filter(n => isRoomReg(regs[n])));
      const score = nbs.size * 1000 + Math.min(999, regArea(r.id));
      if (score > best) { best = score; lobby = r.id; }
    }
    if (!lobby || blds.some(b => b.lobby === lobby)) continue;
    // stairwell: regions inside the stair bbox, plus small neighbours connected to them
    const stairSet = new Set<number>();
    for (const r of roomRegs) { if (r.id === lobby) continue; const [cx, cy] = centerOf(r); if (cx > sb[0] - 4 && cx < sb[2] + 4 && cy > sb[1] - 4 && cy < sb[3] + 4) stairSet.add(r.id); }
    let grew = true; while (grew) { grew = false; for (const id of [...stairSet]) for (const n of edgesOf(id)) { if (stairSet.has(n) || n === lobby || !isRoomReg(regs[n]) || regArea(n) > 12) continue; const [cx, cy] = centerOf(regs[n]); if (Math.hypot(cx - c.x, cy - c.y) > 230) continue; stairSet.add(n); grew = true; } }
    blds.push({ cx: c.x, cy: c.y, lobby, stairs: stairSet.size ? [...stairSet][0] : 0 });
    (blds[blds.length - 1] as any).stairSet = stairSet;
  }
  const apartments: { bld: number; regs: number[] }[] = [];
  const visited = new Set<number>();
  blds.forEach((b, bi) => {
    visited.add(b.lobby); assign.set(b.lobby, { bld: bi, apt: null, role: 'lobby' });
    for (const r of (b as any).stairSet as Set<number>) { visited.add(r); assign.set(r, { bld: bi, apt: null, role: 'stairs' }); }
    // elevator shafts: small regions whose X-diagonals fill the region, next to the lobby
    for (const e of elev) {
      const r = regAt(e.x, e.y, 6);
      if (!r || !isRoomReg(regs[r])) continue;
      const rw = (regs[r].x1 - regs[r].x0 + 1) * res, rh = (regs[r].y1 - regs[r].y0 + 1) * res;
      if (regArea(r) < 9 && e.size > 0.7 * Math.hypot(rw, rh) && Math.hypot(e.x - b.cx, e.y - b.cy) < 700) { assign.set(r, { bld: bi, apt: null, role: 'elevator' }); visited.add(r); }
    }
    const blocked = new Set<number>([b.lobby, ...(((b as any).stairSet as Set<number>) || [])]);
    for (const [r, v] of assign) if (v.bld === bi && (v.role === 'elevator' || v.role === 'stairs' || v.role === 'lobby')) blocked.add(r);
    const lobbyDirect = new Set(edgesOf(b.lobby));
    const lobbyN = new Set(edgesOf(b.lobby));
    for (const [n] of bridgeAdj(b.lobby)) lobbyN.add(n);
    const compOf = new Map<number, number>();
    for (const start of roomRegs) {
      const sid = start.id;
      if (visited.has(sid) || blocked.has(sid) || compOf.has(sid)) continue;
      if (Math.hypot(centerOf(start)[0] - b.cx, centerOf(start)[1] - b.cy) > 1100) continue;
      const comp: number[] = []; const q = [sid]; compOf.set(sid, sid);
      while (q.length) {
        const r = q.pop()!; comp.push(r);
        for (const g of [doorGraph, partGraph]) for (const n of g.get(r) || []) { if (compOf.has(n) || visited.has(n) || blocked.has(n) || !isRoomReg(regs[n])) continue; compOf.set(n, sid); q.push(n); }
      }
      const touches = comp.some(r => lobbyN.has(r));
      const tot = comp.reduce((sum, r) => sum + regArea(r), 0);
      if (!touches || tot < 18) continue;
      for (const r of comp) visited.add(r);
      // several distinct lobby entrances inside one component => split by nearest entrance (graph distance)
      const compSet = new Set(comp);
      const seeds = comp.filter(r => lobbyDirect.has(r) && regArea(r) >= 0.8);
      const clusters: number[][] = [];
      for (const sd of seeds) {
        const c = clusters.find(cl => cl.some(o => { const A = centerOf(regs[o]), B = centerOf(regs[sd]); return Math.hypot(A[0] - B[0], A[1] - B[1]) < 230; }));
        if (c) c.push(sd); else clusters.push([sd]);
      }
      if (clusters.length < 2) { apartments.push({ bld: bi, regs: comp }); continue; }
      const own = new Map<number, number>(); let front: number[] = [];
      clusters.forEach((cl, ci) => cl.forEach(r => { own.set(r, ci); front.push(r); }));
      while (front.length) {
        const nx: number[] = [];
        for (const r of front) for (const g of [doorGraph, partGraph]) for (const n of g.get(r) || []) { if (!compSet.has(n) || own.has(n)) continue; own.set(n, own.get(r)!); nx.push(n); }
        front = nx;
      }
      const parts: number[][] = clusters.map(() => []);
      for (const r of comp) parts[own.has(r) ? own.get(r)! : 0].push(r);
      for (const p of parts) { if (p.reduce((sum, r) => sum + regArea(r), 0) >= 12) apartments.push({ bld: bi, regs: p }); else for (const r of p) assign.set(r, { bld: bi, apt: null, role: 'common' }); }
    }
  });
  if (!blds.length) { // fallback: no core -> connected components by doors
    const comps: number[][] = [];
    for (const r of roomRegs) {
      if (visited.has(r.id)) continue;
      const comp: number[] = []; const q = [r.id]; visited.add(r.id);
      while (q.length) { const x = q.pop()!; comp.push(x); for (const n of doorGraph.get(x) || []) if (!visited.has(n) && isRoomReg(regs[n])) { visited.add(n); q.push(n); } }
      comps.push(comp);
    }
    blds.push({ cx: 0, cy: 0, lobby: 0, stairs: 0 });
    for (const c of comps) if (c.length >= 3 || c.reduce((s, r) => s + regArea(r), 0) > 25) apartments.push({ bld: 0, regs: c });
    warnings.push('לא זוהתה ליבת בניין (מדרגות/מעלית) – הדירות זוהו לפי חיבורי דלתות');
  }
  apartments.forEach((a, ai) => a.regs.forEach(r => assign.set(r, { bld: a.bld, apt: ai })));
  // attach orphan regions (balconies, storage, shafts) by shared wall length
  for (const r of roomRegs) {
    if (assign.has(r.id)) continue;
    let best = 0, bw = 0;
    for (const [n, w] of bridgeAdj(r.id)) { const as = assign.get(n); if (as && as.apt !== null && w > bw) { best = n; bw = w; } }
    if (best && bw >= 6 / res) { assign.set(r.id, { ...assign.get(best)!, orphan: true }); continue; }
    // otherwise attach to lobby/common if adjacent
    for (const [n, w] of bridgeAdj(r.id)) { const as = assign.get(n); if (as && w > bw) { best = n; bw = w; } }
    if (best && bw >= 6 / res) assign.set(r.id, { bld: assign.get(best)!.bld, apt: null, role: 'common' });
  }
  // second pass for orphans that only touch other orphans
  for (let pass = 0; pass < 2; pass++) for (const r of roomRegs) {
    if (assign.has(r.id)) continue;
    let best = 0, bw = 0;
    for (const [n, w] of bridgeAdj(r.id)) { if (assign.has(n) && w > bw) { best = n; bw = w; } }
    if (best && bw >= 6 / res) assign.set(r.id, { ...assign.get(best)!, orphan: true });
  }

  // ---------- build rooms ----------
  log('בונה גיאומטריה של חדרים');
  const rooms: RoomT[] = [];
  const rectsOfRegion = (r: Reg): Rect[] => rectsFrom((x, y) => labels[y * W + x] === r.id, r.x0, r.y0, r.x1, r.y1).map(q => [q[0] * res, q[1] * res, (q[2] + 1) * res, (q[3] + 1) * res] as Rect);
  const innerRect = (r: Reg): Rect => {
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    const hist = new Int32Array(w); let best = { a: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) hist[x] = labels[(r.y0 + y) * W + r.x0 + x] === r.id ? hist[x] + 1 : 0;
      const st: number[] = [];
      for (let x = 0; x <= w; x++) {
        const cur = x === w ? 0 : hist[x];
        while (st.length && hist[st[st.length - 1]] >= cur) {
          const hh = hist[st.pop()!]; const left = st.length ? st[st.length - 1] + 1 : 0; const ww = x - left;
          if (hh * ww > best.a) best = { a: hh * ww, x0: left, x1: x - 1, y0: y - hh + 1, y1: y };
        }
        st.push(x);
      }
    }
    return [(r.x0 + best.x0) * res, (r.y0 + best.y0) * res, (r.x0 + best.x1 + 1) * res, (r.y0 + best.y1 + 1) * res];
  };
  const regionRoom = new Map<number, RoomT>();
  roomRegs.forEach((r, i) => {
    const as = assign.get(r.id);
    if (!as) return; // not part of any building
    const rects = rectsOfRegion(r);
    const bbox: Rect = [r.x0 * res, r.y0 * res, (r.x1 + 1) * res, (r.y1 + 1) * res];
    const rm: RoomT = {
      link: as.orphan ? 'bridge' : 'door',
      id: 'r' + r.id, aptId: as.apt === null ? null : 'a' + as.apt, bldId: 'b' + as.bld, name: '', type: as.role || 'other', auto: true,
      rects, bbox, inner: innerRect(r), areaPt2: r.area * res * res, cx: (r.sx / r.area) * res, cy: (r.sy / r.area) * res, region: r.id,
    };
    rooms.push(rm); regionRoom.set(r.id, rm);
  });

  // ---------- apartments & buildings ----------
  const unionBox = (bs: Rect[]): Rect => [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))];
  const aptsOut: AptT[] = [];
  const bldsOut: BldT[] = blds.map((b, i) => ({ id: 'b' + i, name: '', bbox: [0, 0, 1, 1], lobbyId: b.lobby ? 'r' + b.lobby : null, aptIds: [], cores: b.lobby ? [{ x: b.cx, y: b.cy }] : [], walls: [] }));
  apartments.forEach((a, ai) => {
    const rs = rooms.filter(r => r.aptId === 'a' + ai);
    if (!rs.length) return;
    aptsOut.push({ id: 'a' + ai, bldId: 'b' + a.bld, name: '', number: 0, roomIds: rs.map(r => r.id), bbox: unionBox(rs.map(r => r.bbox)) });
  });
  // name buildings: right-to-left, then apartments sorted by reading order in each building
  const bOrder = bldsOut.map((b, i) => ({ b, i, cx: blds[i].cx })).sort((p, q) => q.cx - p.cx);
  bOrder.forEach((o, k) => { o.b.name = bldsOut.length > 1 ? `בניין ${k + 1}` : 'בניין'; });
  for (const b of bldsOut) {
    const as = aptsOut.filter(a => a.bldId === b.id).sort((p, q) => {
      const pc = (p.bbox[0] + p.bbox[2]) / 2, qc = (q.bbox[0] + q.bbox[2]) / 2, py = (p.bbox[1] + p.bbox[3]) / 2, qy = (q.bbox[1] + q.bbox[3]) / 2;
      return Math.abs(py - qy) > 150 ? py - qy : qc - pc;
    });
    as.forEach((a, k) => { a.number = k + 1; a.name = `דירה ${k + 1}`; });
    b.aptIds = as.map(a => a.id);
    const bs = rooms.filter(r => r.bldId === b.id).map(r => r.bbox);
    b.bbox = bs.length ? unionBox(bs) : [0, 0, 1, 1];
  }

  // ---------- doors final ----------
  const doorsOut: DoorT[] = [];
  for (const d of doors) {
    const ra = regionRoom.get(d.ra), rb = regionRoom.get(d.rb);
    if (!ra && !rb) continue;
    const bld = (ra || rb)!.bldId;
    let entrance = false;
    if (ra && rb && ((ra.aptId && !rb.aptId) || (!ra.aptId && rb.aptId))) entrance = true;
    doorsOut.push({ id: d.id, hx: d.hx, hy: d.hy, ex: d.ex, ey: d.ey, r: d.r, sx: d.sx, sy: d.sy, a: ra?.id || null, b: rb?.id || null, bldId: bld, entrance });
  }

  // ---------- openings (kind resolved later from room types) ----------
  log('מזהה חלונות ופתחים');
  const windows: WindowT[] = [];
  const cavityIsWindow = new Set<number>();
  const bldOfPoint = (x: number, y: number) => { for (const b of bldsOut) if (x >= b.bbox[0] - 20 && x <= b.bbox[2] + 20 && y >= b.bbox[1] - 20 && y <= b.bbox[3] + 20) return b.id; return null; };
  let wi = 0;
  for (const c of openCells) {
    const ra = regionRoom.get(c.ra) || null, rb = regionRoom.get(c.rb) || null;
    if (!ra && !rb) continue;
    const r = regs[c.id];
    const bbox: Rect = [r.x0 * res, r.y0 * res, (r.x1 + 1) * res, (r.y1 + 1) * res];
    const bld = bldOfPoint((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2);
    if (!bld) continue;
    cavityIsWindow.add(c.id);
    windows.push({ id: 'w' + wi++, rects: rectsOfRegion(r), bbox, lenPt: Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]), a: ra ? ra.id : null, b: rb ? rb.id : null, bldId: bld });
  }

  // ---------- wall rectangles per building ----------
  log('בונה קירות');
  for (const b of bldsOut) {
    const pad = 36;
    const x0 = Math.max(0, Math.floor((b.bbox[0] - pad) / res)), y0 = Math.max(0, Math.floor((b.bbox[1] - pad) / res));
    const x1 = Math.min(W - 1, Math.ceil((b.bbox[2] + pad) / res)), y1 = Math.min(H - 1, Math.ceil((b.bbox[3] + pad) / res));
    const rs = rectsFrom((x, y) => {
      const i = y * W + x; const m = mask[i];
      if (m & 1) return true;
      const l = labels[i];
      return l > 0 && regs[l].cavity && !cavityIsWindow.has(l);
    }, x0, y0, x1, y1);
    b.walls = rs.map(q => [q[0] * res, q[1] * res, (q[2] + 1) * res, (q[3] + 1) * res] as Rect).filter(q => (q[2] - q[0]) * (q[3] - q[1]) > 1);
  }

  const out: Analysis = {
    version: 1, page: { w: raw.width, h: raw.height }, cmPerPt,
    rooms, apts: aptsOut, blds: bldsOut, doors: doorsOut, windows, warnings,
    meta: { source: opt.source, analyzedAt: new Date().toISOString(), aiUsed: false },
  };
  heuristicNames(out);
  stripRegion(out);
  return out;
}

function stripRegion(a: Analysis) { for (const r of a.rooms) delete r.region; }

// greedy rectangle decomposition of a boolean mask
function rectsFrom(pred: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number): Rect[] {
  const out: Rect[] = [];
  let active = new Map<string, Rect>();
  for (let y = y0; y <= y1; y++) {
    const next = new Map<string, Rect>();
    let x = x0;
    while (x <= x1) {
      if (!pred(x, y)) { x++; continue; }
      let e = x; while (e + 1 <= x1 && pred(e + 1, y)) e++;
      const key = x + ':' + e; const prev = active.get(key);
      if (prev) { prev[3] = y; next.set(key, prev); active.delete(key); } else { const r: Rect = [x, y, e, y]; out.push(r); next.set(key, r); }
      x = e + 1;
    }
    active = next;
  }
  return out;
}

export interface DoorRaw { hx: number; hy: number; ex: number; ey: number; r: number; sx: number; sy: number }
// Doors are drawn as a thin leaf rectangle (open 90deg) plus a (usually dashed) swing arc around the hinge.
export function findDoors(paths: RawPath[], cmPerPt: number): DoorRaw[] {
  const minL = 55 / cmPerPt, maxL = 125 / cmPerPt;
  const leaves: { a: [number, number]; b: [number, number]; L: number }[] = [];
  const pieces: { pts: [number, number][]; cx: number; cy: number }[] = [];
  for (const p of paths) {
    if (!p.stroke) continue;
    const n = p.pts.length;
    if ((p.closed || n === 5) && (n === 4 || n === 5) && p.lw < 0.9) {
      const q = p.pts.slice(0, 4);
      const e = [Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])];
      const long = e[0] >= e[1] ? 0 : 1; const L = e[long], T = e[1 - long];
      if (L >= minL * 0.8 && L <= maxL && T >= 0.5 && T <= 5 && L / T > 6) {
        const a0 = q[long], a1 = q[long + 1], b0 = q[(long + 3) % 4], b1 = q[(long + 2) % 4];
        // short-side midpoints are the two ends of the leaf
        const A: [number, number] = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], B: [number, number] = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
        leaves.push({ a: A, b: B, L });
      }
    } else if (!p.closed && n >= 4 && n <= 24 && p.lw <= 0.9 && (isDark(p.sc) || isGrayish(p.sc))) {
      let sx = 0, sy = 0; for (const q of p.pts) { sx += q[0]; sy += q[1]; }
      pieces.push({ pts: p.pts, cx: sx / n, cy: sy / n });
    }
  }
  const out: DoorRaw[] = [];
  for (const lf of leaves) {
    let best: (DoorRaw & { cnt: number }) | null = null;
    for (const [H, F] of [[lf.a, lf.b], [lf.b, lf.a]] as [number, number][][]) {
      const R = Math.hypot(F[0] - H[0], F[1] - H[1]);
      const fa = Math.atan2(F[1] - H[1], F[0] - H[0]);
      let cnt = 0, pos = 0, neg = 0, maxPos = 0, maxNeg = 0;
      for (const pc of pieces) {
        if (Math.hypot(pc.cx - H[0], pc.cy - H[1]) > R * 1.2) continue;
        let ok = true, lo = 1e9, hi = -1e9;
        for (const q of pc.pts) {
          if (Math.abs(Math.hypot(q[0] - H[0], q[1] - H[1]) - R) > 1.6 + R * 0.03) { ok = false; break; }
          let t = Math.atan2(q[1] - H[1], q[0] - H[0]) - fa; while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI;
          if (t < lo) lo = t; if (t > hi) hi = t;
        }
        if (!ok) continue;
        cnt++;
        const m = Math.abs(lo) > Math.abs(hi) ? lo : hi;
        if (m > 0) { pos++; maxPos = Math.max(maxPos, hi); } else { neg++; maxNeg = Math.min(maxNeg, lo); }
      }
      const sgn = pos >= neg ? 1 : -1; const reach = (sgn > 0 ? maxPos : -maxNeg) * 180 / Math.PI;
      if (cnt < 2 || reach < 50) continue;
      const ca = fa + sgn * Math.PI / 2;
      const d: DoorRaw & { cnt: number } = { hx: H[0], hy: H[1], ex: H[0] + R * Math.cos(ca), ey: H[1] + R * Math.sin(ca), r: R, sx: F[0], sy: F[1], cnt };
      if (!best || cnt > best.cnt) best = d;
    }
    if (best) out.push(best);
  }
  return out;
}

export function findStairs(paths: RawPath[], cmPerPt: number) {
  const segs: { h: { k: number; a: number; b: number }[]; v: { k: number; a: number; b: number }[] } = { h: [], v: [] };
  const minL = 45 / cmPerPt, maxL = 260 / cmPerPt;
  for (const p of paths) {
    if (!p.stroke || p.pts.length !== 2 || p.lw > 0.9 || !isDark(p.sc)) continue;
    const [a, b] = p.pts;
    if (Math.abs(a[1] - b[1]) < 0.3 && Math.abs(a[0] - b[0]) > minL && Math.abs(a[0] - b[0]) < maxL) segs.h.push({ k: a[1], a: Math.min(a[0], b[0]), b: Math.max(a[0], b[0]) });
    else if (Math.abs(a[0] - b[0]) < 0.3 && Math.abs(a[1] - b[1]) > minL && Math.abs(a[1] - b[1]) < maxL) segs.v.push({ k: a[0], a: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]) });
  }
  const lo = 22 / cmPerPt, hi = 36 / cmPerPt;
  const out: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
  for (const ori of ['h', 'v'] as const) {
    const groups = new Map<string, typeof segs.h>();
    for (const s of segs[ori]) { const key = Math.round(s.a / 4) + ':' + Math.round(s.b / 4); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(s); }
    for (const g of groups.values()) {
      g.sort((p, q) => p.k - q.k);
      for (let i = g.length - 1; i > 0; i--) if (Math.abs(g[i].k - g[i - 1].k) < 0.6) g.splice(i, 1);
      let run = [g[0]];
      const flush = () => {
        if (run.length >= 6) {
          const k0 = run[0].k, k1 = run[run.length - 1].k, a = run[0].a, b = run[0].b;
          out.push(ori === 'h' ? { x0: a, x1: b, y0: k0, y1: k1, n: run.length } : { x0: k0, x1: k1, y0: a, y1: b, n: run.length });
        }
      };
      for (let i = 1; i < g.length; i++) {
        const d = g[i].k - run[run.length - 1].k;
        if (d >= lo && d <= hi && (run.length < 2 || Math.abs(d - (run[run.length - 1].k - run[run.length - 2].k)) < 2.5)) run.push(g[i]);
        else { flush(); run = [g[i]]; }
      }
      flush();
    }
  }
  return out;
}

export function findElevators(paths: RawPath[], cmPerPt: number) {
  const diag: { mx: number; my: number; L: number; sg: number }[] = [];
  const minL = 80 / cmPerPt, maxL = 300 / cmPerPt;
  for (const p of paths) {
    if (!p.stroke || p.pts.length !== 2 || !isDark(p.sc)) continue;
    const a = p.pts[0], b = p.pts[1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < minL || L > maxL) continue;
    const ang = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
    if (ang < 20 || ang > 80) continue;
    diag.push({ mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, L, sg: Math.sign(dx * dy) });
  }
  const out: { x: number; y: number; size: number }[] = [];
  for (let i = 0; i < diag.length; i++) for (let j = i + 1; j < diag.length; j++) {
    const p = diag[i], q = diag[j];
    if (p.sg === q.sg || Math.abs(p.mx - q.mx) > 2.5 || Math.abs(p.my - q.my) > 2.5 || Math.abs(p.L - q.L) > 4) continue;
    if (!out.some(o => Math.hypot(o.x - p.mx, o.y - p.my) < 6)) out.push({ x: p.mx, y: p.my, size: p.L });
  }
  return out;
}

// ---------- naming heuristics (used when AI labelling is unavailable, and as a base) ----------
export function heuristicNames(a: Analysis) {
  const m2 = (r: RoomT) => r.areaPt2 * a.cmPerPt * a.cmPerPt / 10000;
  for (const r of a.rooms) { if (!r.auto) continue; if (r.type === 'lobby') r.name = 'לובי קומתי'; else if (r.type === 'stairs') r.name = 'חדר מדרגות'; else if (r.type === 'elevator') r.name = 'מעלית'; }
  const adjacentByDoor = (id: string) => a.doors.filter(d => d.a === id || d.b === id).map(d => (d.a === id ? d.b : d.a)).filter(Boolean) as string[];
  const byId = new Map(a.rooms.map(r => [r.id, r]));
  for (const apt of a.apts) {
    const rs = apt.roomIds.map(i => byId.get(i)!).filter(Boolean).filter(r => r.auto);
    if (!rs.length) continue;
    const sorted = [...rs].sort((p, q) => q.areaPt2 - p.areaPt2);
    const big = sorted[0];
    // living: largest region
    const set = (r: RoomT, type: string, name: string) => { r.type = type; r.name = name; };
    for (const r of rs) {
      const area = m2(r);
      const w = Math.min(r.inner[2] - r.inner[0], r.inner[3] - r.inner[1]) * a.cmPerPt / 100;
      if (r === big && area > 14) set(r, 'living_kitchen', 'סלון / מטבח');
      else if (area < 3.2) set(r, 'wc', 'שירותים');
      else if (area < 6.5 && w < 2.6) set(r, 'bath', 'חדר רחצה');
      else if (area >= 8.5 && area <= 16.5 && r !== big) set(r, 'bedroom', 'חדר שינה');
      else if (area >= 6.5 && area < 8.5) set(r, 'bedroom', 'חדר שינה');
      else if (r !== big && area < 14 && w < 1.7) set(r, 'hall', 'מסדרון');
      else set(r, r === big ? 'living' : 'other', r === big ? 'סלון' : 'חדר');
    }
    // safe room: heavy outlined room is approximated by being the smaller closed bedroom-sized room with thick walls -> left to AI
    // master: largest bedroom adjacent (via door) to a bath
    const beds = rs.filter(r => r.type === 'bedroom').sort((p, q) => q.areaPt2 - p.areaPt2);
    let master: RoomT | undefined;
    for (const b of beds) {
      const ns = adjacentByDoor(b.id).map(i => byId.get(i)!);
      if (ns.some(n => n && (n.type === 'bath' || n.type === 'wc'))) { master = b; break; }
    }
    if (master) { set(master, 'master', 'חדר שינה הורים'); }
    let k = 0; for (const b of rs.filter(r => r.type === 'bedroom')) { k++; b.name = `חדר שינה ${k}`; }
  }
  for (const r of a.rooms) if (r.auto && !r.name) { r.name = 'חלל'; r.type = 'other'; }
}
