'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { extractPage } from '@/lib/plan/extract';
import { analyzePage, guessScaleDenom } from '@/lib/plan/analyze';
import { classifyAll, readDeclared } from '@/lib/plan/clientAi';
import { compact } from '@/lib/plan/classify';
import { buildArt } from '@/lib/plan/art';

const tick = () => new Promise(r => setTimeout(r, 30));

export default function Uploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(1); const [page, setPage] = useState(1);
  const [denom, setDenom] = useState(0); const [useAi, setUseAi] = useState(true);
  const [name, setName] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false); const [stage, setStage] = useState(''); const [pct, setPct] = useState(0); const [err, setErr] = useState('');
  const pdfRef = useRef<any>(null);

  async function pick(f: File) {
    setErr(''); setFile(f); setName(f.name.replace(/\.pdf$/i, ''));
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      pdfRef.current = { doc, pdfjs }; setPages(doc.numPages); setPage(1);
    } catch (e: any) { setErr('לא ניתן לקרוא את קובץ ה-PDF: ' + (e?.message || '')); setFile(null); }
  }

  async function run() {
    if (!file || !pdfRef.current) return;
    setBusy(true); setErr(''); setPct(5);
    try {
      const { doc, pdfjs } = pdfRef.current;
      setStage('קורא את הווקטורים מהתכנית…'); await tick();
      const raw = await extractPage(await doc.getPage(page), pdfjs.OPS);
      if (raw.paths.length < 50) throw new Error('נראה שהעמוד הוא תמונה סרוקה ולא תכנית וקטורית. כרגע נתמכים קובצי PDF וקטוריים בלבד.');
      setPct(25); setStage('מזהה קירות, חדרים, דירות ופתחים…'); await tick();
      const an = analyzePage(raw, { source: file.name, scaleDenom: denom || undefined, onProgress: s => setStage(s) });
      if (!an.apts.length) an.warnings.push('לא זוהו דירות – אפשר לנסות עמוד אחר או קנה מידה אחר');
      setPct(45);
      if (useAi && an.apts.length) {
        setStage('הסוכן מזהה שמות חדרים…');
        await classifyAll(an, raw, (d, t) => { setPct(45 + Math.round((d / t) * 45)); setStage(`הסוכן מזהה שמות חדרים… (${d}/${t})`); });
      }
      if (useAi && an.apts.length === 1) { setStage('קורא את טבלת הפרטים של התכנית לאימות שטחים…'); await readDeclared(an, raw); }
      setStage('שומר…'); setPct(95);
      const r = await fetch('/api/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name || file.name, source: file.name, analysis: compact(an) }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'שמירה נכשלה');
      setStage('שומר את התכנית המקורית להשוואה…');
      for (let i = 0; i < an.blds.length; i++) {
        const b = an.blds[i]; setPct(96 + Math.round((i / an.blds.length) * 3));
        await fetch('/api/plans/' + j.id + '/art', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bldId: b.id, svg: buildArt(raw, b.bbox) }) }).catch(() => {});
      }
      router.push('/plan/' + j.id);
    } catch (e: any) { setErr(e?.message || 'שגיאה בעיבוד'); setBusy(false); setStage(''); }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: 18 }}>טעינת תכנית חדשה</h2>
      {!file && (
        <div className={'dropzone' + (over ? ' over' : '')}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) pick(f); }}>
          <div style={{ fontSize: 34 }}>📐</div>
          <div><b>גררו לכאן קובץ אדריכלות PDF</b><br /><span className="muted">תכנית וקטורית של דירה, קומה או מתחם</span></div>
          <button className="primary" onClick={() => input.current?.click()}>בחירת קובץ</button>
          <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); }} />
        </div>
      )}
      {file && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>שם התכנית</label><input type="text" value={name} onChange={e => setName(e.target.value)} disabled={busy} /></div>
          {pages > 1 && <div className="field"><label>עמוד בקובץ ({pages} עמודים)</label><select value={page} onChange={e => setPage(+e.target.value)} disabled={busy}>{Array.from({ length: pages }, (_, i) => <option key={i} value={i + 1}>עמוד {i + 1}</option>)}</select></div>}
          <div className="field"><label>קנה מידה</label>
            <select value={denom} onChange={e => setDenom(+e.target.value)} disabled={busy}>
              <option value={0}>זיהוי אוטומטי (A0/A1 ← 1:{guessScaleDenom({ w: 4768, h: 3370 })})</option>
              <option value={50}>1:50</option><option value={75}>1:75</option><option value={100}>1:100</option><option value={200}>1:200</option>
            </select></div>
          <label className="row" style={{ alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} disabled={busy} style={{ width: 18, height: 18, accentColor: '#c4501b' }} /> זיהוי שמות חדרים באמצעות AI</label>
        </div>
      )}
      {busy && <div style={{ display: 'grid', gap: 8 }}><div className="progress"><i style={{ width: pct + '%' }} /></div><div className="muted">{stage}</div></div>}
      {err && <div className="err" role="alert">{err}</div>}
      {file && !busy && <div className="row"><button className="primary" onClick={run}>נתח והפוך להדמיה</button><button onClick={() => { setFile(null); pdfRef.current = null; }}>ביטול</button><span className="muted">{file.name} · {(file.size / 1e6).toFixed(1)}MB</span></div>}
    </div>
  );
}
