const fs=require('fs');
function edit(file, pairs){ let s=fs.readFileSync(file,'utf8'); for(const [a,b] of pairs){ if(!s.includes(a)) throw new Error(file+' missing: '+a.slice(0,90)); s=s.split(a).join(b);} fs.writeFileSync(file,s); }
edit('lib/plan/types.ts',[
["  link?: 'door' | 'bridge';","  excluded?: boolean; // user: not part of the apartment (left out of the area summary)\n  link?: 'door' | 'bridge';"],
["export interface AptT { id: string; bldId: string; name: string; number: number; roomIds: string[]; bbox: Rect }","export interface AptT { id: string; bldId: string; name: string; number: number; roomIds: string[]; bbox: Rect; declared?: { area?: number; balcony?: number } }"],
]);
edit('lib/plan/area.ts',[
["    else if (r.aptId === apt.id) v = t?.counted === false ? OUT : SELF;","    else if (r.aptId === apt.id) v = r.excluded ? OTHER : t?.counted === false ? OUT : SELF;"],
["if (r && !isOutdoor(r.type) && TYPE_BY_ID[r.type]?.counted !== false) t +=","if (r && !r.excluded && !isOutdoor(r.type) && TYPE_BY_ID[r.type]?.counted !== false) t +="],
]);
edit('lib/plan/geom.ts',[
["export interface AptStats { total: number; balcony: number; rooms: number; bedrooms: number; counted: number }\nexport function aptStats(an: Analysis, apt: AptT): AptStats {\n  let total = 0, balcony = 0, beds = 0, living = 0;\n  for (const r of aptRooms(an, apt)) {\n    const t = TYPE_BY_ID[r.type]; const a = roomArea(an, r);\n    if (isOutdoor(r.type)) balcony += a;\n    else if (t?.counted !== false) total += a;",
"export interface AptStats { total: number; net: number; walls: number; balcony: number; rooms: number; bedrooms: number; counted: number; excluded: number }\nexport function aptStats(an: Analysis, apt: AptT): AptStats {\n  let net = 0, balcony = 0, beds = 0, living = 0, excluded = 0;\n  for (const r of aptRooms(an, apt)) {\n    const t = TYPE_BY_ID[r.type]; const a = roomArea(an, r);\n    if (r.excluded) { excluded += a; continue; }\n    if (isOutdoor(r.type)) balcony += a;\n    else if (t?.counted !== false) net += a;"],
["  return { total, balcony, rooms: beds + (living || 1), bedrooms: beds, counted: total };","  const gi = grossArea(an, apt);\n  return { total: gi.gross, net: gi.net || net, walls: gi.gross - (gi.net || net), balcony, rooms: beds + (living || 1), bedrooms: beds, counted: net, excluded };"],
["import { TYPE_BY_ID, isOutdoor, openingKind } from './types';","import { TYPE_BY_ID, isOutdoor, openingKind } from './types';\nimport { grossArea } from './area';"],
["      lines.push(`  ${a.name}: ${st.rooms} חדרים, שטח ${st.total.toFixed(1)} מ\"ר, מרפסות ${st.balcony.toFixed(1)} מ\"ר; `","      lines.push(`  ${a.name}: ${st.rooms} חדרים, שטח דירה (כולל קירות) ${st.total.toFixed(1)} מ\"ר, נטו ${st.net.toFixed(1)} מ\"ר, מרפסות ${st.balcony.toFixed(1)} מ\"ר; `"],
]);
