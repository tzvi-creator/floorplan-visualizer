'use client';
import { useMemo } from 'react';
import type { Analysis, Rect, RoomT } from '@/lib/plan/types';
import { TYPE_BY_ID, isOutdoor } from '@/lib/plan/types';
import { scopeData, roomArea, roomDims, fmtDim } from '@/lib/plan/geom';
import { furnish, blockersForRoom } from '@/lib/plan/furniture';
import type { Layers } from '@/lib/plan/layers';
import FurnitureSvg from './Furniture';

export type Style = 'tech' | 'mkt';
export interface PlanSvgProps {
  an: Analysis; bldId: string; aptId: string | null; layers: Layers; style: Style;
  selectedRoom?: string | null; onRoomClick?: (id: string) => void; viewBox?: Rect; onHover?: (id: string | null) => void;
}

const FLOOR: Record<string, string> = {
  living: 'url(#oak)', living_kitchen: 'url(#oak)', dining: 'url(#oak)', bedroom: 'url(#oak2)', master: 'url(#oak2)', hall: 'url(#oak)', entrance: 'url(#stone)',
  kitchen: 'url(#tileK)', bath: 'url(#tileB)', master_bath: 'url(#tileB)', wc: 'url(#tileB)', safe: 'url(#oak2)', laundry: 'url(#tileK)', storage: 'url(#stone)',
  balcony: 'url(#deck)', balcony_sun: 'url(#deck)', balcony_sukkah: 'url(#deck)', shaft: '#d8d8d8', other: '#ece7de',
};

export function Defs() {
  return (
    <defs>
      <pattern id="oak" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#e9d6b4" />{[0, 1, 2, 3].map(i => <rect key={i} y={i * 11.5} width="46" height="11.5" fill={i % 2 ? '#e3cea9' : '#ecdbbc'} stroke="#d4bd94" strokeWidth="0.4" />)}</pattern>
      <pattern id="oak2" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#dfcba6" />{[0, 1, 2, 3].map(i => <rect key={i} x={i * 11.5} width="11.5" height="46" fill={i % 2 ? '#d8c39d' : '#e2d0ae'} stroke="#c9b189" strokeWidth="0.4" />)}</pattern>
      <pattern id="tileK" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#e8ebee" stroke="#cdd3d8" strokeWidth="0.6" /></pattern>
      <pattern id="tileB" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#d9eeee" stroke="#b7d8d8" strokeWidth="0.5" /></pattern>
      <pattern id="stone" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#e6e1d7" stroke="#d6cfc2" strokeWidth="0.5" /></pattern>
      <pattern id="deck" width="40" height="14" patternUnits="userSpaceOnUse"><rect width="40" height="14" fill="#cfd9b8" stroke="#b6c29a" strokeWidth="0.6" /></pattern>
    </defs>
  );
}

export default function PlanSvg({ an, bldId, aptId, layers, style, selectedRoom, onRoomClick, viewBox, onHover }: PlanSvgProps) {
  const sd = useMemo(() => scopeData(an, bldId, aptId), [an, bldId, aptId]);
  const cm = 1 / an.cmPerPt;
  const mkt = style === 'mkt';
  const rooms = sd.rooms.filter(r => layers.balconies || !isOutdoor(r.type));
  const vb = viewBox || sd.box;
  const font = Math.max(6.5, Math.min(11, (vb[2] - vb[0]) / 55));

  const furn = useMemo(() => {
    if (!layers.furniture) return [];
    return rooms.flatMap(r => furnish(an, r, blockersForRoom(an, r, sd.doors, sd.windows)).map((it, i) => ({ it, key: r.id + i })));
  }, [an, rooms, sd, layers.furniture]);

  const wallFill = mkt ? '#3b4048' : '#2d3138';
  const showFloors = layers.floors;

  return (
    <svg viewBox={`${vb[0]} ${vb[1]} ${vb[2] - vb[0]} ${vb[3] - vb[1]}`} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block', background: mkt ? '#faf8f4' : '#fbfaf7' }} direction="ltr" preserveAspectRatio="xMidYMid meet">
      <Defs />
      {showFloors && rooms.map(r => (
        <g key={r.id} onClick={onRoomClick ? () => onRoomClick(r.id) : undefined} onMouseEnter={onHover ? () => onHover(r.id) : undefined} onMouseLeave={onHover ? () => onHover(null) : undefined} style={{ cursor: onRoomClick ? 'pointer' : undefined }}>
          {r.rects.map((q, i) => <rect key={i} x={q[0]} y={q[1]} width={q[2] - q[0] + 0.4} height={q[3] - q[1] + 0.4} fill={mkt ? (FLOOR[r.type] || '#ece7de') : (TYPE_BY_ID[r.type]?.color || '#e6e3dc')} />)}
        </g>
      ))}
      {!showFloors && onRoomClick && rooms.map(r => <g key={r.id} onClick={() => onRoomClick(r.id)} style={{ cursor: 'pointer' }}>{r.rects.map((q, i) => <rect key={i} x={q[0]} y={q[1]} width={q[2] - q[0]} height={q[3] - q[1]} fill="transparent" />)}</g>)}
      {furn.map(({ it, key }) => <FurnitureSvg key={key} it={it} cm={cm} />)}
      {selectedRoom && rooms.filter(r => r.id === selectedRoom).map(r => <g key="sel" pointerEvents="none">{r.rects.map((q, i) => <rect key={i} x={q[0]} y={q[1]} width={q[2] - q[0]} height={q[3] - q[1]} fill="#c4501b" fillOpacity="0.18" />)}</g>)}
      {layers.walls && <g fill={wallFill} pointerEvents="none">{sd.walls.map((q, i) => <rect key={i} x={q[0]} y={q[1]} width={q[2] - q[0] + 0.3} height={q[3] - q[1] + 0.3} />)}</g>}
      {layers.openings && (
        <g pointerEvents="none">
          {sd.windows.map(w => {
            if (w.kind === 'door') return w.rects.map((q, i) => <rect key={w.id + i} x={q[0]} y={q[1]} width={q[2] - q[0]} height={q[3] - q[1]} fill={mkt ? '#faf8f4' : '#fbfaf7'} stroke="#8a8f96" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />);
            const horiz = (w.bbox[2] - w.bbox[0]) >= (w.bbox[3] - w.bbox[1]);
            const cx = (w.bbox[0] + w.bbox[2]) / 2, cy = (w.bbox[1] + w.bbox[3]) / 2;
            return (<g key={w.id}>
              {w.rects.map((q, i) => <rect key={i} x={q[0]} y={q[1]} width={q[2] - q[0]} height={q[3] - q[1]} fill="#e9f4fb" stroke="#6b7580" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />)}
              {horiz ? <line x1={w.bbox[0]} x2={w.bbox[2]} y1={cy} y2={cy} stroke="#4aa3d6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /> : <line x1={cx} x2={cx} y1={w.bbox[1]} y2={w.bbox[3]} stroke="#4aa3d6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />}
            </g>);
          })}
          {sd.doors.map(d => {
            const cross = (d.ex - d.hx) * (d.sy - d.hy) - (d.ey - d.hy) * (d.sx - d.hx);
            const sweep = cross > 0 ? 1 : 0;
            const arc = `M ${d.hx} ${d.hy} L ${d.ex} ${d.ey} A ${d.r} ${d.r} 0 0 ${sweep} ${d.sx} ${d.sy} Z`;
            return (<g key={d.id}>
              {mkt && <path d={arc} fill="#c4501b" fillOpacity="0.07" stroke="none" />}
              <path d={`M ${d.ex} ${d.ey} A ${d.r} ${d.r} 0 0 ${sweep} ${d.sx} ${d.sy}`} fill="none" stroke={mkt ? '#8a6d4b' : '#6b7580'} strokeWidth="0.7" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              <line x1={d.hx} y1={d.hy} x2={d.sx} y2={d.sy} stroke={mkt ? '#8a5a2b' : '#3d4650'} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
            </g>);
          })}
        </g>
      )}
      {layers.dimlines && <g pointerEvents="none">{rooms.filter(r => roomArea(an, r) > 3 && !isOutdoor(r.type)).map(r => <DimLines key={r.id} an={an} r={r} fs={font * 0.8} />)}</g>}
      {(layers.names || layers.dims || layers.areas) && (
        <g pointerEvents="none" fontFamily="Heebo, Arial, sans-serif" textAnchor="middle" style={{ paintOrder: 'stroke' }} stroke="#fff" strokeWidth={font * 0.28} strokeLinejoin="round">
          {rooms.map(r => <RoomLabel key={r.id} an={an} r={r} layers={layers} fs={font} mkt={mkt} />)}
        </g>
      )}
    </svg>
  );
}

function RoomLabel({ an, r, layers, fs, mkt }: { an: Analysis; r: RoomT; layers: Layers; fs: number; mkt: boolean }) {
  const [a, b] = roomDims(an, r); const area = roomArea(an, r);
  const w = r.inner[2] - r.inner[0], h = r.inner[3] - r.inner[1];
  const small = Math.min(w, h) < fs * 4.5 || area < 1.2;
  const f = small ? fs * 0.75 : fs;
  const lines: { t: string; k: string }[] = [];
  if (layers.names && r.name && !(small && area < 0.9)) lines.push({ t: r.name, k: 'n' });
  if (layers.dims && !small) lines.push({ t: `${fmtDim(a)} × ${fmtDim(b)}`, k: 'd' });
  if (layers.areas && area >= 0.9) lines.push({ t: `${area.toFixed(1)} מ״ר`, k: 'a' });
  if (!lines.length) return null;
  const cx = (r.inner[0] + r.inner[2]) / 2, cy = (r.inner[1] + r.inner[3]) / 2;
  const lh = f * 1.25; const y0 = cy - ((lines.length - 1) * lh) / 2 + f * 0.35;
  return <g>{lines.map((l, i) => <text key={l.k} x={cx} y={y0 + i * lh} fontSize={l.k === 'n' ? f : f * 0.88} fontWeight={l.k === 'n' ? 700 : 500} fill={l.k === 'n' ? '#1d2125' : l.k === 'a' ? (mkt ? '#a63e10' : '#a63e10') : '#4a5056'}>{l.t}</text>)}</g>;
}

function DimLines({ an, r, fs }: { an: Analysis; r: RoomT; fs: number }) {
  const [x0, y0, x1, y1] = r.inner; const g = 4;
  const wm = ((x1 - x0) * an.cmPerPt / 100).toFixed(2), hm = ((y1 - y0) * an.cmPerPt / 100).toFixed(2);
  const c = '#c4501b';
  return (
    <g stroke={c} strokeWidth={0.8} vectorEffect="non-scaling-stroke" fill={c} fontFamily="Heebo, Arial" fontSize={fs}>
      <line x1={x0} y1={y1 - g} x2={x1} y2={y1 - g} /><line x1={x0} y1={y1 - g - 3} x2={x0} y2={y1 - g + 3} /><line x1={x1} y1={y1 - g - 3} x2={x1} y2={y1 - g + 3} />
      <text x={(x0 + x1) / 2} y={y1 - g - 2} textAnchor="middle" stroke="none">{wm}</text>
      <line x1={x0 + g} y1={y0} x2={x0 + g} y2={y1} /><line x1={x0 + g - 3} y1={y0} x2={x0 + g + 3} y2={y0} /><line x1={x0 + g - 3} y1={y1} x2={x0 + g + 3} y2={y1} />
      <text transform={`translate(${x0 + g + fs * 0.9} ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle" stroke="none">{hm}</text>
    </g>
  );
}
