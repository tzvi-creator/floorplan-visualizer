import type { Analysis } from './types';
import { TYPE_BY_ID } from './types';

export interface AptClassification { aptNumber?: string; rooms: { n: number; type: string; name: string }[] }

/** Apply an AI result (n = 1-based index in the room list that was sent) to the analysis. */
export function applyClassification(an: Analysis, orderedRoomIds: string[], res: AptClassification, aptId?: string) {
  if (aptId && res.aptNumber) { const apt = an.apts.find(a => a.id === aptId); if (apt) { apt.name = 'דירה ' + res.aptNumber; apt.number = +res.aptNumber; } }
  for (const r of res.rooms) {
    const id = orderedRoomIds[r.n - 1]; if (!id) continue;
    const room = an.rooms.find(x => x.id === id); if (!room || !room.auto) continue;
    if (!TYPE_BY_ID[r.type]) continue;
    let type = r.type, name = r.name || TYPE_BY_ID[r.type].he;
    // rooms reachable only through windows/sliders cannot be bedrooms
    if ((room.tile || 0) >= 0.05 && !TYPE_BY_ID[type]?.outdoor && type !== 'shaft') { type = 'balcony'; name = 'מרפסת'; }
    if (room.link === 'bridge' && ['bedroom', 'master', 'living', 'kitchen', 'living_kitchen', 'bath', 'master_bath', 'wc'].includes(type)) { type = 'balcony'; name = 'מרפסת'; }
    room.type = type; room.name = name;
  }
  an.meta.aiUsed = true;
}

export function orderedRooms(an: Analysis, aptId: string) {
  const apt = an.apts.find(a => a.id === aptId)!;
  return apt.roomIds.map(id => an.rooms.find(r => r.id === id)!).filter(Boolean).sort((p, q) => q.areaPt2 - p.areaPt2);
}

/** round all coordinates to keep stored JSON small */
export function compact(an: Analysis): Analysis {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const rr = (q: number[]) => q.map(r1) as any;
  return {
    ...an,
    cmPerPt: Math.round(an.cmPerPt * 10000) / 10000,
    rooms: an.rooms.map(r => ({ ...r, rects: r.rects.map(rr), bbox: rr(r.bbox), inner: rr(r.inner), areaPt2: Math.round(r.areaPt2), cx: r1(r.cx), cy: r1(r.cy) })),
    apts: an.apts.map(a => ({ ...a, bbox: rr(a.bbox) })),
    blds: an.blds.map(b => ({ ...b, bbox: rr(b.bbox), walls: b.walls.map(rr), cores: b.cores.map(c => ({ x: r1(c.x), y: r1(c.y) })) })),
    doors: an.doors.map(d => ({ ...d, hx: r1(d.hx), hy: r1(d.hy), ex: r1(d.ex), ey: r1(d.ey), r: r1(d.r), sx: r1(d.sx), sy: r1(d.sy) })),
    windows: an.windows.map(w => ({ ...w, rects: w.rects.map(rr), bbox: rr(w.bbox), lenPt: r1(w.lenPt) })),
  };
}
