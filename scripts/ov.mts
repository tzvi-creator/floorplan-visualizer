import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
const id = process.argv[2]; const f = fs.readdirSync('tmp/sales').find(x => x.startsWith(id + ' '))!;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync('tmp/sales/' + f)), useSystemFonts: true }).promise;
const D = await extractPage(await doc.getPage(1), pdfjs.OPS);
const A = analyzePage(D, {});
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${D.width} ${D.height}"><rect width="100%" height="100%" fill="#fff"/>`;
for (const p of D.paths) { if (!p.stroke) continue; svg += `<path d="M${p.pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L')}${p.closed ? 'Z' : ''}" fill="none" stroke="${p.sc}" stroke-width="${Math.max(0.3, p.lw)}"/>`; }
for (const r of A.rooms) { const col = r.aptId ? (r.type.startsWith('balcony') || (r.tile||0) >= 0.05 ? '#3cb44b' : '#4363d8') : '#f58231'; for (const q of r.rects) svg += `<rect x="${q[0]}" y="${q[1]}" width="${q[2]-q[0]}" height="${q[3]-q[1]}" fill="${col}" fill-opacity="0.35"/>`; svg += `<text x="${r.cx}" y="${r.cy}" font-size="9" text-anchor="middle">${(r.areaPt2*A.cmPerPt**2/1e4).toFixed(0)}${r.link==='bridge'?'b':''}</text>`; }
fs.writeFileSync('tmp/ov.svg', svg + '</svg>');
console.log(A.warnings.join(' | '), 'blds', A.blds.length, 'cores', A.blds[0]?.cores.length);
