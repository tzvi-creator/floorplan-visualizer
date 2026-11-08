import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync('tmp/A4.pdf')), useSystemFonts: true }).promise;
const D = await extractPage(await doc.getPage(1), pdfjs.OPS);
const V: string[] = [], H: string[] = [];
for (const p of D.paths) {
  if (!p.stroke || p.pts.length !== 2) continue; const [a, b] = p.pts;
  const lw = p.lw.toFixed(2); const col = p.sc === '#000000' ? 'k' : p.sc;
  if (Math.abs(a[0] - b[0]) < 0.15 && a[0] > 215 && a[0] < 470 && Math.max(a[1], b[1]) > 150 && Math.min(a[1], b[1]) < 230 && Math.abs(a[1] - b[1]) > 40) V.push(`x=${a[0].toFixed(1)} y${Math.min(a[1], b[1]).toFixed(0)}-${Math.max(a[1], b[1]).toFixed(0)} lw${lw}${col}`);
  if (Math.abs(a[1] - b[1]) < 0.15 && a[1] > 95 && a[1] < 260 && Math.max(a[0], b[0]) > 300 && Math.min(a[0], b[0]) < 330 && Math.abs(a[0] - b[0]) > 40) H.push(`y=${a[1].toFixed(1)} x${Math.min(a[0], b[0]).toFixed(0)}-${Math.max(a[0], b[0]).toFixed(0)} lw${lw}${col}`);
}
console.log('V', [...new Set(V)].sort().join('\n')); console.log('H', [...new Set(H)].sort().join('\n'));
