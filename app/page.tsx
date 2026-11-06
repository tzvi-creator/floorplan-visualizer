'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Uploader from '@/components/Uploader';

interface PlanRow { id: string; name: string; source_name: string | null; is_sample: boolean; blds: number; apts: number; rooms: number; created_at: string }

export default function Home() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => fetch('/api/plans').then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'שגיאה'); setPlans(j.plans); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  async function del(id: string, name: string) { if (!confirm(`למחוק את "${name}"?`)) return; await fetch('/api/plans/' + id, { method: 'DELETE' }); load(); }
  async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }
  return (
    <>
      <div className="topbar"><div className="brand"><i /> הדמיית דירה מתכנית</div><div className="grow" /><button className="ghost" onClick={logout}>יציאה</button></div>
      <div className="container" style={{ display: 'grid', gap: 26 }}>
        <div>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>ברוכים הבאים</h1>
          <div className="muted">טענו תכנית אדריכלית (PDF) וקבלו זיהוי אוטומטי של דירות וחדרים, הדמיה תלת־ממדית ותכנית שיווקית להדפסה.</div>
        </div>
        <Uploader />
        <div style={{ display: 'grid', gap: 12 }}>
          <h2 style={{ fontSize: 18 }}>התכניות שלי</h2>
          {err && <div className="err">{err}</div>}
          {!plans && !err && <div className="muted">טוען…</div>}
          <div className="grid">
            {plans?.map(p => (
              <div key={p.id} className="card plan-card">
                <Link href={'/plan/' + p.id} style={{ textDecoration: 'none' }}>
                  <div className="thumb">🏢</div>
                  <div className="body">
                    <b>{p.name}</b>
                    <div className="muted" style={{ fontSize: 13 }}>{p.blds} בניינים · {p.apts} דירות · {p.rooms} חללים</div>
                    <div>{p.is_sample && <span className="tag">דוגמה</span>}</div>
                  </div>
                </Link>
                <div style={{ padding: '0 10px 10px', display: 'flex', justifyContent: 'flex-end' }}><button className="ghost" style={{ fontSize: 13 }} onClick={() => del(p.id, p.name)}>מחיקה</button></div>
              </div>
            ))}
          </div>
          {plans && !plans.length && <div className="muted">עדיין אין תכניות. טענו קובץ PDF כדי להתחיל.</div>}
        </div>
      </div>
    </>
  );
}
