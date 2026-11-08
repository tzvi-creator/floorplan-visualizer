import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
for (const id of process.argv.slice(2)) {
  const f = fs.readdirSync('tmp/sales').find(x => x.startsWith(id + ' '))!;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync('tmp/sales/' + f)), useSystemFonts: true }).promise;
  const A = analyzePage(await extractPage(await doc.getPage(1), pdfjs.OPS), {});
  console.log(id, A.rooms.map(r => `${(r.areaPt2 * A.cmPerPt ** 2 / 1e4).toFixed(1)}m2 t${r.tile} ${r.link === 'bridge' ? 'B' : ''}`).join(' | '));
}
