// regression: compare computed areas with the areas printed in each sales plan's title block (read with AI)
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Resvg } from '@resvg/resvg-js';
import { extractPage } from '../lib/plan/extract.ts';
import { analyzePage } from '../lib/plan/analyze.ts';
import { pageSvg } from '../lib/plan/crop.ts';
import { readTitleBlock, classifyApartment } from '../lib/ai.ts';
import { cropSvg, roomFacts } from '../lib/plan/crop.ts';
import { applyClassification, orderedRooms } from '../lib/plan/classify.ts';
import { aptStats } from '../lib/plan/geom.ts';
const dir = 'tmp/sales';
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const files = fs.readdirSync(dir).filter(f => /^A\d+ /.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).filter(f => !only || only.has(f.split(' ')[0]));
async function one(f: string) {
  const id = f.split(' ')[0];
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(dir + '/' + f)), useSystemFonts: true }).promise;
  const D = await extractPage(await doc.getPage(1), pdfjs.OPS);
  const A = analyzePage(D, {});
  const { svg } = pageSvg(D, 1700);
  const png = new Resvg(svg, { background: '#fff' }).render().asPng();
  let tb: any = {};
  for (let i = 0; i < 3; i++) { try { tb = await readTitleBlock('data:image/png;base64,' + Buffer.from(png).toString('base64')); break; } catch (e: any) { await new Promise(r => setTimeout(r, 8000)); } }
  if (process.env.AI) for (const apt of A.apts) { const rooms = orderedRooms(A, apt.id); const cs = cropSvg(D, apt, rooms); const png2 = new Resvg(cs.svg, { background: '#fff' }).render().asPng(); for (let i = 0; i < 3; i++) { try { applyClassification(A, rooms.map(r => r.id), await classifyApartment({ imageDataUrl: 'data:image/png;base64,' + Buffer.from(png2).toString('base64'), rooms: roomFacts(A, rooms), aptLabel: apt.name })); break; } catch { await new Promise(r => setTimeout(r, 8000)); } } }
  const st = A.apts.map(a => aptStats(A, a));
  const g = st.reduce((s, x) => s + x.total, 0), b = st.reduce((s, x) => s + x.balcony, 0);
  const ea = tb.area ? ((g / tb.area - 1) * 100).toFixed(0) + '%' : '-', eb = tb.balcony ? ((b / tb.balcony - 1) * 100).toFixed(0) + '%' : '-';
  return `${id.padEnd(4)} scale ${A.cmPerPt.toFixed(2)} ${A.meta.scaleSource?.padEnd(15)} apts ${A.apts.length} | printed area ${tb.area ?? '?'} bal ${tb.balcony ?? '?'} scale ${tb.scale ?? '?'} | ours gross ${g.toFixed(1)} (${ea}) net ${st.reduce((s, x) => s + x.net, 0).toFixed(1)} bal ${b.toFixed(1)} (${eb})`;
}
let i = 0; const out: string[] = [];
await Promise.all([0, 1, 2].map(async () => { while (i < files.length) { const k = i++; try { out[k] = await one(files[k]); } catch (e: any) { out[k] = files[k] + ' ERR ' + e.message; } console.log(out[k]); } }));
