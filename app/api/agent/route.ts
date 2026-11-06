import { NextResponse } from 'next/server';
import { chatAgent, aiConfig } from '@/lib/ai';

export const maxDuration = 60;

export async function GET() {
  const c = aiConfig();
  return NextResponse.json({ available: !!c, provider: c?.provider, model: c?.model });
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const msgs = Array.isArray(b?.messages) ? b.messages.filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-10) : [];
    if (!msgs.length) return NextResponse.json({ error: 'אין הודעה' }, { status: 400 });
    const answer = await chatAgent(msgs, String(b.context || '').slice(0, 12000));
    return NextResponse.json({ answer });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'שגיאת AI' }, { status: 500 });
  }
}
