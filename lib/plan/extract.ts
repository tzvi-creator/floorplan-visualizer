// Vector + text extraction from a pdf.js page (works in browser and node).
export type Pt = [number, number];
export interface RawPath { pts: Pt[]; closed: boolean; stroke: boolean; fill: boolean; sc: string; fc: string; lw: number }
export interface RawText { s: string; x: number; y: number; h: number; w: number; rot: number }
export interface RawPage { width: number; height: number; paths: RawPath[]; texts: RawText[] }

type M = number[];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const ap = (m: M, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const hex = (args: any[]) => typeof args[0] === 'string' ? args[0] : '#' + [args[0], args[1], args[2]].map(v => (v | 0).toString(16).padStart(2, '0')).join('');

export async function extractPage(page: any, OPS: any): Promise<RawPage> {
  const ops = await page.getOperatorList();
  const vp = page.getViewport({ scale: 1 });
  const base: M = vp.transform;
  let ctm: M = base.slice();
  const stack: any[] = [];
  let stroke = '#000000', fill = '#000000', lw = 1;
  const paths: RawPath[] = [];
  let cur: { pts: Pt[]; closed: boolean }[] | null = null;

  const bez = (out: Pt[], p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
    const n = 8;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  const subpathsOf = (list: any, args: any) => {
    const subs: { pts: Pt[]; closed: boolean }[] = [];
    let sp: { pts: Pt[]; closed: boolean } | null = null;
    let ai = 0;
    const ensure = (x: number, y: number) => { if (!sp) { sp = { pts: [ap(ctm, x, y)], closed: false }; subs.push(sp); } };
    for (const op of list) {
      if (op === OPS.moveTo) { sp = { pts: [ap(ctm, args[ai], args[ai + 1])], closed: false }; subs.push(sp); ai += 2; }
      else if (op === OPS.lineTo) { if (!sp) ensure(args[ai], args[ai + 1]); else sp.pts.push(ap(ctm, args[ai], args[ai + 1])); ai += 2; }
      else if (op === OPS.curveTo) {
        ensure(args[ai], args[ai + 1]);
        const s = sp!; const p0 = s.pts[s.pts.length - 1];
        bez(s.pts, p0, ap(ctm, args[ai], args[ai + 1]), ap(ctm, args[ai + 2], args[ai + 3]), ap(ctm, args[ai + 4], args[ai + 5])); ai += 6;
      }
      else if (op === OPS.curveTo2) {
        ensure(args[ai], args[ai + 1]);
        const s = sp!; const p0 = s.pts[s.pts.length - 1];
        bez(s.pts, p0, p0, ap(ctm, args[ai], args[ai + 1]), ap(ctm, args[ai + 2], args[ai + 3])); ai += 4;
      }
      else if (op === OPS.curveTo3) {
        ensure(args[ai], args[ai + 1]);
        const s = sp!; const p0 = s.pts[s.pts.length - 1];
        const p3 = ap(ctm, args[ai + 2], args[ai + 3]);
        bez(s.pts, p0, ap(ctm, args[ai], args[ai + 1]), p3, p3); ai += 4;
      }
      else if (op === OPS.closePath) { if (sp) (sp as any).closed = true; }
      else if (op === OPS.rectangle) {
        const x = args[ai], y = args[ai + 1], w = args[ai + 2], h = args[ai + 3]; ai += 4;
        sp = { pts: [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x + w, y + h), ap(ctm, x, y + h)], closed: true };
        subs.push(sp);
      }
    }
    return subs;
  };
  const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const emit = (isStroke: boolean, isFill: boolean, closeIt: boolean) => {
    if (!cur) return;
    for (const sp of cur) {
      if (closeIt) sp.closed = true;
      if (sp.pts.length < 2) continue;
      paths.push({ pts: sp.pts, closed: sp.closed, stroke: isStroke, fill: isFill, sc: stroke, fc: fill, lw: lw * scaleOf(ctm) });
    }
    cur = null;
  };
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    switch (fn) {
      case OPS.save: stack.push({ ctm: ctm.slice(), stroke, fill, lw }); break;
      case OPS.restore: { const s = stack.pop(); if (s) { ctm = s.ctm; stroke = s.stroke; fill = s.fill; lw = s.lw; } break; }
      case OPS.transform: ctm = mul(ctm, args); break;
      case OPS.setLineWidth: lw = args[0]; break;
      case OPS.setStrokeRGBColor: stroke = hex(args); break;
      case OPS.setFillRGBColor: fill = hex(args); break;
      case OPS.setStrokeGray: { const v = Math.round(args[0] * 255); stroke = hex([v, v, v]); break; }
      case OPS.setFillGray: { const v = Math.round(args[0] * 255); fill = hex([v, v, v]); break; }
      case OPS.constructPath: {
        // pdfjs 4.x: args = [opsArray, coordsArray, minMax] ; fnArray op is constructPath
        cur = ((cur || []) as { pts: Pt[]; closed: boolean }[]).concat(subpathsOf(args[0], args[1]));
        break;
      }
      case OPS.stroke: emit(true, false, false); break;
      case OPS.closeStroke: emit(true, false, true); break;
      case OPS.fill: case OPS.eoFill: emit(false, true, true); break;
      case OPS.fillStroke: case OPS.eoFillStroke: emit(true, true, false); break;
      case OPS.closeFillStroke: case OPS.closeEOFillStroke: emit(true, true, true); break;
      case OPS.endPath: cur = null; break;
    }
  }
  const tc = await page.getTextContent();
  const texts: RawText[] = [];
  for (const it of tc.items as any[]) {
    if (!it.str || !it.str.trim()) continue;
    const m = mul(base, it.transform);
    texts.push({ s: it.str, x: m[4], y: m[5], h: Math.hypot(m[2], m[3]), w: it.width, rot: Math.atan2(m[1], m[0]) });
  }
  return { width: vp.width, height: vp.height, paths, texts };
}
