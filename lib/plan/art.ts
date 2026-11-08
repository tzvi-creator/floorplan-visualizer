import type { RawPage } from './extract';
import type { Rect } from './types';

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Original vector linework of an area of the page, as a compact SVG fragment (page coordinates). */
export function buildArt(raw: RawPage, bbox: Rect, pad = 40): string {
  const x0 = bbox[0] - pad, y0 = bbox[1] - pad, x1 = bbox[2] + pad, y1 = bbox[3] + pad;
  const groups = new Map<string, string[]>();
  for (const p of raw.paths) {
    if (!p.stroke) continue;
    const c = p.sc;
    if (c === '#ffffff') continue;
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const q of p.pts) { if (q[0] < mnx) mnx = q[0]; if (q[0] > mxx) mxx = q[0]; if (q[1] < mny) mny = q[1]; if (q[1] > mxy) mxy = q[1]; }
    if (mxx < x0 || mnx > x1 || mxy < y0 || mny > y1) continue;
    if (mxx - mnx < 0.25 && mxy - mny < 0.25) continue;
    const col = c === '#000000' ? '#26292e' : /^#([0-9a-f]{2})\1\1$/i.test(c) ? '#8c8f94' : c;
    const lw = Math.min(2, Math.max(0.25, Math.round(p.lw * 4) / 4));
    const key = col + '|' + lw;
    let d = 'M' + p.pts.map(q => r1(q[0]) + ' ' + r1(q[1])).join('L'); if (p.closed) d += 'Z';
    let g = groups.get(key); if (!g) groups.set(key, g = []); g.push(d);
  }
  let out = '';
  for (const [key, ds] of groups) { const [col, lw] = key.split('|'); out += `<path d="${ds.join('')}" fill="none" stroke="${col}" stroke-width="${lw}"/>`; }
  return out;
}

const ONE = /^<path d="[MLZ0-9 .-]*" fill="none" stroke="#[0-9a-fA-F]{3,8}" stroke-width="[0-9.]+"$/;
export function isSafeArt(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > 6_000_000 || (s.length && !s.endsWith('/>'))) return false;
  const parts = s.split('/>'); parts.pop();
  return parts.every(p => ONE.test(p));
}
