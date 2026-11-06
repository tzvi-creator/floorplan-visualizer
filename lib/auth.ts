import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'vz_session';
const secret = () => new TextEncoder().encode('vz|' + (process.env.SESSION_SECRET || process.env.APP_PASSWORD || 'dev-secret'));
export async function makeToken() { return new SignJWT({ ok: 1 }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('30d').sign(secret()); }
export async function verifyToken(t?: string) { if (!t) return false; try { await jwtVerify(t, secret()); return true; } catch { return false; } }
export function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
