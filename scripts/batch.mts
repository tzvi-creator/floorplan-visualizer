import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
import { aptStats } from '../lib/plan/geom.ts';

const dir = process.argv[2] || 'tmp/sales';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const files = fs.readdirSync(dir).filter(f => /^A\d+ /.test(f) && f.endsWith('.pdf')).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
for (const f of files) {
  const id = f.split(' ')[0];
  if (only && !only.has(id)) continue;
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(dir + '/' + f)), useSystemFonts: true }).promise;
    const D = await extractPage(await doc.getPage(1), pdfjs.OPS);
    const t = Date.now();
    const A = analyzePage(D, {});
    const st = A.apts.map(a => aptStats(A, a));
    console.log(id.padEnd(4), `${D.width.toFixed(0)}x${D.height.toFixed(0)}`, 'cm/pt', A.cmPerPt.toFixed(2), A.meta.scaleSource, 'blds', A.blds.length, 'apts', A.apts.length, 'rooms', A.rooms.length, 'net', st.map(s => s.total.toFixed(0)).join('/'), 'bal', st.map(s => s.balcony.toFixed(0)).join('/'), Date.now() - t + 'ms', A.warnings.length ? 'NOCORE' : '');
  } catch (e: any) { console.log(id, 'ERR', e.message); }
}
