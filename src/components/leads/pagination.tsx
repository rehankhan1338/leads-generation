'use client';

import { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PER_PAGE_OPTIONS = [25, 50, 100, 200];

export function Pagination({
  page,
  perPage,
  total,
  capped,
}: {
  page: number;
  perPage: number;
  total: number;
  capped: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    return `${pathname}?${next.toString()}`;
  };
  const go = (patch: Record<string, string>) => router.push(hrefFor(patch), { scroll: false });

  const lastPage = Math.max(Math.ceil(total / perPage), 1);

  // Fetch the neighbouring pages while the user reads this one, so Next and
  // Previous render from the router cache instead of waiting on the server.
  // (router.prefetch keeps a dynamic page for the `static` staleTime, 5 min.)
  const nextHref = page < lastPage ? hrefFor({ page: String(page + 1) }) : null;
  const prevHref = page > 1 ? hrefFor({ page: String(page - 1) }) : null;
  useEffect(() => {
    if (nextHref) router.prefetch(nextHref);
    if (prevHref) router.prefetch(prevHref);
  }, [router, nextHref, prevHref]);
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            <span className="tabular-nums text-foreground">{from.toLocaleString()}</span>
            {'–'}
            <span className="tabular-nums text-foreground">{to.toLocaleString()}</span> of{' '}
            <span className="tabular-nums text-foreground">
              {total.toLocaleString()}
              {capped && '+'}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-muted-foreground">
          Rows
          <select
            value={perPage}
            onChange={(e) => go({ perPage: e.target.value, page: '1' })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 1}
            onClick={() => go({ page: String(page - 1) })}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 tabular-nums text-muted-foreground">
            {page} / {lastPage}
            {capped && '+'}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page >= lastPage}
            onClick={() => go({ page: String(page + 1) })}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
