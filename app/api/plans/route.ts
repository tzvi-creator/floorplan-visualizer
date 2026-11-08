import { NextResponse } from 'next/server';
import { db, ensureSchema } from '@/lib/db';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSchema();
  const r = await db().query(`SELECT id, name, source_name, is_sample, created_at, updated_at,
    jsonb_array_length(analysis->'blds') AS blds, jsonb_array_length(analysis->'apts') AS apts, jsonb_array_length(analysis->'rooms') AS rooms
    FROM vz_plans ORDER BY is_sample ASC, created_at DESC`);
  return NextResponse.json({ plans: r.rows });
}

export async function POST(req: Request) {
  await ensureSchema();
  const b = await req.json();
  if (!b?.analysis || !b?.name) return NextResponse.json({ error: 'חסרים נתונים' }, { status: 400 });
  const r = await db().query('INSERT INTO vz_plans (name, source_name, analysis, settings) VALUES ($1,$2,$3,$4) RETURNING id', [String(b.name).slice(0, 200), b.source ? String(b.source).slice(0, 200) : null, JSON.stringify(b.analysis), JSON.stringify(b.settings || {})]);
  return NextResponse.json({ id: r.rows[0].id });
}
