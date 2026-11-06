'use client';
import { useEffect, useRef, useState } from 'react';
import type { Rect } from '@/lib/plan/types';

/** pan / zoom container that feeds a viewBox to its child render function */
export default function Viewport({ home, children }: { home: Rect; children: (vb: Rect) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vb, setVb] = useState<Rect>(home);
  const homeKey = home.map(v => Math.round(v)).join(',');
  const touched = useRef(false); const homeRef = useRef(home); homeRef.current = home;
  const drag = useRef<{ x: number; y: number; vb: Rect; moved: boolean } | null>(null);

  const fitAspect = (b: Rect): Rect => {
    const el = ref.current; if (!el) return b;
    const ar = el.clientWidth / Math.max(1, el.clientHeight);
    const w = b[2] - b[0], h = b[3] - b[1]; const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    let nw = w, nh = h; if (w / h < ar) nw = h * ar; else nh = w / ar;
    return [cx - nw / 2, cy - nh / 2, cx + nw / 2, cy + nh / 2];
  };
  useEffect(() => { touched.current = false; setVb(fitAspect(home)); /* eslint-disable-next-line */ }, [homeKey]);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => { if (!touched.current) setVb(fitAspect(homeRef.current)); else setVb(v => fitAspect(v)); }); ro.observe(el); return () => ro.disconnect(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const el = ref.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); touched.current = true;
      const r = el.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const k = Math.exp(e.deltaY * 0.0015);
      setVb(v => { const w = v[2] - v[0], h = v[3] - v[1]; const nw = w * k, nh = h * k; const px = v[0] + fx * w, py = v[1] + fy * h; return [px - fx * nw, py - fy * nh, px + (1 - fx) * nw, py + (1 - fy) * nh]; });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const el = ref.current!; const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; touched.current = true; }
    if (!d.moved) return;
    const sx = (d.vb[2] - d.vb[0]) / el.clientWidth, sy = (d.vb[3] - d.vb[1]) / el.clientHeight;
    setVb([d.vb[0] - dx * sx, d.vb[1] - dy * sy, d.vb[2] - dx * sx, d.vb[3] - dy * sy]);
  };
  const onUp = () => { setTimeout(() => { drag.current = null; }, 0); };

  return (
    <div className="viewport" ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onClickCapture={e => { if (drag.current?.moved) e.stopPropagation(); }} style={{ touchAction: 'none', cursor: drag.current?.moved ? 'grabbing' : 'default' }}>
      {children(vb)}
      <div className="vp-tools">
        <button title="התאמה למסך" onClick={() => { touched.current = false; setVb(fitAspect(home)); }}>⤢</button>
        <button title="הגדל" onClick={() => setVb(v => { const w = v[2] - v[0], h = v[3] - v[1], cx = (v[0] + v[2]) / 2, cy = (v[1] + v[3]) / 2; return [cx - w * 0.35, cy - h * 0.35, cx + w * 0.35, cy + h * 0.35]; })}>＋</button>
        <button title="הקטן" onClick={() => setVb(v => { const w = v[2] - v[0], h = v[3] - v[1], cx = (v[0] + v[2]) / 2, cy = (v[1] + v[3]) / 2; return [cx - w * 0.7, cy - h * 0.7, cx + w * 0.7, cy + h * 0.7]; })}>－</button>
      </div>
    </div>
  );
}
