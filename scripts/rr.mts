import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
const f = fs.readdirSync('tmp/sales').find(x => x.startsWith(process.argv[2] + ' '))!;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync('tmp/sales/' + f)), useSystemFonts: true }).promise;
const A = analyzePage(await extractPage(await doc.getPage(1), pdfjs.OPS), {});
for (const r of A.rooms) { const big = r.rects.reduce((m, q) => Math.max(m, (q[2]-q[0])*(q[3]-q[1])), 0); console.log(r.id, r.aptId, r.type, (r.areaPt2*A.cmPerPt**2/1e4).toFixed(1)+'m2', 'rects', r.rects.length, 'bbox', r.bbox.map(v=>v.toFixed(0)).join(','), 'biggestRect m2', (big*A.cmPerPt**2/1e4).toFixed(1)); }
