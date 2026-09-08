import { Suspense } from 'react';
import Link from 'next/link';
import { Activity, Database } from 'lucide-react';
import { getFacets, getStats } from '@/lib/leads';
import { LeadFilters } from '@/components/leads/filters';
import { ExportButton } from '@/components/leads/export-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

/**
 * Header and filter sidebar. They read only the (cached) facet table, and the
 * filter controls take their state from the URL on the client, so nothing here
 * depends on the search params. Keeping them in a layout means a filter change
 * re-renders and re-fetches just the results segment below: the facet lists
 * (~540 values) are sent once per hard load instead of on every navigation.
 */
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
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

        <main className="min-w-0 flex-1">{children}</main>
      </div>
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
