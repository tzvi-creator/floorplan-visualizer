import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
const f = fs.readdirSync('tmp/sales').find(x => x.startsWith(process.argv[2] + ' '))!;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync('tmp/sales/' + f)), useSystemFonts: true }).promise;
const D = await extractPage(await doc.getPage(1), pdfjs.OPS);
const A = analyzePage(D, {});
const pal = ['#e6194b','#3cb44b','#4363d8','#f58231','#911eb4','#0aa5a5','#f032e6','#9a6324','#808000','#000075','#d4a017','#800000'];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${D.width} ${D.height}"><rect width="${D.width}" height="${D.height}" fill="#fff"/>`;
for (const p of D.paths) { if (!p.stroke) continue; const c = p.sc; if (c !== '#000000' && !/^#(.{2})\1\1$/.test(c)) continue; svg += `<path d="M${p.pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L')}${p.closed ? 'Z' : ''}" fill="none" stroke="${c==='#000000'?'#555':'#aaa'}" stroke-width="${Math.max(0.3, p.lw)}"/>`; }
A.rooms.forEach((r, i) => { const col = pal[i % pal.length]; for (const q of r.rects) svg += `<rect x="${q[0]}" y="${q[1]}" width="${q[2]-q[0]}" height="${q[3]-q[1]}" fill="${col}" fill-opacity="${r.aptId ? 0.4 : 0.15}"/>`; svg += `<text x="${r.cx}" y="${r.cy}" font-size="11" font-weight="700" text-anchor="middle">${r.id.slice(1)}</text>`; });
fs.writeFileSync('tmp/ov.svg', svg + '</svg>');
