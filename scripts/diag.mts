import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
import { penFactor, calibrateByWalls, findDoors } from '../lib/plan/analyze.ts';
const dir = 'tmp/sales';
const files = fs.readdirSync(dir).filter(f => /^A\d+ /.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
for (const f of files) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(dir + '/' + f)), useSystemFonts: true }).promise;
  const D = await extractPage(await doc.getPage(1), pdfjs.OPS);
  const cnt = new Map<string, number>();
  for (const p of D.paths) if (p.stroke && p.sc === '#000000') { const k = p.lw.toFixed(2); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const widths = [...cnt.entries()].filter(([, n]) => n >= 100).map(([k]) => +k).sort((a, b) => b - a);
  const pen = penFactor(D); const wc = calibrateByWalls(D, pen);
  const pf = 1.764 / (widths[0] / 1.08);
  // doors with pen-derived scale
  const doors = findDoors(D.paths, pf, pen, 1.764 / pf);
  const rs = doors.map(d => d.r).sort((a, b) => a - b);
  const med = rs.length ? rs[rs.length >> 1] : 0;
  console.log(f.split(' ')[0].padEnd(4), 'pens', widths.join(','), 'penEst', pf.toFixed(2), 'wallEst', wc ? wc.toFixed(2) : '-', 'doors', doors.length, 'medR(pt)', med.toFixed(1), 'medR(cm@penEst)', (med * pf).toFixed(0));
}
