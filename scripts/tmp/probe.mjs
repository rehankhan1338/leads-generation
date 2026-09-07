// Find the first line past a start row whose quote count is odd (unterminated quote)
import fs from 'node:fs';
import readline from 'node:readline';
const file = process.argv[2], from = Number(process.argv[3] || 3400000);
const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
let n = 0, shown = 0, maxLen = 0, maxAt = 0;
for await (const line of rl) {
  n++;
  if (n < from) continue;
  if (line.length > maxLen) { maxLen = line.length; maxAt = n; }
  const q = (line.match(/"/g) || []).length;
  const tabs = (line.match(/\t/g) || []).length;
  if (q % 2 === 1 && shown < 5) { shown++; console.log(`line ${n}: odd quotes=${q} tabs=${tabs} len=${line.length} :: ${line.slice(0,140).replace(/\t/g,'⇥')}`); }
  if (n > from + 200000) break;
}
console.log(`scanned lines ${from}-${n}; longest line ${maxLen} chars at line ${maxAt}; odd-quote lines shown: ${shown}`);
