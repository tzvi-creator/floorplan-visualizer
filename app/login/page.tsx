'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (r.ok) { window.location.href = '/'; return; }
    const j = await r.json().catch(() => ({})); setErr(j.error || 'שגיאה בכניסה'); setBusy(false);
  }
  return (
    <div className="center-card">
      <form className="card login" onSubmit={submit}>
        <div className="brand"><i /> הדמיית דירה מתכנית</div>
        <div className="muted">הזינו את סיסמת הכניסה למערכת</div>
        <input type="password" autoFocus placeholder="סיסמה" value={pw} onChange={e => setPw(e.target.value)} aria-label="סיסמה" />
        {err && <div className="err" role="alert">{err}</div>}
        <button className="primary" disabled={busy || !pw}>{busy ? 'נכנס…' : 'כניסה'}</button>
      </form>
    </div>
  );
}
