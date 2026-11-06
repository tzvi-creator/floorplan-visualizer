import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
for (const f of fs.readdirSync('plans').filter(f => f.endsWith('.pdf'))) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync('plans/' + f)), useSystemFonts: true }).promise;
  const D = await extractPage(await doc.getPage(1), pdfjs.OPS);
  const t = Date.now(); const A = analyzePage(D);
  console.log(f, doc.numPages, 'pg', D.width, D.height, 'ms', Date.now() - t, JSON.stringify(A.blds.map(b => b.aptIds.length)), 'rooms', A.rooms.length, 'doors', A.doors.length, 'win', A.windows.length, A.warnings.join(';'));
}
