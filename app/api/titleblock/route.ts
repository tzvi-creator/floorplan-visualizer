import { NextResponse } from 'next/server';
import { readTitleBlock } from '@/lib/ai';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (typeof b?.imageDataUrl !== 'string') return NextResponse.json({ error: 'bad request' }, { status: 400 });
    return NextResponse.json(await readTitleBlock(b.imageDataUrl));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'שגיאת AI' }, { status: 500 });
  }
}
