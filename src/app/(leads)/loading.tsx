import { Skeleton } from '@/components/ui/skeleton';

/** Instant feedback for a filter or page change while the rows are fetched. */
export default function LeadsLoading() {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
