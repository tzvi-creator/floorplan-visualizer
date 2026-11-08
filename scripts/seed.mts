import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Resvg } from '@resvg/resvg-js';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
import { cropSvg, roomFacts, pageSvg } from '../lib/plan/crop.ts';
import { classifyApartment, aiConfig, readTitleBlock } from '../lib/ai.ts';
import { applyClassification, orderedRooms, compact } from '../lib/plan/classify.ts';
import { db, ensureSchema } from '../lib/db.ts';
import { buildArt } from '../lib/plan/art.ts';

const EXTRA = process.argv[2] ? [{ file: process.argv[2], name: process.argv[3] || process.argv[2], abs: true }] : null;
const SAMPLES: { file: string; name: string; abs?: boolean }[] = EXTRA || [
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
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(s.abs ? s.file : 'plans/' + s.file)), useSystemFonts: true }).promise;
  const raw = await extractPage(await doc.getPage(1), pdfjs.OPS);
  const an = analyzePage(raw, { source: s.file });
  console.log('  buildings', an.blds.map(b => b.aptIds.length), 'rooms', an.rooms.length);
  let ok = 0, fail = 0;
  await pool(an.apts, 4, async apt => {
    const rooms = orderedRooms(an, apt.id);
    const { svg } = cropSvg(raw, apt, rooms);
    const png = new Resvg(svg, { background: '#fff' }).render().asPng();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await classifyApartment({ imageDataUrl: 'data:image/png;base64,' + Buffer.from(png).toString('base64'), rooms: roomFacts(an, rooms), aptLabel: apt.name });
        applyClassification(an, rooms.map(r => r.id), res); ok++; return;
      } catch (e: any) { if (attempt) { fail++; console.log('  AI fail', apt.id, e?.message); } else await new Promise(r => setTimeout(r, 9000)); }
    }
  });
  console.log('  AI ok', ok, 'fail', fail);
  if (an.apts.length === 1) { try { const ps = pageSvg(raw, 1700); const png = new Resvg(ps.svg, { background: '#fff' }).render().asPng(); const tb = await readTitleBlock('data:image/png;base64,' + Buffer.from(png).toString('base64')); if (tb.area || tb.balcony) an.apts[0].declared = { area: tb.area, balcony: tb.balcony }; if (tb.aptNumber) an.apts[0].name = 'דירה ' + tb.aptNumber; console.log('  title block', JSON.stringify(tb)); } catch (e: any) { console.log('  title block failed', e?.message); } }
  const out = compact(an);
  if (s.abs) await db().query('DELETE FROM vz_plans WHERE NOT is_sample AND name=$1', [s.name]);
  if (!s.abs) await db().query('DELETE FROM vz_plans WHERE is_sample AND source_name=$1', [s.file]);
  const r = await db().query('INSERT INTO vz_plans (name, source_name, analysis, settings, is_sample) VALUES ($1,$2,$3,$4,$5) RETURNING id', [s.name, s.abs ? s.file.split(/[\/]/).pop() : s.file, JSON.stringify(out), JSON.stringify({}), !s.abs]);
  for (const b of an.blds) await db().query('INSERT INTO vz_art (plan_id, bld_id, svg) VALUES ($1,$2,$3) ON CONFLICT (plan_id, bld_id) DO UPDATE SET svg=EXCLUDED.svg', [r.rows[0].id, b.id, buildArt(raw, b.bbox)]);
  console.log('  saved', r.rows[0].id, 'bytes', JSON.stringify(out).length);
}
await db().end();
