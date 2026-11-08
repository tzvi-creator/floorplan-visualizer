const fs=require('fs');
function edit(file, pairs){ let s=fs.readFileSync(file,'utf8'); for(const [a,b] of pairs){ if(!s.includes(a)) throw new Error(file+' missing: '+a.slice(0,90)); s=s.split(a).join(b);} fs.writeFileSync(file,s); }
edit('lib/plan/types.ts',[["  excluded?: boolean;","  tile?: number; // density of gray floor-tile grid lines (outdoor floors such as balconies)\n  excluded?: boolean;"]]);
edit('lib/plan/analyze.ts',[
["interface Reg { id: number;","interface Reg { tile: number; id: number;"],
["const regs: Reg[] = [{ id: 0,","const regs: Reg[] = [{ tile: 0, id: 0,"],
["const r: Reg = { id, area: 0,","const r: Reg = { tile: 0, id, area: 0,"],
["nr.push({ id: k, area: 0,","nr.push({ tile: 0, id: k, area: 0,"],
["  // heavy boundary ratio (safe rooms are drawn with heavy outlines)",`  // gray floor-tile grid (balconies / outdoor floors)
  for (const p of raw.paths) {
    if (!p.stroke || p.pts.length !== 2 || !isGrayish(p.sc) || isDark(p.sc)) continue;
    const [a, b] = p.pts; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 6 * K || L > 150 * K) continue;
    if (Math.abs(a[0] - b[0]) > 0.3 && Math.abs(a[1] - b[1]) > 0.3) continue;
    line(a[0], a[1], b[0], b[1], 1, 0, (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) { const l = labels[y * W + x]; if (l) regs[l].tile++; } });
  }
  // heavy boundary ratio (safe rooms are drawn with heavy outlines)`],
["      region: r.id,\n","      region: r.id, tile: r.area ? Math.round((r.tile / r.area) * 1000) / 1000 : 0,\n"],
]);
