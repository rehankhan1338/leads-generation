/**
 * Bulk-import a platform export into leads_db.
 *
 *   node scripts/import.mjs --source latka --file "data/Latka.csv"
 *   node scripts/import.mjs --source latka --file "..." --truncate
 *   node scripts/import.mjs --source latka --file "..." --limit 1000 --dry
 *   node scripts/import.mjs --source apollo_people --file "..." --skip 5000000 --limit 5000000
 */
import { readCsv } from './lib/csv.mjs';
import { connect } from './lib/db.mjs';
import { latka } from './sources/latka.mjs';
import { storeleads } from './sources/storeleads.mjs';
import { apolloOrg } from './sources/apollo-org.mjs';
import { apolloPeople } from './sources/apollo-people.mjs';
import path from 'node:path';
import fs from 'node:fs';

const ADAPTERS = { latka, storeleads, apollo_org: apolloOrg, apollo_people: apolloPeople };

const COLUMNS = [
  'source', 'source_uid', 'company_name', 'domain', 'website_url', 'linkedin_url',
  'twitter_url', 'facebook_url', 'crunchbase_url', 'logo_url', 'source_url',
  'industry', 'category', 'country', 'country_code', 'state', 'city',
  'employees', 'monthly_visits', 'monthly_sales_usd', 'tech_count', 'platform_rank',
  'founded_year', 'revenue_usd', 'revenue_text', 'revenue_alt_usd',
  'funding_usd', 'funding_text', 'growth_percent',
  'contact_name', 'contact_title', 'contact_email', 'email_status', 'contact_phone', 'contact_linkedin_url',
  'raw',
];

const BATCH = 1000;

/** How many times to reopen a source file after the drive drops mid-read. */
const READ_RETRY_MAX = 100;
const READ_RETRY_WAIT_MS = 30_000;

/** Node surfaces a vanished USB volume as an fs error, not a parse error. */
const isReadError = (err) =>
  /^(UNKNOWN|EIO|ENOENT|EBUSY|ENXIO|ENODEV|EPERM)$/.test(err?.code ?? '') ||
  /unknown error, read|i\/o error/i.test(err?.message ?? '');

/** Poll until the file can actually be opened and read again (or give up after one wait). */
async function waitForReadable(file, waitMs) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(1);
      fs.readSync(fd, buf, 0, 1, 0);
      fs.closeSync(fd);
      return;
    } catch {
      if (Date.now() > deadline) return; // let the caller's retry loop try anyway
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

function args() {
  const a = process.argv.slice(2);
  const o = { batch: BATCH };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--truncate') o.truncate = true;
    else if (k === '--dry') o.dry = true;
    else if (k.startsWith('--')) o[k.slice(2)] = a[++i];
  }
  return o;
}

const SQL_INSERT =
  `INSERT INTO leads (${COLUMNS.join(', ')}) VALUES ? ` +
  `ON DUPLICATE KEY UPDATE ` +
  COLUMNS.filter((c) => c !== 'source' && c !== 'source_uid')
    .map((c) => `${c}=VALUES(${c})`)
    .join(', ');

async function main() {
  const o = args();
  const adapter = ADAPTERS[o.source];
  if (!adapter) throw new Error(`Unknown --source. Available: ${Object.keys(ADAPTERS).join(', ')}`);
  if (!o.file) throw new Error('Missing --file');

  // Big exports arrive as a folder of chunk_N.csv files; take either.
  const target = path.resolve(o.file);
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target)
        .filter((f) => f.toLowerCase().endsWith('.csv'))
        .sort((a, b) => (parseInt(a.match(/\d+/)?.[0] ?? '0', 10) - parseInt(b.match(/\d+/)?.[0] ?? '0', 10)))
        .map((f) => path.join(target, f))
    : [target];
  if (!files.length) throw new Error(`No .csv files found in ${target}`);
  // --skip/--limit let a very large export go in successive bounded runs.
  // Skipped rows are still parsed (there is no row index to seek to) but not
  // mapped or inserted, which is roughly an order of magnitude cheaper.
  const limit = o.limit ? Number(o.limit) : Infinity;
  const skipRows = o.skip ? Number(o.skip) : 0;
  const db = await connect();
  // Do NOT set unique_checks=0 here. It lets duplicate (source, source_uid)
  // rows slip past the unique index, and a later ALTER TABLE rebuild then
  // fails with "Duplicate entry" once it re-validates the key.
  await db.query('SET SESSION foreign_key_checks=0, sql_log_bin=0');

  let runId = null;
  if (!o.dry) {
    if (o.truncate) {
      // Guard against wiping earlier batches of the same source mid-sequence.
      if (skipRows > 0) throw new Error('--truncate with --skip would delete the batches already imported');
      console.log(`Deleting existing "${adapter.source}" rows...`);
      await db.query('DELETE FROM leads WHERE source = ?', [adapter.source]);
    }
    const window = skipRows || Number.isFinite(limit)
      ? ` [skip ${skipRows.toLocaleString()}, limit ${Number.isFinite(limit) ? limit.toLocaleString() : 'all'}]`
      : '';
    const [res] = await db.query(
      'INSERT INTO import_runs (source, file_name, note) VALUES (?, ?, ?)',
      [adapter.source, path.basename(target), window.trim() || null],
    );
    runId = res.insertId;
  }

  let read = 0, processed = 0, written = 0, skipped = 0;
  let batch = [];
  const started = Date.now();

  let label = '';
  // Two importers upserting into the same table (plus the facets rebuild's
  // GROUP BY) can deadlock in InnoDB. That is transient by definition, so
  // retry the batch with a short backoff instead of dying mid-run.
  const insertWithRetry = async (rows) => {
    for (let attempt = 1; ; attempt++) {
      try {
        await db.query(SQL_INSERT, [rows]);
        return;
      } catch (err) {
        const transient = err?.errno === 1213 || err?.errno === 1205; // deadlock / lock wait timeout
        if (!transient || attempt >= 8) throw err;
        process.stdout.write(`\n  ${err.code} on batch, retry ${attempt}/8 in ${attempt * 2}s\n`);
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  };

  const flush = async () => {
    if (!batch.length) return;
    if (!o.dry) await insertWithRetry(batch);
    written += batch.length;
    batch = [];
    // Heartbeat so /progress can show live counts without scanning `leads`.
    if (runId && written % 10_000 === 0) {
      await db.query('UPDATE import_runs SET rows_read=?, rows_written=? WHERE id=?', [processed, written, runId]);
    }
    const secs = (Date.now() - started) / 1000;
    process.stdout.write(
      `\r  ${label} ${written.toLocaleString()} rows  (${Math.round(written / Math.max(secs, 0.001)).toLocaleString()}/s, skipped ${skipped})   `,
    );
  };

  try {
    outer: for (const [i, file] of files.entries()) {
      label = files.length > 1 ? `[${i + 1}/${files.length}] ${path.basename(file)}` : '';

      // The source drive has dropped mid-read more than once (USB enclosure).
      // Rather than die and lose the run, reopen the file and fast-forward to
      // the row we had reached. Rows already parsed into `batch` are flushed
      // first so nothing counted as consumed is lost.
      let consumedInFile = 0;
      let attempt = 0;
      for (;;) {
        let seenInFile = 0;
        try {
          for await (const row of readCsv(file, {
            delimiter: adapter.delimiter ?? ',',
            expectFields: adapter.expectFields ?? 0,
            quotes: adapter.quotes ?? true,
          })) {
            seenInFile++;
            if (seenInFile <= consumedInFile) {
              if (seenInFile % 1_000_000 === 0) {
                process.stdout.write(`\r  re-syncing after read error... ${seenInFile.toLocaleString()} / ${consumedInFile.toLocaleString()}   `);
              }
              continue;
            }
            consumedInFile = seenInFile;
            read++;
            if (read <= skipRows) {
              if (read % 1_000_000 === 0) {
                process.stdout.write(`\r  fast-forwarding... ${read.toLocaleString()} / ${skipRows.toLocaleString()}   `);
              }
              continue;
            }
            if (processed >= limit) break outer;
            processed++;
            const mapped = adapter.map(row);
            if (!mapped) { skipped++; continue; }
            batch.push(COLUMNS.map((c) => mapped[c] ?? null));
            if (batch.length >= Number(o.batch)) await flush();
          }
          await flush();
          break; // this file is done
        } catch (err) {
          if (!isReadError(err) || ++attempt > READ_RETRY_MAX) throw err;
          await flush();
          console.log(
            `\n  read error on ${path.basename(file)} (${err.code ?? err.message}); ` +
            `attempt ${attempt}/${READ_RETRY_MAX}, resuming at row ${consumedInFile.toLocaleString()} in ${READ_RETRY_WAIT_MS / 1000}s`,
          );
          if (runId) {
            await db.query('UPDATE import_runs SET note=CONCAT(IFNULL(note,\'\'), ?) WHERE id=?',
              [` | read error, retry ${attempt} @ row ${consumedInFile}`, runId]);
          }
          await waitForReadable(file, READ_RETRY_WAIT_MS);
        }
      }
    }
    await flush();

    if (!o.dry) {
      await db.query(
        `UPDATE import_runs SET rows_read=?, rows_written=?, finished_at=NOW(), status='done' WHERE id=?`,
        [processed, written, runId],
      );
    }
    console.log(
      `\nDone: scanned ${read.toLocaleString()}, processed ${processed.toLocaleString()}, ` +
      `written ${written.toLocaleString()}, skipped ${skipped}.` +
      (skipRows ? `\nNext batch: --skip ${(skipRows + processed).toLocaleString('en-US').replace(/,/g, '')} --limit ${Number.isFinite(limit) ? limit : ''}` : ''),
    );
  } catch (err) {
    if (runId) {
      await db.query(`UPDATE import_runs SET rows_read=?, rows_written=?, finished_at=NOW(), status='failed', note=? WHERE id=?`,
        [processed, written, String(err.message).slice(0, 2000), runId]);
    }
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error('\n' + e.stack); process.exit(1); });
