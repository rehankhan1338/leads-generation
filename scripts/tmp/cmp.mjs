import fs from 'node:fs';
const off = 6652164631n; // start of the giant NUL region in the D: copy
for (const f of process.argv.slice(2)) {
  const fd = fs.openSync(f, 'r'); const st = fs.fstatSync(fd);
  const probe = (pos, n=64) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, Number(pos)); return b; };
  const zeros = (b) => b.every(x => x === 0);
  console.log(`\n${f}\n  size ${st.size}`);
  for (const p of [off + 100000n, off + 500000000n, off + 2000000000n, BigInt(st.size) - 1000n]) {
    const b = probe(p); console.log(`  @${p}: ${zeros(b) ? 'ALL NUL' : JSON.stringify(b.toString('latin1').slice(0,60))}`);
  }
  fs.closeSync(fd);
}
