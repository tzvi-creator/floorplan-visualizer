import { NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';
import { isSafeArt } from '@/lib/plan/art';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** GET ?bld=b0 (or several, comma separated) -> { b0: "<path .../>" } */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  await ensureSchema();
  const bld = new URL(req.url).searchParams.get('bld');
  const r = bld
    ? await db().query('SELECT bld_id, svg FROM vz_art WHERE plan_id=$1 AND bld_id = ANY($2)', [id, bld.split(',').slice(0, 20)])
    : await db().query('SELECT bld_id, svg FROM vz_art WHERE plan_id=$1', [id]);
  const out: Record<string, string> = {};
  for (const row of r.rows) out[row.bld_id] = row.svg;
  return NextResponse.json(out);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  await ensureSchema();
  const b = await req.json();
  if (typeof b?.bldId !== 'string' || !/^[a-z0-9]{1,12}$/i.test(b.bldId) || !isSafeArt(b?.svg)) return NextResponse.json({ error: 'bad art' }, { status: 400 });
  await db().query('INSERT INTO vz_art (plan_id, bld_id, svg) VALUES ($1,$2,$3) ON CONFLICT (plan_id, bld_id) DO UPDATE SET svg=EXCLUDED.svg', [id, b.bldId, b.svg]);
  return NextResponse.json({ ok: true });
}
