import fs from 'node:fs';

/**
 * Streaming RFC-4180 CSV reader. Yields objects keyed by the header row.
 * Constant memory, so it handles multi-GB exports.
 */
/**
 * @param {object} [opts]
 * @param {string} [opts.delimiter]
 * @param {number} [opts.expectFields] When set, a newline reached before this
 *   many fields is treated as content rather than a row break. Apollo's export
 *   has unquoted newlines inside description fields, which otherwise split ~10%
 *   of records across several lines.
 */
export async function* readCsv(filePath, {
  delimiter = ',',
  expectFields = 0,
  /** Set false for exports (Apollo TSV) where `"` is literal text, never a CSV quote. */
  quotes = true,
  /** A single record longer than this is treated as corrupt and cut, not accumulated. */
  maxRecordChars = 1_000_000,
} = {}) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });

  let header = null;
  let field = '';
  let row = [];
  let inQuotes = false;
  let quoteJustClosed = false;

  const emit = () => {
    row.push(field);
    field = '';
    const out = row;
    row = [];
    return out;
  };

  // Guard against a runaway record: a stray quote or a newline-less region can
  // otherwise make one "row" swallow gigabytes and exhaust the heap.
  let recordChars = 0;
  let discarding = false;
  let corruptRecords = 0;

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];

      if (discarding) {
        if (c === '\n') { discarding = false; recordChars = 0; row = []; field = ''; inQuotes = false; quoteJustClosed = false; }
        continue;
      }
      if (++recordChars > maxRecordChars) {
        corruptRecords++;
        if (corruptRecords <= 5 || corruptRecords % 1000 === 0) {
          process.stderr.write(`\n  csv: record exceeded ${maxRecordChars.toLocaleString()} chars after header row — discarding to next newline (corrupt #${corruptRecords})\n`);
        }
        discarding = true;
        continue;
      }

      if (inQuotes) {
        if (c === '"') {
          if (quoteJustClosed) { field += '"'; quoteJustClosed = false; }
          else quoteJustClosed = true;
        } else if (quoteJustClosed) {
          inQuotes = false; quoteJustClosed = false;
          i--; // re-process this char outside quotes
        } else {
          field += c;
        }
        continue;
      }

      if (quotes && c === '"' && field === '') { inQuotes = true; continue; }
      if (c === delimiter) { row.push(field); field = ''; continue; }
      if (c === '\r') continue;
      if (c === '\n') {
        // A record that is still short of its field count means this newline
        // came from inside a field, not from the end of the row.
        if (header && expectFields && row.length + 1 < expectFields) {
          field += '\n';
          continue;
        }
        const cells = emit();
        recordChars = 0;
        if (!header) { header = cells.map((h) => h.trim().replace(/^﻿/, '')); continue; }
        if (cells.length === 1 && cells[0] === '') continue; // blank line
        yield toObject(header, cells);
        continue;
      }
      field += c;
    }
  }

  // trailing line without newline
  if (inQuotes) { inQuotes = false; }
  if (field !== '' || row.length) {
    const cells = emit();
    if (!header) header = cells.map((h) => h.trim());
    else if (!(cells.length === 1 && cells[0] === '')) yield toObject(header, cells);
  }
}

function toObject(header, cells) {
  const o = {};
  for (let i = 0; i < header.length; i++) o[header[i]] = cells[i] ?? '';
  return o;
}
