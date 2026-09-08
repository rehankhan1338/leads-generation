import { Suspense } from 'react';
import Link from 'next/link';
import { Activity, Database } from 'lucide-react';
import { countLeads, getFacets, getStats, searchLeads } from '@/lib/leads';
import { parseFilters, type RawParams } from '@/lib/search-params';
import { LeadFilters } from '@/components/leads/filters';
import { LeadsTable } from '@/components/leads/leads-table';
import { Pagination } from '@/components/leads/pagination';
import { ExportButton } from '@/components/leads/export-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const sp = await searchParams;
  // Start the expensive queries first so they overlap the (cached) facet read
  // and the shell render instead of waiting behind them.
  const filters = parseFilters(sp);
  const search = searchLeads(filters);
  // The count only needs the row total for its timeout fallback; hand it a
  // promise that can never reject, otherwise a failed row query surfaced as an
  // unhandled rejection (which kills the serverless function) instead of
  // rendering the error page.
  const count = countLeads(filters, search.then((r) => r.rows.length, () => 0));
  // Suspense reads these later; do not let an early failure go unobserved.
  search.catch(() => {});
  count.catch(() => {});

  const [facets, stats] = await Promise.all([getFacets(), getStats()]);
  const totalLeads = stats.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Database className="size-5" />
          <h1 className="text-sm font-semibold">Leads</h1>
          <Badge variant="secondary" className="tabular-nums">
            {totalLeads.toLocaleString()} records
          </Badge>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {stats.map((s) => (
              <span key={s.source} className="tabular-nums">
                {s.source.replace('_', ' ')} {s.count.toLocaleString()}
              </span>
            ))}
            <Link href="/progress" className="flex items-center gap-1 rounded-md border px-2 py-1 hover:text-foreground">
              <Activity className="size-3" /> Import progress
            </Link>
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <ExportButton />
            </Suspense>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">
        <div className="w-full shrink-0 border-b p-4 lg:sticky lg:top-14 lg:h-[calc(100svh-3.5rem)] lg:w-72 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <Suspense fallback={<FiltersSkeleton />}>
            <LeadFilters facets={facets} />
          </Suspense>
        </div>

        <main className="min-w-0 flex-1">
          <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
            <Results search={search} count={count} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

type Search = ReturnType<typeof searchLeads>;
type Count = ReturnType<typeof countLeads>;

async function Results({ search, count }: { search: Search; count: Count }) {
  const { rows, page, perPage } = await search;

  // The count can take up to COUNT_TIMEOUT_SECONDS on unindexed combinations;
  // stream it behind the rows instead of holding the whole table back.
  return (
    <>
      <LeadsTable rows={rows} />
      <Suspense fallback={<PaginationSkeleton />}>
        <Footer count={count} page={page} perPage={perPage} />
      </Suspense>
    </>
  );
}

async function Footer({ count, page, perPage }: { count: Count; page: number; perPage: number }) {
  const { total, capped } = await count;
  return <Pagination page={page} perPage={perPage} total={total} capped={capped} />;
}

function PaginationSkeleton() {
  return (
    <div className="flex items-center justify-between border-t px-4 py-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-48" />
    </div>
  );
}

function FiltersSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
