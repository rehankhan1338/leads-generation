'use client';

import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Replaces Next's bare "This page couldn't load" screen so a failing query or
 * database connection shows enough detail to act on. In production Next strips
 * server error messages and leaves only a digest; that digest matches the
 * server log line for the same failure.
 */
export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-8 text-amber-500" />
      <div className="space-y-1">
        <h1 className="text-base font-semibold">The leads query failed</h1>
        <p className="max-w-lg break-words text-sm text-muted-foreground">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/70">Digest {error.digest} — search the server log for it.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw data-icon="inline-start" /> Try again
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">Clear filters</Link>
        </Button>
      </div>
    </div>
  );
}
