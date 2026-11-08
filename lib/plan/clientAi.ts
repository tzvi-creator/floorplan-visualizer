import type { Analysis } from './types';
import type { RawPage } from './extract';
import { analysisSvg, cropSvg, roomFacts, pageSvg } from './crop';
import { applyClassification, orderedRooms } from './classify';

export async function svgToPng(svg: string, w: number, h: number): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('svg render failed')); img.src = url; });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function classifyOne(an: Analysis, aptId: string, raw: RawPage | null) {
  const apt = an.apts.find(a => a.id === aptId)!;
  const rooms = orderedRooms(an, aptId);
  if (!rooms.length) return;
  const { svg, width, height } = raw ? cropSvg(raw, apt, rooms) : analysisSvg(an, apt, rooms);
  const png = await svgToPng(svg, width, height);
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch('/api/classify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageDataUrl: png, rooms: roomFacts(an, rooms), aptLabel: apt.name }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { applyClassification(an, rooms.map(x => x.id), j, aptId); return; }
    lastErr = j.error || r.statusText;
    if (r.status === 429 || /rate limit/i.test(lastErr)) await sleep(5000 * (attempt + 1)); else break;
  }
  throw new Error(lastErr);
}

/** classify all apartments with limited concurrency; mutates `an` */
export async function classifyAll(an: Analysis, raw: RawPage | null, onProgress: (done: number, total: number) => void, aptIds?: string[]) {
  const ids = aptIds || an.apts.map(a => a.id);
  let done = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      try { await classifyOne(an, id, raw); } catch { failed++; }
      onProgress(++done, ids.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return failed;
}

/** single-apartment sheets: read the printed area / balcony area from the title block so the result can be verified */
export async function readDeclared(an: Analysis, raw: RawPage): Promise<string> {
  if (an.apts.length !== 1) return '';
  try {
    const { svg, width, height } = pageSvg(raw, 1700);
    const png = await svgToPng(svg, width, height);
    const r = await fetch('/api/titleblock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageDataUrl: png }) });
    const j = await r.json(); if (!r.ok) return '';
    if (j.area || j.balcony) an.apts[0].declared = { area: j.area, balcony: j.balcony };
    if (j.aptNumber) an.apts[0].name = 'דירה ' + j.aptNumber;
    return j.scale ? String(j.scale) : '';
  } catch { return ''; }
}
