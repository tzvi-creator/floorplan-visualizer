import OpenAI from 'openai';
import { ROOM_TYPES } from './plan/types';

export function aiConfig() {
  const orKey = process.env.OPEN_ROUTER || process.env.OPENROUTER_API_KEY;
  const oaKey = process.env.OPENAI_API_KEY;
  if (oaKey) return { key: oaKey, base: undefined as string | undefined, model: process.env.AI_MODEL || 'gpt-4o', provider: 'openai' };
  if (orKey) return { key: orKey, base: 'https://openrouter.ai/api/v1', model: process.env.AI_MODEL || 'anthropic/claude-sonnet-4.5', provider: 'openrouter' };
  return null;
}
export function aiClient() {
  const c = aiConfig();
  if (!c) throw new Error('לא הוגדר מפתח AI (OPENAI_API_KEY / OPEN_ROUTER)');
  return { client: new OpenAI({ apiKey: c.key, baseURL: c.base, timeout: 90000, maxRetries: 1 }), model: c.model };
}

const TYPES_DOC = ROOM_TYPES.filter(t => !['stairs', 'elevator', 'lobby'].includes(t.id)).map(t => `${t.id} = ${t.he}`).join('\n');

export interface ClassifyInput { imageDataUrl: string; rooms: { n: number; areaM2: number; dimsM: string; hint?: string; current?: string }[]; aptLabel?: string }
export interface ClassifyOutput { rooms: { n: number; type: string; name: string }[] }

export async function classifyApartment(inp: ClassifyInput): Promise<ClassifyOutput> {
  const { client, model } = aiClient();
  const system = `אתה אדריכל ישראלי מומחה בקריאת תכניות דירות. מקבלים תמונה של דירה מתוך תכנית אדריכלית (קומה טיפוסית), עם חדרים ממוספרים בעיגולים צבעוניים, ורשימת חדרים עם שטח ומידות.
המשימה: לזהות לכל חדר ממוספר את סוגו ושמו בעברית. השתמש בטקסטים שכתובים בתכנית (למשל "סלון", "מטבח", "חדר", "סוכה", "מרפסת שמש", "ממ״ד", "וונטה"), בכלי הסניטציה והריהוט שמסורטטים (אסלה/כיור/אמבטיה = חדר רחצה או שירותים, מיטה = חדר שינה, ארון מטבח וכיריים = מטבח), בקירות עבים מאוד סביב חדר (ממ״ד) ובמידות.
סוגים מותרים (id = שם):
${TYPES_DOC}
כללים: שדה hint מציין איך החדר מחובר לדירה – חדר שמחובר רק דרך חלון/הזזה הוא כמעט תמיד מרפסת (ריצוף משבצות, מעקה, מחוץ לקירות החוץ העבים), פיר או חדרון חיצוני קטן. אל תסווג מרפסת כחדר שינה. כניסה/מבואה קטנה בין הדלת הראשית לשאר הדירה = entrance. חלל פתוח שכולל סלון ומטבח יסומן living_kitchen (שם "סלון / מטבח"). בחדר שינה הורים (master) יש בדרך כלל חדר רחצה צמוד (master_bath). מרפסת סוכה/שמש/רגילה = balcony_sukkah/balcony_sun/balcony. חדרון קטן שהוא פיר/וונטה = shaft. חדר שינה נוסף: "חדר שינה 2" וכן הלאה. אל תמציא חדרים. ענה רק JSON תקני בפורמט:
{"rooms":[{"n":1,"type":"bedroom","name":"חדר שינה 2"}]}`;
  const user = `${inp.aptLabel ? inp.aptLabel + '\n' : ''}החדרים (n = המספר בעיגול):\n${JSON.stringify(inp.rooms)}`;
  const resp = await client.chat.completions.create({
    model, temperature: 0.1, max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: inp.imageDataUrl, detail: 'high' } }] as any },
    ],
  });
  const txt = resp.choices[0]?.message?.content || '{}';
  const j = JSON.parse(txt.replace(/^```json|```$/g, '').trim());
  const valid = new Set(ROOM_TYPES.map(t => t.id));
  const out: ClassifyOutput = { rooms: [] };
  for (const r of j.rooms || []) if (typeof r.n === 'number' && valid.has(r.type) && typeof r.name === 'string') out.rooms.push({ n: r.n, type: r.type, name: r.name.slice(0, 40) });
  return out;
}

export async function chatAgent(messages: { role: 'user' | 'assistant'; content: string }[], context: string): Promise<string> {
  const { client, model } = aiClient();
  const system = `אתה "סוכן ההדמיה" – עוזר שיווק ומכירות לתכניות אדריכליות של דירות. עונה בעברית, בקצרה ובבהירות, על סמך נתוני התכנית שמצורפים. אם מבקשים תיאור שיווקי – כתוב תיאור משכנע אך אמין, ללא המצאת נתונים שלא מופיעים. אם חסר מידע – אמור זאת.\nנתוני התכנית:\n${context}`;
  const resp = await client.chat.completions.create({ model, temperature: 0.4, max_tokens: 700, messages: [{ role: 'system', content: system }, ...messages.slice(-10)] });
  return resp.choices[0]?.message?.content?.trim() || '';
}
