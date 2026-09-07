import fs from 'node:fs';
const file = process.argv[2];
const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
let header = null, fields = 1, rows = 0, inQ = false;
const dist = {};
let buf = '';
for await (const chunk of stream) {
  for (const c of chunk) {
    if (c === '"') inQ = !inQ;
    else if (c === '\t' && !inQ) fields++;
    else if (c === '\n' && !inQ) {
      if (header === null) header = fields;
      dist[fields] = (dist[fields] || 0) + 1;
      fields = 1;
      if (++rows >= 300000) { console.log('header cols:', header); console.log('rows:', rows);
        for (const [k,v] of Object.entries(dist).sort((a,b)=>b[1]-a[1]).slice(0,8)) console.log(`  ${k} fields: ${v} (${(100*v/rows).toFixed(2)}%)`);
        process.exit(0); }
    }
  }
}
