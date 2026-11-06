import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const [,, src, out, w] = process.argv;
const r = new Resvg(fs.readFileSync(src), { fitTo: { mode: 'width', value: +w || 2400 }, font: { loadSystemFonts: false } });
fs.writeFileSync(out, r.render().asPng());
