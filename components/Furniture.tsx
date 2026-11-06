import type React from 'react';
import type { Item } from '@/lib/plan/furniture';

const S = '#7d7468';
const stroke = { stroke: S, strokeWidth: 0.7, vectorEffect: 'non-scaling-stroke' as const };

function Shape({ it, cm }: { it: Item; cm: number }) {
  const W = it.lw, D = it.ld;
  const rr = Math.min(W, D) * 0.08;
  switch (it.k) {
    case 'bed': return (<g>
      <rect width={W} height={D} rx={rr} fill="#f3efe7" {...stroke} />
      <rect x={W * 0.04} y={D * 0.03} width={W * 0.43} height={D * 0.16} rx={rr} fill="#fff" {...stroke} />
      <rect x={W * 0.53} y={D * 0.03} width={W * 0.43} height={D * 0.16} rx={rr} fill="#fff" {...stroke} />
      <rect x={0} y={D * 0.33} width={W} height={D * 0.67} rx={rr} fill="#9fb7c9" {...stroke} />
      <path d={`M0 ${D * 0.33} L${W} ${D * 0.33}`} stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </g>);
    case 'nightstand': return (<g><rect width={W} height={D} rx={2} fill="#e0cfb6" {...stroke} /><circle cx={W / 2} cy={D / 2} r={Math.min(W, D) * 0.25} fill="#f6e7b0" stroke={S} strokeWidth={0.5} vectorEffect="non-scaling-stroke" /></g>);
    case 'wardrobe': { const n = Math.max(2, Math.round(W / (55 * cm))); return (<g><rect width={W} height={D} fill="#dcc7a6" {...stroke} />{Array.from({ length: n - 1 }, (_, i) => <line key={i} x1={(W / n) * (i + 1)} y1={0} x2={(W / n) * (i + 1)} y2={D} stroke={S} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)}<line x1={0} y1={D} x2={W} y2={D} stroke="#b59a6e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /></g>); }
    case 'desk': return (<g><rect width={W} height={D} fill="#e0cfb6" {...stroke} /><rect x={W * 0.3} y={D * 0.25} width={W * 0.4} height={D * 0.1} fill="#444" /><circle cx={W * 0.5} cy={D + 18 * cm} r={17 * cm} fill="#8c93a0" stroke={S} strokeWidth={0.5} vectorEffect="non-scaling-stroke" /></g>);
    case 'sofa': return (<g>
      <rect width={W} height={D} rx={rr * 2} fill="#b8c2c9" {...stroke} />
      <rect x={D * 0.12} y={D * 0.1} width={W - D * 0.24} height={D * 0.3} rx={rr} fill="#a3afb8" {...stroke} />
      {[0, 1, 2].map(i => <rect key={i} x={D * 0.12 + ((W - D * 0.24) / 3) * i + 1} y={D * 0.42} width={(W - D * 0.24) / 3 - 2} height={D * 0.5} rx={rr} fill="#cdd5db" {...stroke} />)}
    </g>);
    case 'coffee': return (<g><rect width={W} height={D} rx={rr * 2} fill="#d9bf99" {...stroke} /><circle cx={W / 2} cy={D / 2} r={Math.min(W, D) * 0.18} fill="#fff" opacity="0.7" /></g>);
    case 'tv': return (<g><rect width={W} height={D} fill="#d4c5ad" {...stroke} /><rect x={W * 0.15} y={D * 0.3} width={W * 0.7} height={D * 0.15} fill="#2b2b2b" /></g>);
    case 'dining': {
      const long = Math.max(W, D), vertical = D >= W; const ch = 42 * cm; const n = Math.max(2, Math.round(long / (60 * cm)));
      const chairs: React.ReactElement[] = [];
      for (let i = 0; i < n; i++) {
        const p = (long / n) * (i + 0.5) - ch / 2;
        if (vertical) { chairs.push(<rect key={'a' + i} x={-ch * 0.75} y={p} width={ch} height={ch} rx={ch * 0.25} fill="#c9b79c" {...stroke} />, <rect key={'b' + i} x={W - ch * 0.25} y={p} width={ch} height={ch} rx={ch * 0.25} fill="#c9b79c" {...stroke} />); }
        else { chairs.push(<rect key={'a' + i} y={-ch * 0.75} x={p} width={ch} height={ch} rx={ch * 0.25} fill="#c9b79c" {...stroke} />, <rect key={'b' + i} y={D - ch * 0.25} x={p} width={ch} height={ch} rx={ch * 0.25} fill="#c9b79c" {...stroke} />); }
      }
      return (<g>{chairs}<rect width={W} height={D} rx={rr} fill="#e4cfa9" {...stroke} /></g>);
    }
    case 'counter': return (<g><rect width={W} height={D} fill="#d7dbde" {...stroke} /><line x1={0} y1={D * 0.75} x2={W} y2={D * 0.75} stroke="#b4bac0" strokeWidth={0.5} vectorEffect="non-scaling-stroke" /></g>);
    case 'sink': return (<g><rect width={W} height={D} rx={2} fill="#eef1f3" {...stroke} /><rect x={W * 0.08} y={D * 0.12} width={W * 0.38} height={D * 0.76} rx={3} fill="#cfe3ee" stroke={S} strokeWidth={0.5} vectorEffect="non-scaling-stroke" /><rect x={W * 0.54} y={D * 0.12} width={W * 0.38} height={D * 0.76} rx={3} fill="#cfe3ee" stroke={S} strokeWidth={0.5} vectorEffect="non-scaling-stroke" /></g>);
    case 'hob': return (<g><rect width={W} height={D} rx={2} fill="#3c3f44" {...stroke} />{[[0.28, 0.3], [0.72, 0.3], [0.28, 0.72], [0.72, 0.72]].map(([a, b], i) => <circle key={i} cx={W * a} cy={D * b} r={Math.min(W, D) * 0.15} fill="none" stroke="#bbb" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)}</g>);
    case 'fridge': return (<g><rect width={W} height={D} rx={2} fill="#e8ecef" {...stroke} /><line x1={0} y1={D * 0.5} x2={W} y2={D * 0.5} stroke={S} strokeWidth={0.6} vectorEffect="non-scaling-stroke" /></g>);
    case 'toilet': return (<g><rect x={W * 0.1} y={0} width={W * 0.8} height={D * 0.3} rx={2} fill="#fff" {...stroke} /><ellipse cx={W / 2} cy={D * 0.62} rx={W * 0.45} ry={D * 0.36} fill="#fff" {...stroke} /></g>);
    case 'basin': case 'vanity': return (<g><rect width={W} height={D} rx={3} fill="#f4f1ec" {...stroke} /><ellipse cx={W / 2} cy={D / 2} rx={W * 0.32} ry={D * 0.3} fill="#dfeef5" stroke={S} strokeWidth={0.5} vectorEffect="non-scaling-stroke" /></g>);
    case 'shower': return (<g><rect width={W} height={D} fill="#dcebf2" {...stroke} /><line x1={0} y1={0} x2={W} y2={D} stroke="#9bb5c2" strokeWidth={0.6} vectorEffect="non-scaling-stroke" /><circle cx={W / 2} cy={D / 2} r={Math.min(W, D) * 0.06} fill="#7c97a6" /></g>);
    case 'bath': return (<g><rect width={W} height={D} rx={5} fill="#fff" {...stroke} /><rect x={W * 0.04} y={D * 0.12} width={W * 0.92} height={D * 0.76} rx={D * 0.35} fill="#d7eaf3" stroke={S} strokeWidth={0.5} vectorEffect="non-scaling-stroke" /></g>);
    case 'washer': return (<g><rect width={W} height={D} rx={2} fill="#eef0f2" {...stroke} /><circle cx={W / 2} cy={D / 2} r={Math.min(W, D) * 0.3} fill="#cfd9df" stroke={S} strokeWidth={0.5} vectorEffect="non-scaling-stroke" /></g>);
    case 'plant': return (<g><circle cx={W / 2} cy={D / 2} r={Math.min(W, D) / 2} fill="#7fae6b" stroke="#4f7d3f" strokeWidth={0.6} vectorEffect="non-scaling-stroke" /><circle cx={W / 2} cy={D / 2} r={Math.min(W, D) / 4} fill="#9cc787" /></g>);
    case 'bistro': return (<g><circle cx={W / 2} cy={D / 2} r={Math.min(W, D) * 0.28} fill="#d8c3a1" {...stroke} /><circle cx={W * 0.12} cy={D / 2} r={W * 0.1} fill="#a8967a" {...stroke} /><circle cx={W * 0.88} cy={D / 2} r={W * 0.1} fill="#a8967a" {...stroke} /></g>);
    case 'shoes': return (<g><rect width={W} height={D} fill="#d4c5ad" {...stroke} /></g>);
    default: return <rect width={W} height={D} fill="#ddd" {...stroke} />;
  }
}

export default function FurnitureSvg({ it, cm }: { it: Item; cm: number }) {
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
  return <g transform={`translate(${cx} ${cy}) rotate(${it.rot}) translate(${-it.lw / 2} ${-it.ld / 2})`}><Shape it={it} cm={cm} /></g>;
}
