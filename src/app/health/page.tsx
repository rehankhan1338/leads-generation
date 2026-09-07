import Link from 'next/link';
import mysql from 'mysql2/promise';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const REQUIRED_TABLES = ['leads', 'lead_facets', 'import_runs'];

type Check = { name: string; ok: boolean; detail: string };

function mask(v: string | undefined, keep = 3) {
  if (!v) return '(not set)';
  return v.length <= keep ? '***' : v.slice(0, keep) + '*'.repeat(Math.min(8, v.length - keep));
}

async function runChecks(): Promise<{ checks: Check[]; ms: number }> {
  const checks: Check[] = [];
  const t0 = Date.now();

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3307);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'leads_db';
  const isLocal = host === '127.0.0.1' || host === 'localhost';
  const useSsl = process.env.DB_SSL ? process.env.DB_SSL !== 'false' : !isLocal;

  checks.push({
    name: 'Environment variables',
    ok: Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME),
    detail: [
      `DB_HOST=${process.env.DB_HOST ?? '(not set, defaulting to 127.0.0.1)'}`,
      `DB_PORT=${process.env.DB_PORT ?? '(not set, defaulting to 3307)'}`,
      `DB_USER=${process.env.DB_USER ?? '(not set, defaulting to root)'}`,
      `DB_PASSWORD=${mask(process.env.DB_PASSWORD)}`,
      `DB_NAME=${process.env.DB_NAME ?? '(not set, defaulting to leads_db)'}`,
      `TLS=${useSsl ? 'on' : 'off'}`,
    ].join('\n'),
  });

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host, port, user, password, database,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: 8000,
    });
    const [[info]] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT VERSION() AS version, DATABASE() AS db, CURRENT_USER() AS user');
    checks.push({
      name: 'Connect and authenticate',
      ok: true,
      detail: `MySQL ${info.version}, database ${info.db}, user ${info.user}`,
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { sqlMessage?: string };
    checks.push({
      name: 'Connect and authenticate',
      ok: false,
      detail: `${err.code ?? 'ERROR'}: ${err.sqlMessage ?? err.message}`,
    });
    return { checks, ms: Date.now() - t0 };
  }

  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT table_name AS name, table_rows AS approx_rows FROM information_schema.tables WHERE table_schema = DATABASE()');
    const present = new Map(rows.map((r) => [String(r.name), Number(r.approx_rows)]));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    checks.push({
      name: 'Required tables',
      ok: missing.length === 0,
      detail: missing.length
        ? `Missing: ${missing.join(', ')}. Run db/schema.sql against this database.`
        : REQUIRED_TABLES.map((t) => `${t}: ~${present.get(t)!.toLocaleString()} rows`).join('\n'),
    });
  } catch (e) {
    checks.push({ name: 'Required tables', ok: false, detail: (e as Error).message });
  } finally {
    await conn.end().catch(() => {});
  }

  return { checks, ms: Date.now() - t0 };
}

export default async function HealthPage() {
  const { checks, ms } = await runChecks();
  const allOk = checks.every((c) => c.ok);

  return (
    <div className="min-h-svh bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <h1 className="text-lg font-semibold">Database health</h1>
          <Badge variant={allOk ? 'secondary' : 'destructive'} className="ml-auto">
            {allOk ? 'Connected' : 'Problem detected'}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Checks ran in {ms} ms at {new Date().toISOString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-56">Check</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell>
                      {c.ok
                        ? <CheckCircle2 className="size-4 text-green-600" />
                        : <XCircle className="size-4 text-red-600" />}
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <pre className="whitespace-pre-wrap font-mono text-xs">{c.detail}</pre>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Reload this page to re-run the checks. The password is masked; the rest is shown as the server sees it.
        </p>
      </div>
    </div>
  );
}
