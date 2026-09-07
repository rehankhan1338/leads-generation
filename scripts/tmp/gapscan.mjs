// Byte-level scan: find the longest stretch without '\n' in the file (the "giant record").
import fs from 'node:fs';
const file = process.argv[2];
const st = fs.statSync(file);
const fd = fs.openSync(file, 'r');
const buf = Buffer.alloc(1 << 24);
let pos = 0, lineStart = 0, maxLen = 0, maxStart = 0, lines = 0, maxLine = 0;
while (pos < st.size) {
  const n = fs.readSync(fd, buf, 0, buf.length, pos);
  if (n <= 0) break;
  for (let i = 0; i < n; i++) if (buf[i] === 10) { const len = pos + i - lineStart; if (len > maxLen) { maxLen = len; maxStart = lineStart; maxLine = lines; } lines++; lineStart = pos + i + 1; }
  pos += n;
}
const tailLen = st.size - lineStart; if (tailLen > maxLen) { maxLen = tailLen; maxStart = lineStart; maxLine = lines; }
console.log(`file ${st.size} bytes, ${lines} newlines`);
console.log(`longest newline-free stretch: ${maxLen.toLocaleString()} bytes, starting at byte ${maxStart.toLocaleString()} (line #${maxLine})`);
const s = Buffer.alloc(300); fs.readSync(fd, s, 0, 300, maxStart);
console.log('starts with:', JSON.stringify(s.toString('utf8').slice(0, 200)));
const m = Buffer.alloc(200); fs.readSync(fd, m, 0, 200, maxStart + Math.floor(maxLen / 2));
console.log('middle sample:', JSON.stringify(m.toString('latin1').slice(0, 120)));
fs.closeSync(fd);
