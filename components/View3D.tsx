'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Analysis, Rect } from '@/lib/plan/types';
import { TYPE_BY_ID, isOutdoor } from '@/lib/plan/types';
import { scopeData, roomArea, roomDims, fmtDim } from '@/lib/plan/geom';
import { furnish, blockersForRoom } from '@/lib/plan/furniture';
import type { Layers } from '@/lib/plan/layers';

export interface View3DProps {
  an: Analysis; bldId: string; aptId: string | null; wallHeight: number; layers: Layers;
  selectedRoom?: string | null; onRoomClick?: (id: string) => void; snapRef?: React.MutableRefObject<(() => string) | null>;
}

const FURN_H: Record<string, [number, string]> = {
  bed: [0.5, '#a9bfd0'], nightstand: [0.5, '#c9b08a'], wardrobe: [2.0, '#c8b08a'], desk: [0.75, '#c9b08a'], sofa: [0.8, '#8fa3b2'], coffee: [0.4, '#c8a977'], tv: [0.5, '#8b7b66'],
  dining: [0.75, '#c8a977'], counter: [0.9, '#cfd4d8'], sink: [0.92, '#e8eef2'], hob: [0.92, '#33363b'], fridge: [1.8, '#dde3e7'], toilet: [0.4, '#ffffff'], basin: [0.85, '#ffffff'], vanity: [0.85, '#f1ede6'],
  shower: [0.05, '#cfe3ee'], bath: [0.55, '#ffffff'], washer: [0.85, '#e9edf0'], plant: [0.7, '#6fa05c'], bistro: [0.7, '#c8a977'], shoes: [1.0, '#c9b08a'],
};

function textSprite(lines: { t: string; bold?: boolean; color?: string }[], scale: number) {
  const cv = document.createElement('canvas'); const ctx = cv.getContext('2d')!;
  const fs = 44; ctx.font = `700 ${fs}px Heebo, Arial`;
  const w = Math.max(...lines.map(l => ctx.measureText(l.t).width)) + 40; const h = lines.length * (fs + 8) + 24;
  cv.width = Math.ceil(w); cv.height = Math.ceil(h);
  ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 3;
  const r = 18; ctx.beginPath(); ctx.roundRect(2, 2, cv.width - 4, cv.height - 4, r); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  lines.forEach((l, i) => { ctx.font = `${l.bold ? 700 : 500} ${l.bold ? fs : fs - 6}px Heebo, Arial`; ctx.fillStyle = l.color || '#1d2125'; ctx.fillText(l.t, cv.width / 2, 12 + (i + 0.5) * (fs + 8)); });
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(scale * (cv.width / cv.height), scale, 1); sp.renderOrder = 10;
  return sp;
}

export default function View3D(props: View3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ rebuild: () => void } | null>(null);
  const latest = useRef(props); latest.current = props;

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement); renderer.domElement.style.display = 'block';
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#eef0f2');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2 - 0.03;
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9bcc2', 1.05));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun, sun.target);
    let content = new THREE.Group(); scene.add(content);
    let floorMeshes: THREE.Mesh[] = [];
    let lastKey = '';
    const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();

    const disposeGroup = (g: THREE.Object3D) => g.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m: any) => { if (m.map) m.map.dispose(); m.dispose(); }); } });

    function build() {
      const { an, bldId, aptId, wallHeight: H, layers, selectedRoom } = latest.current;
      const sd = scopeData(an, bldId, aptId);
      const s = an.cmPerPt / 100; const cx = (sd.box[0] + sd.box[2]) / 2, cy = (sd.box[1] + sd.box[3]) / 2;
      const X = (x: number) => (x - cx) * s, Z = (y: number) => (y - cy) * s;
      scene.remove(content); disposeGroup(content); content = new THREE.Group(); scene.add(content); floorMeshes = [];
      const wallMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 });
      const edgeMat = new THREE.LineBasicMaterial({ color: '#6c6a64' });
      const box = (q: Rect, y0: number, y1: number) => { const g = new THREE.BoxGeometry((q[2] - q[0]) * s, Math.max(0.001, y1 - y0), (q[3] - q[1]) * s); g.translate(X((q[0] + q[2]) / 2), (y0 + y1) / 2, Z((q[1] + q[3]) / 2)); return g; };
      const wallGeos: THREE.BufferGeometry[] = []; const glassGeos: THREE.BufferGeometry[] = [];

      // ground
      const gw = (sd.box[2] - sd.box[0]) * s + 6, gd = (sd.box[3] - sd.box[1]) * s + 6;
      const ground = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.05, gd), new THREE.MeshStandardMaterial({ color: '#d9dce0', roughness: 1 })); ground.position.y = -0.03; ground.receiveShadow = true; content.add(ground);

      // floors
      const rooms = sd.rooms.filter(r => layers.balconies || !isOutdoor(r.type));
      for (const r of rooms) {
        const col = layers.floors ? (TYPE_BY_ID[r.type]?.color || '#e6e3dc') : '#e9e7e2';
        const sel = selectedRoom === r.id;
        const mat = new THREE.MeshStandardMaterial({ color: sel ? '#f2b48e' : col, roughness: 0.85 });
        const gs = r.rects.map(q => box(q, 0, 0.03));
        const m = new THREE.Mesh(mergeGeometries(gs)!, mat); m.receiveShadow = true; m.userData.roomId = r.id; content.add(m); floorMeshes.push(m);
      }
      // walls
      if (layers.walls) for (const q of sd.walls) wallGeos.push(box(q, 0, H));
      // openings
      const sill = Math.min(0.9, H), head = Math.min(2.1, H);
      if (layers.openings) {
        for (const w of sd.windows) {
          for (const q of w.rects) {
            if (w.kind === 'window') { wallGeos.push(box(q, 0, sill)); glassGeos.push(box(shrink(q, 0.4), sill, head)); }
            else if (w.kind === 'slider') glassGeos.push(box(shrink(q, 0.4), 0, head));
            if (H > 2.1) wallGeos.push(box(q, 2.1, H));
          }
        }
        const doorMat = new THREE.MeshStandardMaterial({ color: '#b98a55', roughness: 0.6 });
        for (const d of sd.doors) {
          const horiz = Math.abs(d.ex - d.hx) >= Math.abs(d.ey - d.hy); const t = 13;
          const q: Rect = horiz ? [Math.min(d.hx, d.ex), (d.hy + d.ey) / 2 - t / 2, Math.max(d.hx, d.ex), (d.hy + d.ey) / 2 + t / 2] : [(d.hx + d.ex) / 2 - t / 2, Math.min(d.hy, d.ey), (d.hx + d.ex) / 2 + t / 2, Math.max(d.hy, d.ey)];
          if (H > 2.1) wallGeos.push(box(q, 2.1, H));
          // open leaf
          const len = Math.hypot(d.sx - d.hx, d.sy - d.hy) * s; const ang = Math.atan2(d.sy - d.hy, d.sx - d.hx);
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(len, Math.min(2.05, H), 0.04), doorMat);
          leaf.position.set(X((d.hx + d.sx) / 2), Math.min(2.05, H) / 2, Z((d.hy + d.sy) / 2)); leaf.rotation.y = -ang; leaf.castShadow = true; content.add(leaf);
        }
        // door frames of 'door' cells keep only the lintel (handled above via windows w.kind==='door')
      }
      if (wallGeos.length) {
        const merged = mergeGeometries(wallGeos)!;
        const wm = new THREE.Mesh(merged, wallMat); wm.castShadow = true; wm.receiveShadow = true; content.add(wm);
        content.add(new THREE.LineSegments(new THREE.EdgesGeometry(merged, 20), edgeMat));
      }
      if (glassGeos.length) { const gm = new THREE.Mesh(mergeGeometries(glassGeos)!, new THREE.MeshPhysicalMaterial({ color: '#8fc6e8', transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0, side: THREE.DoubleSide })); content.add(gm); }

      // furniture
      if (layers.furniture) {
        for (const r of rooms) {
          for (const it of furnish(an, r, blockersForRoom(an, r, sd.doors, sd.windows))) {
            const [h, color] = FURN_H[it.k] || [0.5, '#cccccc'];
            const m = new THREE.Mesh(box([it.x, it.y, it.x + it.w, it.y + it.h], 0.03, 0.03 + h), new THREE.MeshStandardMaterial({ color, roughness: 0.8 })); m.castShadow = true; content.add(m);
          }
        }
      }
      // labels
      const gdim = Math.max(gw, gd); const sc = Math.max(0.35, gdim * 0.035);
      for (const r of rooms) {
        const lines: { t: string; bold?: boolean; color?: string }[] = [];
        if (layers.names && r.name) lines.push({ t: r.name, bold: true });
        if (layers.dims) { const [a, b] = roomDims(an, r); lines.push({ t: `${fmtDim(a)} × ${fmtDim(b)} מ׳`, color: '#4a5056' }); }
        if (layers.areas) lines.push({ t: `${roomArea(an, r).toFixed(1)} מ״ר`, color: '#a63e10' });
        if (!lines.length || roomArea(an, r) < 1.5) continue;
        const sp = textSprite(lines, sc * (0.6 + 0.4 * lines.length / 3)); sp.position.set(X((r.inner[0] + r.inner[2]) / 2), Math.min(H, 2.4) * 0.5 + 0.4, Z((r.inner[1] + r.inner[3]) / 2)); content.add(sp);
      }
      // camera / light fit on scope change
      const key = `${bldId}|${aptId}`;
      const R = Math.max(gw, gd) / 2;
      sun.position.set(R * 0.9, R * 1.6, R * 0.7); sun.target.position.set(0, 0, 0);
      const sc2 = sun.shadow.camera as THREE.OrthographicCamera; sc2.left = -R * 1.2; sc2.right = R * 1.2; sc2.top = R * 1.2; sc2.bottom = -R * 1.2; sc2.far = R * 6; sc2.updateProjectionMatrix(); sun.shadow.bias = -0.0005;
      if (key !== lastKey) {
        lastKey = key; controls.target.set(0, 0.8, 0);
        camera.position.set(R * 0.9, R * 1.35 + 2, R * 1.6); camera.near = 0.1; camera.far = R * 40; camera.updateProjectionMatrix(); controls.update();
      }
    }
    function shrink(q: Rect, f: number): Rect { const w = q[2] - q[0], h = q[3] - q[1]; if (w >= h) { const d = h * f; return [q[0], q[1] + d, q[2], q[3] - d]; } const d = w * f; return [q[0] + d, q[1], q[2] - d, q[3]]; }

    function resize() { const w = el.clientWidth, h = el.clientHeight || 400; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); }; loop();
    api.current = { rebuild: build }; build();

    let down = [0, 0];
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1); ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(floorMeshes, false)[0]; if (hit && latest.current.onRoomClick) latest.current.onRoomClick(hit.object.userData.roomId);
    };
    renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp);
    if (latest.current.snapRef) latest.current.snapRef.current = () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); };

    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp); disposeGroup(content); renderer.dispose(); controls.dispose(); el.innerHTML = ''; api.current = null; if (latest.current.snapRef) latest.current.snapRef.current = null; };
  }, []);

  const { an, bldId, aptId, wallHeight, layers, selectedRoom } = props;
  useEffect(() => { const t = setTimeout(() => api.current?.rebuild(), 30); return () => clearTimeout(t); }, [an, bldId, aptId, wallHeight, layers, selectedRoom]);

  return <div ref={host} style={{ width: '100%', height: '100%', minHeight: 360 }} />;
}
