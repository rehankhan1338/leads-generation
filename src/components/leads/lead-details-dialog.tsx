'use client';

import { useState } from 'react';
import { Eye, ExternalLink } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Lead } from '@/lib/leads';
import { formatMoney } from '@/lib/search-params';

type Row = { label: string; value: React.ReactNode };

/**
 * Shows the fields the table does not have room for. Fields already visible in
 * the row (company, domain, industry, location, revenue, funding, growth,
 * visits, staff, contact name/title/phone, social links, source) are left out.
 */
export function LeadDetailsDialog({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);

  const rows: Row[] = [
    { label: 'Category', value: lead.category },
    { label: 'State / Region', value: lead.state },
    { label: 'Country code', value: lead.country_code },
    { label: 'Founded', value: lead.founded_year },
    { label: 'Revenue (reported)', value: lead.revenue_text },
    { label: 'Revenue (alt.)', value: formatMoney(lead.revenue_alt_usd) },
    { label: 'Funding (reported)', value: lead.funding_text },
    { label: 'Monthly sales', value: formatMoney(lead.monthly_sales_usd) },
    { label: 'Tech stack size', value: lead.tech_count?.toLocaleString() },
    { label: 'Platform rank', value: lead.platform_rank != null ? `#${lead.platform_rank.toLocaleString()}` : null },
    {
      label: 'Contact email',
      value: lead.contact_email && (
        <a href={`mailto:${lead.contact_email}`} className="break-all underline-offset-2 hover:underline">
          {lead.contact_email}
        </a>
      ),
    },
    { label: 'Contact LinkedIn', value: lead.contact_linkedin_url && <ExtLink href={lead.contact_linkedin_url} /> },
    { label: 'Source profile', value: lead.source_url && <ExtLink href={lead.source_url} /> },
    { label: 'Logo URL', value: lead.logo_url && <ExtLink href={lead.logo_url} /> },
    { label: 'Imported', value: formatDate(lead.imported_at) },
    { label: 'Record ID', value: lead.id },
  ].filter((r) => r.value != null && r.value !== '');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="xs" onClick={() => setOpen(true)}>
        <Eye data-icon="inline-start" />
        View
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{lead.company_name ?? 'Lead details'}</span>
            <Badge variant="outline" className="shrink-0">{lead.source}</Badge>
          </DialogTitle>
          <DialogDescription>
            {lead.domain ?? 'Additional details not shown in the table.'}
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional details for this lead.</p>
        ) : (
          <dl className="max-h-[60svh] divide-y overflow-y-auto text-sm">
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-[140px_1fr] gap-3 py-2">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="min-w-0 break-words">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExtLink({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 underline-offset-2 hover:underline"
    >
      <span className="truncate">{href.replace(/^https?:\/\//, '')}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function formatDate(d: string | Date | null) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? String(d) : date.toLocaleDateString();
}
