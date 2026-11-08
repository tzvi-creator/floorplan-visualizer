import type { Analysis, Rect, RoomT } from './types';

/** largest axis-aligned rectangle inside a set of rects (2pt grid) */
export function innerFromRects(rects: Rect[]): Rect {
  const g = 2;
  const x0 = Math.min(...rects.map(r => r[0])), y0 = Math.min(...rects.map(r => r[1])), x1 = Math.max(...rects.map(r => r[2])), y1 = Math.max(...rects.map(r => r[3]));
  const W = Math.max(1, Math.ceil((x1 - x0) / g)), H = Math.max(1, Math.ceil((y1 - y0) / g));
  const m = new Uint8Array(W * H);
  for (const r of rects) {
    const a = Math.floor((r[0] - x0) / g), b = Math.ceil((r[2] - x0) / g), c = Math.floor((r[1] - y0) / g), d = Math.ceil((r[3] - y0) / g);
    for (let y = c; y < Math.min(H, d); y++) for (let x = a; x < Math.min(W, b); x++) m[y * W + x] = 1;
  }
  const hist = new Int32Array(W); let best = { a: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) hist[x] = m[y * W + x] ? hist[x] + 1 : 0;
    const st: number[] = [];
    for (let x = 0; x <= W; x++) {
      const cur = x === W ? 0 : hist[x];
      while (st.length && hist[st[st.length - 1]] >= cur) {
        const hh = hist[st.pop()!]; const left = st.length ? st[st.length - 1] + 1 : 0; const ww = x - left;
        if (hh * ww > best.a) best = { a: hh * ww, x0: left, x1: x - 1, y0: y - hh + 1, y1: y };
      }
      st.push(x);
    }
  }
  return [x0 + best.x0 * g, y0 + best.y0 * g, x0 + (best.x1 + 1) * g, y0 + (best.y1 + 1) * g];
}

function refresh(r: RoomT) {
  r.areaPt2 = r.rects.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0);
  r.bbox = [Math.min(...r.rects.map(q => q[0])), Math.min(...r.rects.map(q => q[1])), Math.max(...r.rects.map(q => q[2])), Math.max(...r.rects.map(q => q[3]))];
  r.inner = innerFromRects(r.rects);
  let sx = 0, sy = 0, sa = 0; for (const q of r.rects) { const a = (q[2] - q[0]) * (q[3] - q[1]); sx += (q[0] + q[2]) / 2 * a; sy += (q[1] + q[3]) / 2 * a; sa += a; }
  r.cx = sx / sa; r.cy = sy / sa;
}

/**
 * Split every room that the drawn line crosses completely into two rooms (the line is snapped to horizontal/vertical).
 * A room is crossed "completely" when the line covers its whole extent along the line direction (with a small tolerance).
 */
export function splitByLine(an: Analysis, a: [number, number], b: [number, number]): number {
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const c = horiz ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2;
  const lo = horiz ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = horiz ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
  const tol = 45 / an.cmPerPt, edge = 20 / an.cmPerPt;
  let n = 0;
  let nextId = Math.max(0, ...an.rooms.map(r => +r.id.slice(1) || 0)) + 1;
  for (const r of [...an.rooms]) {
    const bb = r.bbox;
    const [rl, rh, cl, ch] = horiz ? [bb[0], bb[2], bb[1], bb[3]] : [bb[1], bb[3], bb[0], bb[2]];
    if (c <= cl + edge || c >= ch - edge) continue;      // line must pass through the room
    if (rl < lo - tol || rh > hi + tol) continue;        // and cover it completely
    const A: Rect[] = [], B: Rect[] = [];
    for (const q of r.rects) {
      const [q0, q1] = horiz ? [q[1], q[3]] : [q[0], q[2]];
      if (q1 <= c) A.push(q); else if (q0 >= c) B.push(q);
      else if (horiz) { A.push([q[0], q[1], q[2], c]); B.push([q[0], c, q[2], q[3]]); } else { A.push([q[0], q[1], c, q[3]]); B.push([c, q[1], q[2], q[3]]); }
    }
    if (!A.length || !B.length) continue;
    const nr: RoomT = { ...r, id: 'r' + nextId++, rects: B };
    r.rects = A; refresh(r); refresh(nr);
    an.rooms.push(nr); n++;
  }
  return n;
}
