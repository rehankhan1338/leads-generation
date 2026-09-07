import { readCsv } from '../lib/csv.mjs';
const file = process.argv[2], LIMIT = Number(process.argv[3] || 20000);
let n = 0; const fill = {}, samples = {}, uniq = {};
for await (const r of readCsv(file, { delimiter: '\t' })) {
  for (const [k, v] of Object.entries(r)) {
    fill[k] ??= 0; samples[k] ??= []; uniq[k] ??= new Set();
    if (v != null && String(v).trim() !== '') {
      fill[k]++;
      if (samples[k].length < 2) samples[k].push(String(v).slice(0, 60));
      if (uniq[k].size < 300) uniq[k].add(String(v).slice(0, 30));
    }
  }
  if (++n >= LIMIT) break;
}
console.log('rows sampled:', n);
for (const k of Object.keys(fill)) {
  console.log(`${k.padEnd(46)} ${(100 * fill[k] / n).toFixed(1).padStart(5)}%  u=${uniq[k].size >= 300 ? '300+' : uniq[k].size}  ${samples[k].join(' ~ ').slice(0, 90)}`);
}
