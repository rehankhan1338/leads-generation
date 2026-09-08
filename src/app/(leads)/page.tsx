import { Suspense } from 'react';
import { countLeads, searchLeads } from '@/lib/leads';
import { parseFilters, type RawParams } from '@/lib/search-params';
import { LeadsTable } from '@/components/leads/leads-table';
import { Pagination } from '@/components/leads/pagination';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

/**
 * The results segment only. `loading.tsx` beside this file is shown the moment
 * a filter changes, before the server has answered, and the layout around it
 * (header, filters) stays mounted and interactive.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const filters = parseFilters(await searchParams);
  const search = searchLeads(filters);
  // The count only needs the row total for its timeout fallback; hand it a
  // promise that can never reject, otherwise a failed row query surfaced as an
  // unhandled rejection (which kills the serverless function) instead of
  // rendering the error page.
  const count = countLeads(filters, search.then((r) => r.rows.length, () => 0));
  // Suspense reads this later; do not let an early failure go unobserved.
  count.catch(() => {});

  const { rows, page, perPage, sortIgnored } = await search;

  // The count can take up to COUNT_TIMEOUT_SECONDS on unindexed combinations;
  // stream it behind the rows instead of holding the whole table back.
  return (
    <>
      {sortIgnored && (
        <p className="border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400" role="status">
          Sorting by {filters.sort} is too slow for this combination of filters, so the results are shown newest first.
        </p>
      )}
      <LeadsTable rows={rows} />
      <Suspense fallback={<PaginationSkeleton />}>
        <Footer count={count} page={page} perPage={perPage} />
      </Suspense>
    </>
  );
}

async function Footer({
  count, page, perPage,
}: {
  count: ReturnType<typeof countLeads>;
  page: number;
  perPage: number;
}) {
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
