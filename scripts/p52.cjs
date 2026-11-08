const fs=require('fs');
function edit(file, pairs){ let s=fs.readFileSync(file,'utf8'); for(const [a,b] of pairs){ if(!s.includes(a)) throw new Error(file+' missing: '+a.slice(0,90)); s=s.split(a).join(b);} fs.writeFileSync(file,s); }
edit('lib/plan/types.ts',[["scaleSource?: 'manual' | 'wall-calibrated' | 'page-size'","scaleSource?: 'manual' | 'wall-calibrated' | 'pen-set' | 'door-widths' | 'page-size' | 'dimensions' | 'declared-area'; scaleNote?: string"]]);
edit('lib/plan/analyze.ts',[
["  let cmPerPt = opt.cmPerPt || guessCm; let scaleSource: 'manual' | 'wall-calibrated' | 'page-size' = opt.cmPerPt || opt.scaleDenom ? 'manual' : 'page-size';\n  if (scaleSource === 'page-size') { const c = calibrateByWalls(raw, pen); if (c && Math.abs(c / guessCm - 1) > 0.12) { cmPerPt = c; scaleSource = 'wall-calibrated'; } }",
"  let cmPerPt = opt.cmPerPt || guessCm; let scaleSource: NonNullable<Analysis['meta']['scaleSource']> = opt.cmPerPt || opt.scaleDenom ? 'manual' : 'page-size'; let scaleNote = '';\n  if (scaleSource === 'page-size') { const e = estimateScale(raw, pen, guessCm); if (e) { cmPerPt = e.cm; scaleSource = e.source; scaleNote = e.note; } }"],
["meta: { source: opt.source, analyzedAt: new Date().toISOString(), aiUsed: false, scaleSource },","meta: { source: opt.source, analyzedAt: new Date().toISOString(), aiUsed: false, scaleSource, scaleNote },"],
["export function findDoors(paths: RawPath[], cmPerPt: number, pen = 1, K = 1): DoorRaw[] {\n  const minL = 55 / cmPerPt, maxL = 125 / cmPerPt;","export function findDoors(paths: RawPath[], cmPerPt: number, pen = 1, K = 1, rng?: [number, number]): DoorRaw[] {\n  const minL = rng ? rng[0] : 55 / cmPerPt, maxL = rng ? rng[1] : 125 / cmPerPt;"],
["export function guessScaleDenom",`const KNOWN_PENS: { heavy: number; cm: number }[] = [{ heavy: 1.08, cm: 1.764 }, { heavy: 0.76, cm: 2.51 }];
const STD_DOORS = [60, 70, 75, 80, 85, 90, 95, 100, 105, 110, 120];

/**
 * Scale (cm per PDF point) from evidence inside the drawing, in this order of trust:
 * wall thickness (10/20cm) agreeing with the CAD pen set, then either alone, then standard door widths.
 * The printed "1:50" is NOT used: sheets are often shrunk to fit the paper, so it does not describe the PDF.
 */
export function estimateScale(raw: RawPage, pen: number, guessCm: number): { cm: number; source: NonNullable<Analysis['meta']['scaleSource']>; note: string } | null {
  const wall = calibrateByWalls(raw, pen);
  // CAD pen set
  const cnt = new Map<string, number>();
  for (const p of raw.paths) if (p.stroke && isDark(p.sc)) { const k = p.lw.toFixed(2); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const heavy = [...cnt.entries()].filter(([, n]) => n >= 100).map(([k]) => +k).sort((a, b) => b - a)[0];
  const known = heavy ? KNOWN_PENS.find(k => Math.abs(k.heavy - heavy) < 0.025) : undefined;
  const penCm = known ? known.cm : null;
  // standard door widths
  let doorCm: number | null = null, doorScore = 0;
  const ds = findDoors(raw.paths, 2.5, 1, 1, [10, 95]).map(d => d.r);
  if (ds.length >= 5) {
    let best = 0, bs = -1;
    for (let s = 1.3; s <= 4.8; s += 0.02) {
      let sc = 0; for (const r of ds) { let m = 0; for (const w of STD_DOORS) m = Math.max(m, Math.exp(-(((r * s - w) / (0.045 * w)) ** 2))); sc += m; }
      sc /= ds.length; const prior = penCm || wall || guessCm; sc *= 1 - 0.15 * Math.min(1, Math.abs(Math.log(s / prior)));
      if (sc > bs) { bs = sc; best = s; }
    }
    if (bs > 0.6) { doorCm = best; doorScore = bs; }
  }
  const agree = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a / b - 1) < 0.12;
  if (agree(wall, penCm)) return { cm: (wall! + penCm!) / 2, source: 'wall-calibrated', note: 'עובי קירות (10/20 ס״מ) ועוביי הקווים בתכנית מסכימים' };
  if (agree(wall, doorCm)) return { cm: (wall! + doorCm!) / 2, source: 'wall-calibrated', note: 'עובי קירות ורוחבי דלתות סטנדרטיים מסכימים' };
  if (agree(penCm, doorCm)) return { cm: (penCm! + doorCm!) / 2, source: 'pen-set', note: 'עוביי הקווים ורוחבי הדלתות מסכימים' };
  if (penCm) return { cm: penCm, source: 'pen-set', note: 'לפי עוביי הקווים בתכנית' };
  if (wall) return { cm: wall, source: 'wall-calibrated', note: 'לפי עובי הקירות' };
  if (doorCm && doorScore > 0.7) return { cm: doorCm, source: 'door-widths', note: 'לפי רוחבי דלתות סטנדרטיים' };
  return null;
}

export function guessScaleDenom`],
]);
