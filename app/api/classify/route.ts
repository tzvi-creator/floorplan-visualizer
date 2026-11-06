import { NextResponse } from 'next/server';
import { classifyApartment } from '@/lib/ai';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.imageDataUrl || !Array.isArray(b?.rooms)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    const out = await classifyApartment({ imageDataUrl: b.imageDataUrl, rooms: b.rooms, aptLabel: b.aptLabel });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'שגיאת AI' }, { status: 500 });
  }
}
