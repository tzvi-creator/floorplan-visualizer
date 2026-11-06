import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, verifyToken } from './lib/auth';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname === '/api/login' || pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next();
  const ok = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/login'; url.search = '';
  return NextResponse.redirect(url);
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
