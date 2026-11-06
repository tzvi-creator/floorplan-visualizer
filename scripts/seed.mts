import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Resvg } from '@resvg/resvg-js';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
import { cropSvg, roomFacts } from '../lib/plan/crop.ts';
import { classifyApartment, aiConfig } from '../lib/ai.ts';
import { applyClassification, orderedRooms, compact } from '../lib/plan/classify.ts';
import { db, ensureSchema } from '../lib/db.ts';

const SAMPLES = [
  { file: 'המכבים  68-א.pdf', name: 'המכבים 68 – קומה א׳' },
  { file: 'המכבים  68-ב.pdf', name: 'המכבים 68 – קומה ב׳' },
  { file: 'המכבים  68-ד.pdf', name: 'המכבים 68 – קומה ד׳' },
];

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

await ensureSchema();
console.log('AI:', JSON.stringify({ ...aiConfig(), key: '***' }));
for (const s of SAMPLES) {
  console.log('==', s.name);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync('plans/' + s.file)), useSystemFonts: true }).promise;
  const raw = await extractPage(await doc.getPage(1), pdfjs.OPS);
  const an = analyzePage(raw, { source: s.file });
  console.log('  buildings', an.blds.map(b => b.aptIds.length), 'rooms', an.rooms.length);
  let ok = 0, fail = 0;
  await pool(an.apts, 4, async apt => {
    const rooms = orderedRooms(an, apt.id);
    const { svg } = cropSvg(raw, apt, rooms);
    const png = new Resvg(svg, { background: '#fff' }).render().asPng();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await classifyApartment({ imageDataUrl: 'data:image/png;base64,' + Buffer.from(png).toString('base64'), rooms: roomFacts(an, rooms), aptLabel: apt.name });
        applyClassification(an, rooms.map(r => r.id), res); ok++; return;
      } catch (e: any) { if (attempt) { fail++; console.log('  AI fail', apt.id, e?.message); } }
    }
  });
  console.log('  AI ok', ok, 'fail', fail);
  const out = compact(an);
  await db().query('DELETE FROM vz_plans WHERE is_sample AND source_name=$1', [s.file]);
  const r = await db().query('INSERT INTO vz_plans (name, source_name, analysis, settings, is_sample) VALUES ($1,$2,$3,$4,true) RETURNING id', [s.name, s.file, JSON.stringify(out), JSON.stringify({})]);
  console.log('  saved', r.rows[0].id, 'bytes', JSON.stringify(out).length);
}
await db().end();
