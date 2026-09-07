import { readCsv } from '../lib/csv.mjs';
import { apolloPeople } from '../sources/apollo-people.mjs';
const f = 'F:/apollo-extract/Entire Apollo Database 99,311,285/Apollo_V7_V5_per_all_fields 93,239,628.csv';
let n = 0, skipped = 0; const fill = {}; const status = {};
for await (const r of readCsv(f, { delimiter: '\t', expectFields: 39 })) {
  const m = apolloPeople.map(r);
  if (!m) { skipped++; continue; }
  if (n < 3) { const { raw, ...rest } = m; console.log(JSON.stringify(rest)); console.log('  raw:', raw.slice(0,180)); }
  for (const [k, v] of Object.entries(m)) { fill[k] ??= 0; if (v != null && v !== '') fill[k]++; }
  const st = JSON.parse(m.raw).email_status ?? '(none)';
  status[st] = (status[st] || 0) + 1;
  if (++n >= 100000) break;
}
console.log('\nmapped', n, 'skipped', skipped);
console.log('\n-- email status --'); for (const [k,v] of Object.entries(status).sort((a,b)=>b[1]-a[1])) console.log(`  ${k}: ${(100*v/n).toFixed(1)}%`);
console.log('\n-- fill --');
for (const [k, v] of Object.entries(fill)) if (v) console.log(` ${k.padEnd(22)} ${((100*v)/n).toFixed(1)}%`);
