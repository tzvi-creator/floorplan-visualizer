import { NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  await ensureSchema();
  const r = await db().query('SELECT id, name, source_name, analysis, settings, is_sample FROM vz_plans WHERE id=$1', [id]);
  if (!r.rows[0]) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  await ensureSchema();
  const b = await req.json();
  const sets: string[] = []; const vals: any[] = [id];
  if (b.analysis) { vals.push(JSON.stringify(b.analysis)); sets.push(`analysis=$${vals.length}`); }
  if (b.settings) { vals.push(JSON.stringify(b.settings)); sets.push(`settings=$${vals.length}`); }
  if (typeof b.name === 'string') { vals.push(b.name.slice(0, 200)); sets.push(`name=$${vals.length}`); }
  if (!sets.length) return NextResponse.json({ ok: true });
  await db().query(`UPDATE vz_plans SET ${sets.join(',')}, updated_at=now() WHERE id=$1`, vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  await ensureSchema();
  await db().query('DELETE FROM vz_plans WHERE id=$1', [id]);
  return NextResponse.json({ ok: true });
}
