import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
const [,, f, out, x0, y0, x1, y1] = process.argv;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(f)), useSystemFonts: true }).promise;
const D = await extractPage(await doc.getPage(1), pdfjs.OPS);
const A = analyzePage(D, {});
const X0=+x0,Y0=+y0,X1=+x1,Y1=+y1;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X0} ${Y0} ${X1-X0} ${Y1-Y0}"><rect x="${X0}" y="${Y0}" width="${X1-X0}" height="${Y1-Y0}" fill="#fff"/>`;
for (const p of D.paths) { if (!p.stroke) continue; const a=p.pts[0]; if (a[0]<X0-30||a[0]>X1+30||a[1]<Y0-30||a[1]>Y1+30) continue; svg += `<path d="M${p.pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L')}${p.closed ? 'Z' : ''}" fill="none" stroke="${p.sc}" stroke-width="${Math.max(0.3, p.lw)}"/>`; }
for (const r of A.rooms) { for (const q of r.rects) svg += `<rect x="${q[0]}" y="${q[1]}" width="${q[2]-q[0]}" height="${q[3]-q[1]}" fill="#3cb44b" fill-opacity="0.25"/>`; svg += `<rect x="${r.inner[0]}" y="${r.inner[1]}" width="${r.inner[2]-r.inner[0]}" height="${r.inner[3]-r.inner[1]}" fill="none" stroke="#e6194b" stroke-width="1.2"/>`; console.log(r.id, 'inner cm', ((r.inner[2]-r.inner[0])*A.cmPerPt).toFixed(0), 'x', ((r.inner[3]-r.inner[1])*A.cmPerPt).toFixed(0), 'cx', r.cx.toFixed(0), r.cy.toFixed(0)); }
for (const w of A.windows) for (const q of w.rects) svg += `<rect x="${q[0]}" y="${q[1]}" width="${q[2]-q[0]}" height="${q[3]-q[1]}" fill="#0af" fill-opacity="0.5"/>`;
fs.writeFileSync(out, svg + '</svg>');
