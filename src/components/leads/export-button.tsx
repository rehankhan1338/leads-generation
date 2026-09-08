'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Pulls the file name out of a Content-Disposition header, if present. */
function filenameFrom(res: Response) {
  const m = res.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/);
  return m?.[1] ?? 'leads.csv';
}

/** Downloads the rows currently on screen as CSV, using the page's own query string. */
export function ExportButton() {
  const params = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const qs = params.toString();

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/export${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFrom(res);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Could not download the CSV. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={downloading}
      aria-busy={downloading}
    >
      {downloading ? (
        <LoaderCircle data-icon="inline-start" className="animate-spin" />
      ) : (
        <Download data-icon="inline-start" />
      )}
      {downloading ? 'Downloading…' : 'Download CSV'}
    </Button>
  );
}
