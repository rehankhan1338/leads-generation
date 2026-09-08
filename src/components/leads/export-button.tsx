'use client';

import { useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Downloads the rows currently on screen as CSV, using the page's own query string. */
export function ExportButton() {
  const params = useSearchParams();
  const qs = params.toString();
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={`/api/export${qs ? `?${qs}` : ''}`} download>
        <Download data-icon="inline-start" />
        Download CSV
      </a>
    </Button>
  );
}
