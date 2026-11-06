import { NextResponse } from 'next/server';
import { COOKIE, makeToken, safeEqual } from '@/lib/auth';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const real = process.env.APP_PASSWORD;
  if (!real) return NextResponse.json({ error: 'APP_PASSWORD לא מוגדר בשרת' }, { status: 500 });
  if (typeof password !== 'string' || !safeEqual(password, real)) return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeToken(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30, path: '/' });
  return res;
}
