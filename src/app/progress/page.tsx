'use client';

import * as React from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Database, HardDrive, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

type Source = {
  key: string; label: string; target: number; loaded: number; pct: number;
  status: 'running' | 'done' | 'partial' | 'pending';
  ratePerSec: number | null; etaSeconds: number | null;
};
type Run = {
  id: number; source: string; file_name: string; rows_read: number; rows_written: number;
  started_at: string; finished_at: string | null; status: string; note: string | null;
};
type Op = { id: number; seconds: number; state: string | null; progress: number | null; sql: string };
type Payload = {
  at: string; sources: Source[]; runs: Run[]; operations: Op[];
  disk: { drive: string; freeGB: number | null; totalGB: number | null };
};

const POLL_MS = 5000;

export default function ProgressPage() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/progress', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as Payload;
        if (alive) { setData(json); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const t = setInterval(() => { load(); setTick((n) => n + 1); }, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const totalLoaded = data?.sources.reduce((s, x) => s + x.loaded, 0) ?? 0;
  const totalTarget = data?.sources.reduce((s, x) => s + x.target, 0) ?? 0;

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground" aria-label="Back to leads">
            <ArrowLeft className="size-4" />
          </Link>
          <Activity className="size-5" />
          <h1 className="text-sm font-semibold">Import progress</h1>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className={`size-3 ${tick % 2 ? 'opacity-50' : ''}`} />
            {data ? `updated ${new Date(data.at).toLocaleTimeString()}` : 'loading…'} · every {POLL_MS / 1000}s
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4">
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            Could not reach the database: {error}. Retrying…
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4" /> All sources
              <span className="ml-auto tabular-nums text-sm font-normal text-muted-foreground">
                {fmt(totalLoaded)} / {fmt(totalTarget)} rows · {totalTarget ? ((100 * totalLoaded) / totalTarget).toFixed(1) : '0'}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={totalTarget ? (100 * totalLoaded) / totalTarget : 0} />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {data?.sources.map((s) => (
            <Card key={s.key}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {s.label}
                  <StatusBadge status={s.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={s.pct} />
                <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                  <span>{fmt(s.loaded)} / {fmt(s.target)}</span>
                  <span>{s.pct.toFixed(1)}%</span>
                </div>
                {s.status === 'running' && (
                  <div className="text-xs text-muted-foreground">
                    {s.ratePerSec ? `${fmt(Math.round(s.ratePerSec))} rows/s` : 'measuring rate…'}
                    {s.etaSeconds != null && ` · ~${fmtDuration(s.etaSeconds)} left`}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> Database operations right now
              <span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <HardDrive className="size-3" />
                {data?.disk.freeGB != null
                  ? `${data.disk.drive} ${data.disk.freeGB} GB free of ${data.disk.totalGB} GB`
                  : 'disk n/a'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.operations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Idle — no long-running statements.</p>
            ) : (
              <div className="space-y-3">
                {data?.operations.map((op) => (
                  <div key={op.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{op.state ?? 'running'}</Badge>
                      <span className="tabular-nums text-muted-foreground">{fmtDuration(op.seconds)}</span>
                      {op.progress != null && op.progress > 0 && (
                        <span className="tabular-nums text-muted-foreground">{op.progress.toFixed(1)}%</span>
                      )}
                    </div>
                    {op.progress != null && op.progress > 0 && <Progress value={op.progress} className="h-1.5" />}
                    <code className="block truncate text-xs text-muted-foreground">{op.sql}</code>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Import runs</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Written</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{r.id}</TableCell>
                    <TableCell>{r.source}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-muted-foreground">{r.file_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.rows_written)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{fmtTime(r.started_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.finished_at ? fmtTime(r.finished_at) : '—'}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-muted-foreground" title={r.note ?? ''}>{r.note ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    running: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    done: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    stopped: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    failed: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    pending: '',
  };
  return <Badge variant="outline" className={cls[status] ?? ''}>{status}</Badge>;
}

const fmt = (n: number) => n.toLocaleString('en-US');
const fmtTime = (s: string) => new Date(s).toLocaleString();
function fmtDuration(secs: number) {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  return `${h}h ${Math.floor((secs % 3600) / 60)}m`;
}
