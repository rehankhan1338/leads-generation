import { readCsv } from '../lib/csv.mjs';
import { apolloOrg } from '../sources/apollo-org.mjs';
const f = 'E:/Apollo Database 99,311,285/Entire Apollo Database 99,311,285/Apollo_V7_V5_org_all_fields 6,071,657.csv';
let n = 0; const fill = {};
for await (const r of readCsv(f, { delimiter: '\t', expectFields: 51 })) {
  const m = apolloOrg.map(r);
  if (!m) continue;
  if (n < 2) { const { raw, ...rest } = m; console.log(JSON.stringify(rest, null, 1)); console.log('raw:', raw.slice(0, 200) + '...\n'); }
  for (const [k, v] of Object.entries(m)) { fill[k] ??= 0; if (v != null && v !== '') fill[k]++; }
  if (++n >= 30000) break;
}
console.log('rows', n);
for (const [k, v] of Object.entries(fill)) console.log(` ${k.padEnd(20)} ${((100*v)/n).toFixed(1)}%`);
