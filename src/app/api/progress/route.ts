import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Advertised record counts per source, so progress can be shown as a fraction. */
const TARGETS: Record<string, { label: string; total: number }> = {
  latka: { label: 'Latka', total: 47_496 },
  storeleads: { label: 'StoreLeads (WooCommerce)', total: 4_530_844 },
  // The file is named "6,071,657" but a full parse finds 5,493,265 records;
  // the remainder is a corrupt tail region, so that is the real target.
  apollo_org: { label: 'Apollo · organisations', total: 5_493_265 },
  apollo_people: { label: 'Apollo · people', total: 93_239_628 },
};

type Run = {
  id: number; source: string; file_name: string; rows_read: number; rows_written: number;
  started_at: string; finished_at: string | null; status: string; note: string | null;
};

type Proc = { ID: number; TIME: number; STATE: string | null; INFO: string | null; PROGRESS: number | null };

export async function GET() {
  // Everything here deliberately avoids touching `leads` itself: while an
  // ALTER TABLE rebuild is running, any statement on that table blocks on the
  // metadata lock and the page would hang with it.
  const [runs, facets, procs] = await Promise.all([
    query<Run>(`SELECT id, source, file_name, rows_read, rows_written, started_at, finished_at, status, note
                FROM import_runs ORDER BY id DESC LIMIT 30`),
    query<{ value: string; lead_count: number }>(
      `SELECT value, lead_count FROM lead_facets WHERE facet = 'source'`),
    query<Proc>(`SELECT ID, TIME, STATE, INFO, PROGRESS FROM information_schema.PROCESSLIST
                 WHERE COMMAND <> 'Sleep' AND INFO IS NOT NULL AND ID <> CONNECTION_ID()
                 ORDER BY TIME DESC LIMIT 10`),
  ]);

  // Rows per source = what the last facet refresh saw, or the sum written by
  // this source's import runs — whichever is larger. Runs heartbeat their
  // count every batch, so this stays live without a COUNT(*) on the big table.
  const facetBySource = Object.fromEntries(facets.map((f) => [f.value, Number(f.lead_count)]));
  const writtenBySource: Record<string, number> = {};
  // Failed and stopped runs still wrote real rows before they ended, so they
  // count too; only the resume overlap (a few thousand upserted rows) is lost.
  for (const r of runs) {
    writtenBySource[r.source] = (writtenBySource[r.source] ?? 0) + Number(r.rows_written);
  }

  const sources = Object.entries(TARGETS).map(([key, t]) => {
    const loaded = Math.max(facetBySource[key] ?? 0, writtenBySource[key] ?? 0);
    const active = runs.find((r) => r.source === key && r.status === 'running') ?? null;
    return {
      key,
      label: t.label,
      target: t.total,
      loaded: Math.min(loaded, t.total),
      pct: Math.min(100, (100 * loaded) / t.total),
      status: active ? 'running' : loaded >= t.total * 0.99 ? 'done' : loaded > 0 ? 'partial' : 'pending',
      ratePerSec: active ? rate(active) : null,
      etaSeconds: active && rate(active) ? Math.round((t.total - loaded) / rate(active)!) : null,
    };
  });

  const disk = await diskFree(process.env.MYSQL_DATA_DRIVE || 'C:\\');

  return NextResponse.json({
    at: new Date().toISOString(),
    sources,
    runs: runs.map((r) => ({ ...r, rows_read: Number(r.rows_read), rows_written: Number(r.rows_written) })),
    operations: procs.map((p) => ({
      id: p.ID,
      seconds: Number(p.TIME),
      state: p.STATE,
      progress: p.PROGRESS != null ? Number(p.PROGRESS) : null,
      sql: (p.INFO ?? '').replace(/\s+/g, ' ').slice(0, 160),
    })),
    disk,
  });
}

function rate(run: Run) {
  const started = new Date(run.started_at).getTime();
  const secs = (Date.now() - started) / 1000;
  return secs > 5 ? Number(run.rows_written) / secs : null;
}

async function diskFree(drive: string) {
  try {
    const s = await fs.statfs(drive);
    const free = Number(s.bavail) * Number(s.bsize);
    const total = Number(s.blocks) * Number(s.bsize);
    return { drive, freeGB: +(free / 1e9).toFixed(1), totalGB: +(total / 1e9).toFixed(1) };
  } catch {
    return { drive, freeGB: null, totalGB: null };
  }
}
