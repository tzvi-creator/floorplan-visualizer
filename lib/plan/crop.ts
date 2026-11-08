import type { RawPage } from './extract';
import type { Analysis, AptT, Rect, RoomT } from './types';

const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa5a5', '#f032e6', '#9a6324', '#800000', '#808000', '#000075', '#5a5a5a'];

/** SVG of an apartment's area from the original vector page, with numbered colored rooms overlaid (for AI vision). */
export function cropSvg(raw: RawPage, apt: AptT, rooms: RoomT[], widthPx = 1300): { svg: string; width: number; height: number } {
  const pad = 40;
  const x0 = Math.max(0, apt.bbox[0] - pad), y0 = Math.max(0, apt.bbox[1] - pad), x1 = Math.min(raw.width, apt.bbox[2] + pad), y1 = Math.min(raw.height, apt.bbox[3] + pad);
  const w = x1 - x0, h = y1 - y0; const k = widthPx / Math.max(w, h * 0.75);
  const W = Math.round(w * k), H = Math.round(h * k);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0} ${y0} ${w} ${h}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>`;
  for (const p of raw.paths) {
    if (!p.stroke) continue;
    const a = p.pts[0]; if (a[0] < x0 - 80 || a[0] > x1 + 80 || a[1] < y0 - 80 || a[1] > y1 + 80) continue;
    const c = p.sc;
    const dark = c === '#000000' || (c.length === 7 && parseInt(c.slice(1, 3), 16) < 0xc0 && c.slice(1, 3) === c.slice(3, 5));
    if (!dark) continue;
    let d = 'M' + p.pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'); if (p.closed) d += 'Z';
    s += `<path d="${d}" fill="none" stroke="${c === '#000000' ? '#000' : '#888'}" stroke-width="${Math.max(0.4, p.lw)}"/>`;
  }
  rooms.forEach((r, i) => {
    const col = COLORS[i % COLORS.length];
    for (const q of r.rects) s += `<rect x="${q[0]}" y="${q[1]}" width="${q[2] - q[0]}" height="${q[3] - q[1]}" fill="${col}" fill-opacity="0.18"/>`;
    const cx = r.inner[0] + 16, cy = r.inner[1] + 16;
    s += `<circle cx="${cx}" cy="${cy}" r="15" fill="${col}"/><text x="${cx}" y="${cy + 7}" font-size="20" font-weight="bold" text-anchor="middle" fill="#fff" font-family="Arial">${i + 1}</text>`;
  });
  return { svg: s + '</svg>', width: W, height: H };
}

/** Same but built only from the analysis (used when the original page is not available). */
export function analysisSvg(an: Analysis, apt: AptT, rooms: RoomT[], widthPx = 1100) {
  const pad = 30;
  const [x0, y0, x1, y1] = [apt.bbox[0] - pad, apt.bbox[1] - pad, apt.bbox[2] + pad, apt.bbox[3] + pad];
  const w = x1 - x0, h = y1 - y0; const k = widthPx / Math.max(w, h * 0.75);
  const W = Math.round(w * k), H = Math.round(h * k);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0} ${y0} ${w} ${h}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>`;
  const bld = an.blds.find(b => b.id === apt.bldId);
  for (const q of bld?.walls || []) if (q[2] > x0 && q[0] < x1 && q[3] > y0 && q[1] < y1) s += `<rect x="${q[0]}" y="${q[1]}" width="${q[2] - q[0]}" height="${q[3] - q[1]}" fill="#444"/>`;
  rooms.forEach((r, i) => {
    const col = COLORS[i % COLORS.length];
    for (const q of r.rects) s += `<rect x="${q[0]}" y="${q[1]}" width="${q[2] - q[0]}" height="${q[3] - q[1]}" fill="${col}" fill-opacity="0.35"/>`;
    const cx = r.inner[0] + 16, cy = r.inner[1] + 16;
    s += `<circle cx="${cx}" cy="${cy}" r="15" fill="${col}"/><text x="${cx}" y="${cy + 7}" font-size="20" font-weight="bold" text-anchor="middle" fill="#fff" font-family="Arial">${i + 1}</text>`;
  });
  return { svg: s + '</svg>', width: W, height: H };
}

export function roomFacts(an: Analysis, rooms: RoomT[]) {
  return rooms.map((r, i) => {
    const w = (r.inner[2] - r.inner[0]) * an.cmPerPt / 100, h = (r.inner[3] - r.inner[1]) * an.cmPerPt / 100;
    const [a, b] = w >= h ? [w, h] : [h, w];
    return { n: i + 1, id: r.id, areaM2: +(r.areaPt2 * an.cmPerPt * an.cmPerPt / 10000).toFixed(1), dimsM: `${a.toFixed(2)}x${b.toFixed(2)}`, hint: (r.tile || 0) >= 0.05 ? 'רצפת ריצוף מרובע אפור (תבנית משבצות) – כמעט בוודאות מרפסת/שטח חיצוני' : r.link === 'bridge' ? 'מחובר לדירה רק דרך חלון/הזזה (כנראה מרפסת/פיר/חדרון חיצוני)' : 'מחובר בדלת או בפתח פתוח', current: r.name };
  });
}
export type { Rect };

/** the whole page as SVG (for reading the title block / printed scale with AI vision) */
export function pageSvg(raw: RawPage, widthPx = 1600): { svg: string; width: number; height: number } {
  const k = widthPx / raw.width; const W = Math.round(raw.width * k), H = Math.round(raw.height * k);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${raw.width} ${raw.height}"><rect width="${raw.width}" height="${raw.height}" fill="#fff"/>`;
  for (const p of raw.paths) {
    if (!p.stroke) continue; const c = p.sc;
    const dark = c === '#000000' || (c.length === 7 && parseInt(c.slice(1, 3), 16) < 0xc0 && c.slice(1, 3) === c.slice(3, 5));
    if (!dark) continue;
    s += `<path d="M${p.pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L')}${p.closed ? 'Z' : ''}" fill="none" stroke="${c === '#000000' ? '#000' : '#888'}" stroke-width="${Math.max(0.4, p.lw)}"/>`;
  }
  return { svg: s + '</svg>', width: W, height: H };
}
