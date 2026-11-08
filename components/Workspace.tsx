'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Analysis, Rect } from '@/lib/plan/types';
import { ROOM_TYPES, TYPE_BY_ID, isOutdoor } from '@/lib/plan/types';
import { aptRooms, aptStats, roomArea, roomDims, fmtDim, planSummary, rebuildApts, scopeData, roomById } from '@/lib/plan/geom';
import { DEFAULT_LAYERS, LAYER_LABELS, LAYER_PRESETS, type Layers, type PlanSettings } from '@/lib/plan/layers';
import { classifyOne, classifyAll } from '@/lib/plan/clientAi';
import { compact } from '@/lib/plan/classify';
import PlanSvg from './PlanSvg';
import Viewport from './Viewport';

const View3D = dynamic(() => import('./View3D'), { ssr: false, loading: () => <div className="muted" style={{ padding: 20 }}>טוען תצוגה תלת־ממדית…</div> });

type ViewKind = '2d' | '3d' | 'mkt';
type Tab = 'tree' | 'layers' | 'edit' | 'agent';
interface Sel { bld: string; apt: string | null; room: string | null }
interface Msg { role: 'user' | 'assistant'; content: string }

export default function Workspace({ id }: { id: string }) {
  const [an, setAn] = useState<Analysis | null>(null);
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<PlanSettings>({});
  const [loadErr, setLoadErr] = useState('');
  const [sel, setSel] = useState<Sel>({ bld: '', apt: null, room: null });
  const [view, setView] = useState<ViewKind>('2d');
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [tab, setTab] = useState<Tab>('tree');
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [printOpen, setPrintOpen] = useState(false); const [snap, setSnap] = useState('');
  const [busy, setBusy] = useState(''); const [toast, setToast] = useState('');
  const [arts, setArts] = useState<Record<string, string>>({});
  const snapRef = useRef<(() => string) | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    fetch('/api/plans/' + id).then(async r => {
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'שגיאה בטעינה');
      const a: Analysis = j.analysis; setAn(a); setName(j.name); setSettings(j.settings || {});
      const b = a.blds.find(x => x.aptIds.length) || a.blds[0];
      if (a.blds.length === 1) setSel({ bld: '*', apt: null, room: null }); else setSel({ bld: b?.id || '', apt: b?.aptIds[0] || null, room: null });
      setTimeout(() => { loaded.current = true; }, 0);
    }).catch(e => setLoadErr(e.message));
  }, [id]);

  // autosave
  useEffect(() => {
    if (!dirty || !an) return;
    const t = setTimeout(async () => {
      setSaving('saving');
      try {
        const r = await fetch('/api/plans/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ analysis: compact(an), settings, name }) });
        if (!r.ok) throw new Error(); setSaving('saved'); setDirty(false);
      } catch { setSaving('error'); }
    }, 1500);
    return () => clearTimeout(t);
  }, [dirty, an, settings, name, id]);

  const mutate = useCallback((fn: (a: Analysis) => void) => {
    setAn(prev => { if (!prev) return prev; const c: Analysis = structuredClone(prev); fn(c); rebuildApts(c); return c; });
    setDirty(true);
  }, []);
  const patchSettings = (p: Partial<PlanSettings>) => { setSettings(s => ({ ...s, ...p })); setDirty(true); };
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };

  const apt = an?.apts.find(a => a.id === sel.apt) || null;
  const room = an && sel.room ? roomById(an, sel.room) : undefined;
  const bld = an?.blds.find(b => b.id === sel.bld) || an?.blds[0];
  const scopeBld = sel.bld === '*' ? '*' : bld?.id || '';

  const home: Rect = useMemo(() => (an && bld ? scopeData(an, scopeBld, apt ? apt.id : null).box : [0, 0, 100, 100]), [an, bld, apt, scopeBld]);
  const wallHeight = settings.wallHeight ?? 2.6;

  const selectApt = (b: string, a: string | null) => setSel({ bld: b, apt: a, room: null });
  const selectRoom = (rid: string) => { if (!an) return; const r = roomById(an, rid); if (!r) return; setSel(s => s.bld === '*' ? { ...s, room: rid } : { bld: r.bldId || s.bld, apt: r.aptId || s.apt, room: rid }); };

  // original linework (underlay) loaded on demand per building
  const needIds = useMemo(() => (!an ? [] : sel.bld === '*' ? an.blds.map(b => b.id) : [bld?.id || '']), [an, sel.bld, bld]);
  useEffect(() => {
    if (!an || !layers.original || view === '3d') return;
    const miss = needIds.filter(i => i && !(i in arts)); if (!miss.length) return;
    fetch('/api/plans/' + id + '/art?bld=' + miss.join(',')).then(r => r.json()).then(j => setArts(a => { const n = { ...a }; for (const i of miss) n[i] = j[i] || ''; return n; })).catch(() => {});
  }, [an, layers.original, view, needIds, arts, id]);
  const art = needIds.map(i => arts[i] || '').join('');
  const hasArt = needIds.some(i => arts[i]);

  useEffect(() => { if (view === 'mkt') setLayers(l => (l.furniture ? l : { ...l, furniture: true })); }, [view]);

  if (loadErr) return <div className="center-card"><div className="card"><div className="err">{loadErr}</div><p><Link href="/">חזרה לרשימת התכניות</Link></p></div></div>;
  if (!an) return <div className="center-card"><div className="muted">טוען תכנית…</div></div>;
  if (!bld) return <div className="center-card"><div className="card"><div>לא זוהו בניינים או דירות בתכנית.</div><p><Link href="/">חזרה</Link></p></div></div>;

  const stats = apt ? aptStats(an, apt) : null;
  const title = settings.title ?? (apt ? `${apt.name}${an.blds.length > 1 ? ' – ' + bld.name : ''}` : sel.bld === '*' ? name : bld.name);
  const subtitle = settings.subtitle ?? name;

  async function openPrint() {
    if (view === '3d' && snapRef.current) setSnap(snapRef.current());
    setPrintOpen(true);
  }
  function doPrint() {
    if (view === '3d' && snapRef.current) setSnap(snapRef.current());
    setTimeout(() => window.print(), 150);
  }
  async function aiApt() {
    if (!apt) return; setBusy('הסוכן מנתח את הדירה…');
    try { await new Promise<void>((res, rej) => { const c: Analysis = structuredClone(an!); classifyOne(c, apt.id, null).then(() => { setAn(c); setDirty(true); res(); }).catch(rej); }); flash('שמות החדרים עודכנו'); } catch (e: any) { flash('שגיאה: ' + (e?.message || '')); }
    setBusy('');
  }
  async function aiAll() {
    setBusy('הסוכן מנתח את כל הדירות…');
    try { const c: Analysis = structuredClone(an!); const f = await classifyAll(c, null, (d, t) => setBusy(`הסוכן מנתח… ${d}/${t}`)); setAn(c); setDirty(true); flash(f ? `הושלם, ${f} דירות נכשלו` : 'שמות החדרים עודכנו'); } catch (e: any) { flash('שגיאה: ' + (e?.message || '')); }
    setBusy('');
  }

  return (
    <>
      <div className="ws app-chrome">
        <div className="ws-top">
          <Link href="/" className="brand" style={{ textDecoration: 'none' }}><i /></Link>
          <div style={{ minWidth: 0 }}><b>{name}</b><div className="muted" style={{ fontSize: 12 }}>{saving === 'saving' ? 'שומר…' : saving === 'saved' ? 'נשמר' : saving === 'error' ? 'שמירה נכשלה' : dirty ? 'יש שינויים' : ' '}</div></div>
          <div className="grow" />
          <div className="seg" role="tablist">
            <button className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')}>תכנית</button>
            <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>תלת־ממד</button>
            <button className={view === 'mkt' ? 'on' : ''} onClick={() => setView('mkt')}>תכנית שיווקית</button>
          </div>
          <button className="primary" onClick={openPrint}>🖨 הדפסה</button>
        </div>

        <aside className="ws-side">
          <div className="tabs">
            {([['tree', 'מבנה'], ['layers', 'שכבות'], ['edit', 'עריכה'], ['agent', 'סוכן']] as [Tab, string][]).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <div className="side-body">
            {tab === 'tree' && <Tree an={an} sel={sel} selectApt={selectApt} selectRoom={selectRoom} />}
            {tab === 'layers' && (
              <div className="checks">
                <div className="chips" style={{ marginBottom: 6 }}>{LAYER_PRESETS.map(p => <button key={p.he} onClick={() => setLayers(p.layers)}>{p.he}</button>)}</div>
                {LAYER_LABELS.map(l => <label key={l.key}><input type="checkbox" checked={layers[l.key]} onChange={e => setLayers({ ...layers, [l.key]: e.target.checked })} />{l.he}</label>)}
                <div className="muted" style={{ fontSize: 13, padding: '6px 6px 0' }}>הכיבוי/הדלקה חל על כל התצוגות וגם על ההדפסה. התכנית המקורית מוצגת בתצוגת ״תכנית״ בלבד.{!hasArt && layers.original ? ' (התכנית המקורית לא שמורה בתכנית זו או שעדיין נטענת)' : ''}</div>
              </div>
            )}
            {tab === 'edit' && <EditPanel an={an} name={name} setName={n => { setName(n); setDirty(true); }} apt={apt} room={room} bldId={bld.id} mutate={mutate} aiApt={aiApt} aiAll={aiAll} busy={busy} selectApt={selectApt} />}
            {tab === 'agent' && <Agent an={an} apt={apt} />}
          </div>
        </aside>

        <main className="ws-main">
          {busy && <div className="banner">{busy}</div>}
          {!busy && !an.meta.aiUsed && <div className="banner">שמות החדרים הוערכו לפי גיאומטריה בלבד. אפשר לעדכן ידנית (לשונית "עריכה") או להפעיל זיהוי AI.</div>}
          {toast && <div className="banner" style={{ background: '#e3f4e8', borderColor: '#9fd2ae', color: '#1d5a35' }}>{toast}</div>}
          {view !== '3d' && (
            <Viewport home={home}>
              {vb => <PlanSvg an={an} bldId={scopeBld} aptId={apt ? apt.id : null} layers={layers} style={view === 'mkt' ? 'mkt' : 'tech'} selectedRoom={sel.room} onRoomClick={selectRoom} viewBox={vb} art={art} />}
            </Viewport>
          )}
          {view === '3d' && (
            <>
              <View3D an={an} bldId={scopeBld} aptId={apt ? apt.id : null} wallHeight={wallHeight} layers={layers} selectedRoom={sel.room} onRoomClick={selectRoom} snapRef={snapRef} />
              <div className="hud"><label htmlFor="wh">גובה קירות</label><input id="wh" type="range" min={0.3} max={3.2} step={0.05} value={wallHeight} onChange={e => patchSettings({ wallHeight: +e.target.value })} /><b style={{ minWidth: 54, fontVariantNumeric: 'tabular-nums' }}>{wallHeight.toFixed(2)} מ׳</b></div>
            </>
          )}
          {layers.summary && stats && apt && (
            <div className="info-card">
              <h3>{apt.name}{an.blds.length > 1 ? ` · ${bld.name}` : ''}</h3>
              <div className="kv"><span>חדרים</span><b>{stats.rooms}</b></div>
              <div className="kv"><span>שטח הדירה (כולל קירות)</span><b>{stats.total.toFixed(1)} מ״ר</b></div>
              <div className="kv muted"><span>מזה נטו (סכום החדרים)</span><b>{stats.net.toFixed(1)} מ״ר</b></div>
              <div className="kv"><span>שטח מרפסות</span><b>{stats.balcony.toFixed(1)} מ״ר</b></div>
              <div className="kv total"><span>סה״כ כולל מרפסות</span><b>{(stats.total + stats.balcony).toFixed(1)} מ״ר</b></div>
              {stats.excluded > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>לא נכלל בסיכום: {stats.excluded.toFixed(1)} מ״ר</div>}
              {apt.declared?.area ? <div style={{ fontSize: 12, marginTop: 4, color: Math.abs(stats.total / apt.declared.area - 1) > 0.04 ? '#b42318' : '#2f7d4f' }}>לפי התכנית: {apt.declared.area} מ״ר ({((stats.total / apt.declared.area - 1) * 100).toFixed(1)}%)</div> : null}
            </div>
          )}
        </main>
      </div>

      {printOpen && <PrintModal an={an} settings={settings} title={title} subtitle={subtitle} apt={apt} patch={patchSettings} onClose={() => setPrintOpen(false)} onPrint={doPrint} />}
      <PrintSheet an={an} bldId={scopeBld} art={art} apt={apt} layers={layers} view={view} settings={settings} title={title} subtitle={subtitle} snap={snap} />
      <style>{`@page { size: A4 ${settings.orientation === 'portrait' ? 'portrait' : 'landscape'}; margin: 10mm; }`}</style>
    </>
  );
}

function Tree({ an, sel, selectApt, selectRoom }: { an: Analysis; sel: Sel; selectApt: (b: string, a: string | null) => void; selectRoom: (r: string) => void }) {
  return (
    <div className="tree">
      <div className={'leaf' + (sel.bld === '*' && !sel.room ? ' sel' : '')} onClick={() => selectApt('*', null)} style={{ fontWeight: 600, marginBottom: 4 }}><span>🗺 כל התכנית (סקירה על גבי המקור)</span><span className="pill">{an.apts.length} דירות</span></div>
      {an.blds.map(b => (
        <details key={b.id} open>
          <summary onClick={() => selectApt(b.id, null)} className={sel.bld === b.id && !sel.apt ? 'sel' : ''}><b>{b.name}</b><span className="pill">{b.aptIds.length} דירות</span></summary>
          <div className="child">
            {b.aptIds.map(aid => {
              const a = an.apts.find(x => x.id === aid)!; const st = aptStats(an, a);
              return (
                <details key={aid} open={sel.apt === aid}>
                  <summary onClick={() => selectApt(b.id, aid)} className={sel.apt === aid && !sel.room ? 'sel' : ''}><span>{a.name}</span><span className="pill">{st.total.toFixed(0)} מ״ר</span></summary>
                  <div className="child">
                    {aptRooms(an, a).sort((p, q) => q.areaPt2 - p.areaPt2).map(r => (
                      <div key={r.id} className={'leaf' + (sel.room === r.id ? ' sel' : '')} onClick={() => selectRoom(r.id)}><span>{r.name || 'חלל'}</span><span className="muted">{roomArea(an, r).toFixed(1)}</span></div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

function EditPanel({ an, name, setName, apt, room, bldId, mutate, aiApt, aiAll, busy, selectApt }: { an: Analysis; name: string; setName: (n: string) => void; apt: Analysis['apts'][number] | null; room?: Analysis['rooms'][number]; bldId: string; mutate: (fn: (a: Analysis) => void) => void; aiApt: () => void; aiAll: () => void; busy: string; selectApt: (b: string, a: string | null) => void }) {
  const denom = Math.round(an.cmPerPt / 0.03528);
  const apts = an.apts.filter(a => a.bldId === bldId);
  return (
    <>
      <div className="field"><label>שם התכנית</label><input type="text" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="muted" style={{ fontSize: 12 }}>בסיס קנה המידה: {({ manual: 'הוזן ידנית', 'wall-calibrated': 'עובי קירות', 'pen-set': 'עוביי קווים', 'door-widths': 'רוחבי דלתות', 'page-size': 'ניחוש לפי גודל הדף (לא מדויק!)', dimensions: 'מידות מודפסות', 'declared-area': 'שטח מוצהר' } as Record<string, string>)[an.meta.scaleSource || 'page-size']}{an.meta.scaleNote ? ' – ' + an.meta.scaleNote : ''}. 1 נק׳ בקובץ = {an.cmPerPt.toFixed(2)} ס״מ.</div>
      <div className="field"><label>קנה מידה (1 : N) – משפיע על כל המידות והשטחים</label>
        <div className="row"><span>1 :</span><input type="number" min={10} max={1000} value={denom} onChange={e => { const n = +e.target.value; if (n >= 10) mutate(a => { a.cmPerPt = n * 0.03528; }); }} /></div></div>
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      {apt && (
        <>
          <div className="field"><label>שם הדירה</label><input type="text" value={apt.name} onChange={e => mutate(a => { const x = a.apts.find(y => y.id === apt.id); if (x) x.name = e.target.value; })} /></div>
          <div className="field"><label>שטח הדירה לפי התכנית (מ״ר) – לאימות וכיול</label><input type="number" step="0.1" value={apt.declared?.area ?? ''} onChange={e => mutate(a => { const x = a.apts.find(y => y.id === apt.id); if (x) x.declared = { ...x.declared, area: e.target.value ? +e.target.value : undefined }; })} /></div>
          <div className="field"><label>שטח מרפסת לפי התכנית (מ״ר)</label><input type="number" step="0.1" value={apt.declared?.balcony ?? ''} onChange={e => mutate(a => { const x = a.apts.find(y => y.id === apt.id); if (x) x.declared = { ...x.declared, balcony: e.target.value ? +e.target.value : undefined }; })} /></div>
          {apt.declared?.area ? <button onClick={() => mutate(a => { const x = a.apts.find(y => y.id === apt.id)!; const cur = aptStats(a, x).total; if (cur > 0 && x.declared?.area) a.cmPerPt = a.cmPerPt * Math.sqrt(x.declared.area / cur); })}>⚖ כייל קנה מידה לפי השטח המוצהר</button> : null}
          <button onClick={aiApt} disabled={!!busy}>✨ זיהוי שמות חדרים בדירה (AI)</button>
        </>
      )}
      <button onClick={aiAll} disabled={!!busy}>✨ זיהוי שמות חדרים בכל הדירות (AI)</button>
      {room ? (
        <>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
          <b>חדר נבחר</b>
          <div className="field"><label>שם החדר</label><input type="text" value={room.name} onChange={e => mutate(a => { const r = a.rooms.find(x => x.id === room.id); if (r) { r.name = e.target.value; r.auto = false; } })} /></div>
          <div className="field"><label>סוג החדר</label>
            <select value={room.type} onChange={e => mutate(a => { const r = a.rooms.find(x => x.id === room.id); if (r) { const t = TYPE_BY_ID[e.target.value]; if (!r.name || Object.values(TYPE_BY_ID).some(x => x.he === r.name)) r.name = t.he; r.type = e.target.value; r.auto = false; } })}>
              {ROOM_TYPES.map(t => <option key={t.id} value={t.id}>{t.he}</option>)}
            </select></div>
          <div className="field"><label>שייך לדירה</label>
            <select value={room.aptId || ''} onChange={e => mutate(a => {
              const r = a.rooms.find(x => x.id === room.id)!;
              if (e.target.value === '__new') { const n = a.apts.length ? Math.max(...a.apts.map(x => +x.id.slice(1) || 0)) + 1 : 0; const b = a.blds.find(x => x.id === r.bldId)!; const num = b.aptIds.length + 1; const id = 'a' + n; a.apts.push({ id, bldId: b.id, name: `דירה ${num}`, number: num, roomIds: [], bbox: r.bbox }); b.aptIds.push(id); r.aptId = id; }
              else r.aptId = e.target.value || null;
              for (const b of a.blds) b.aptIds = a.apts.filter(x => x.bldId === b.id && a.rooms.some(q => q.aptId === x.id)).map(x => x.id);
              a.apts = a.apts.filter(x => a.rooms.some(q => q.aptId === x.id));
            })}>
              <option value="">— שטח משותף (לא שייך לדירה) —</option>
              {apts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="__new">+ דירה חדשה</option>
            </select></div>
          <label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={!!room.excluded} onChange={e => mutate(a => { const r = a.rooms.find(x => x.id === room.id); if (r) r.excluded = e.target.checked; })} style={{ width: 17, height: 17, accentColor: '#c4501b' }} /> שטח שאינו חלק מהדירה (לא נכלל בסיכום השטחים)</label>
          <div className="muted" style={{ fontSize: 13 }}>שטח: {roomArea(an, room).toFixed(2)} מ״ר · {roomDims(an, room).map(fmtDim).join(' × ')} מ׳{isOutdoor(room.type) ? ' · נספר כשטח מרפסת' : ''}</div>
          <button onClick={() => selectApt(bldId, room.aptId)}>סיום עריכת חדר</button>
        </>
      ) : <div className="muted" style={{ fontSize: 13 }}>בחרו חדר בתכנית (או בעץ המבנה) כדי לשנות את שמו, סוגו או שיוכו לדירה. כל שינוי נשמר אוטומטית.</div>}
    </>
  );
}

function Agent({ an, apt }: { an: Analysis; apt: Analysis['apts'][number] | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  const context = useMemo(() => planSummary(an) + (apt ? `\n\nדירה שנבחרה כעת: ${apt.name}` : ''), [an, apt]);
  async function send(t: string) {
    if (!t.trim() || busy) return; const next: Msg[] = [...msgs, { role: 'user', content: t }]; setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await fetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: next, context }) });
      const j = await r.json(); setMsgs([...next, { role: 'assistant', content: r.ok ? j.answer : 'שגיאה: ' + (j.error || '') }]);
    } catch { setMsgs([...next, { role: 'assistant', content: 'שגיאת תקשורת' }]); }
    setBusy(false);
  }
  const chips = ['כמה דירות יש בתכנית?', apt ? `נסח תיאור שיווקי ל${apt.name}` : 'נסח תיאור שיווקי לדירה', 'מהי הדירה הגדולה ביותר?'];
  return (
    <div className="chat">
      <div className="chips">{chips.map(c => <button key={c} onClick={() => send(c)} disabled={busy}>{c}</button>)}</div>
      <div className="msgs">
        {!msgs.length && <div className="muted" style={{ fontSize: 13 }}>שאלו את הסוכן על התכנית, השטחים והחדרים, או בקשו ממנו לנסח תיאור שיווקי.</div>}
        {msgs.map((m, i) => <div key={i} className={'msg ' + (m.role === 'user' ? 'user' : 'bot')}>{m.content}</div>)}
        {busy && <div className="msg bot muted">חושב…</div>}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={e => { e.preventDefault(); send(text); }}><input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="כתבו הודעה לסוכן…" aria-label="הודעה לסוכן" /><button className="primary" disabled={busy || !text.trim()}>שלח</button></form>
    </div>
  );
}

function PrintModal({ an, settings, title, subtitle, apt, patch, onClose, onPrint }: { an: Analysis; settings: PlanSettings; title: string; subtitle: string; apt: Analysis['apts'][number] | null; patch: (p: Partial<PlanSettings>) => void; onClose: () => void; onPrint: () => void }) {
  const [gen, setGen] = useState(false);
  async function genDesc() {
    if (!apt) return; setGen(true);
    try {
      const r = await fetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: `נסח תיאור שיווקי קצר (3-4 משפטים) ל${apt.name}, בעברית, על בסיס החדרים והשטחים בלבד.` }], context: planSummary(an) }) });
      const j = await r.json(); if (r.ok) patch({ description: j.answer });
    } catch { /* ignore */ }
    setGen(false);
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20 }}>הגדרות הדפסה</h2>
        <div className="muted" style={{ fontSize: 13 }}>מודפסת התצוגה הנוכחית (תכנית / תלת־ממד / שיווקית) עם השכבות שהדלקתם.</div>
        <div className="field"><label>כותרת</label><input type="text" value={title} onChange={e => patch({ title: e.target.value })} /></div>
        <div className="field"><label>כותרת משנה</label><input type="text" value={subtitle} onChange={e => patch({ subtitle: e.target.value })} /></div>
        <div className="field"><label>תיאור כללי של הדירה</label><textarea rows={4} value={settings.description ?? ''} onChange={e => patch({ description: e.target.value })} placeholder="תיאור חופשי, או לחצו על ״נסח עם AI״" />
          <div><button onClick={genDesc} disabled={gen || !apt}>{gen ? 'מנסח…' : '✨ נסח עם AI'}</button></div></div>
        <div className="field"><label>הערת שוליים</label><input type="text" value={settings.footer ?? 'התכנית להמחשה בלבד; המידות והשטחים בקירוב ובכפוף למפרט ולהסכם.'} onChange={e => patch({ footer: e.target.value })} /></div>
        <div className="row"><label className="row"><input type="checkbox" checked={settings.showTable !== false} onChange={e => patch({ showTable: e.target.checked })} style={{ accentColor: '#c4501b', width: 17, height: 17 }} /> טבלת שטחים</label>
          <div className="grow" /><select style={{ width: 150 }} value={settings.orientation || 'landscape'} onChange={e => patch({ orientation: e.target.value as any })}><option value="landscape">A4 לרוחב</option><option value="portrait">A4 לאורך</option></select></div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button onClick={onClose}>סגירה</button><button className="primary" onClick={onPrint}>הדפסה / שמירה כ-PDF</button></div>
      </div>
    </div>
  );
}

function PrintSheet({ an, bldId, art, apt, layers, view, settings, title, subtitle, snap }: { an: Analysis; bldId: string; art: string; apt: Analysis['apts'][number] | null; layers: Layers; view: ViewKind; settings: PlanSettings; title: string; subtitle: string; snap: string }) {
  const st = apt ? aptStats(an, apt) : null;
  const rooms = apt ? aptRooms(an, apt).sort((p, q) => q.areaPt2 - p.areaPt2) : [];
  const portrait = settings.orientation === 'portrait';
  return (
    <div className="print-sheet" dir="rtl" style={{ ['--fig-h' as any]: portrait ? '170mm' : '112mm' }}>
      <div className="ps-head"><div><h1>{title}</h1><div className="ps-sub">{subtitle}</div></div>{st && <div style={{ textAlign: 'start' }}><b style={{ fontSize: '16pt' }}>{st.rooms} חדרים</b><div>{st.total.toFixed(1)} מ״ר + מרפסות {st.balcony.toFixed(1)} מ״ר</div></div>}</div>
      <div className="ps-fig">
        {view === '3d' ? (snap ? <img src={snap} alt="הדמיה תלת־ממדית" /> : null) : <PlanSvg an={an} bldId={bldId} aptId={apt ? apt.id : null} layers={layers} style={view === 'mkt' ? 'mkt' : 'tech'} art={art} />}
      </div>
      <div className="ps-cols">
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{settings.description}</div>
        {settings.showTable !== false && st && (
          <table><thead><tr><th>חלל</th><th>מידות (מ׳)</th><th>שטח (מ״ר)</th></tr></thead>
            <tbody>
              {rooms.filter(r => !r.excluded).map(r => <tr key={r.id}><td>{r.name}</td><td>{roomDims(an, r).map(fmtDim).join(' × ')}</td><td>{roomArea(an, r).toFixed(1)}</td></tr>)}
              <tr><td colSpan={2}>נטו (סכום החדרים)</td><td>{st.net.toFixed(1)}</td></tr>
              <tr className="tot"><td colSpan={2}>שטח הדירה (כולל קירות)</td><td>{st.total.toFixed(1)}</td></tr>
              <tr className="tot"><td colSpan={2}>שטח מרפסות</td><td>{st.balcony.toFixed(1)}</td></tr>
            </tbody></table>
        )}
      </div>
      <div className="ps-foot">{settings.footer ?? 'התכנית להמחשה בלבד; המידות והשטחים בקירוב ובכפוף למפרט ולהסכם.'}</div>
    </div>
  );
}
