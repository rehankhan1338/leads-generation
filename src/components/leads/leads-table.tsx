'use client';

import { memo, useState } from 'react';
import { Globe, Building2, Mail, Phone, Eye } from 'lucide-react';
import { LinkedinIcon, TwitterIcon, FacebookIcon } from './brand-icons';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Lead } from '@/lib/leads';
import { formatMoney } from '@/lib/search-params';
import { SortHeader } from './sort-header';
import { LeadDetailsDialog } from './lead-details-dialog';

const SOURCE_STYLES: Record<string, string> = {
  latka: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  storeleads: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  apollo_org: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  apollo_people: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

/**
 * One client boundary for the whole table. Rendered as a server component the
 * table crossed into a client component at every cell (the shadcn primitives,
 * links, badges, one dialog per row), so the RSC payload carried the entire
 * element tree — ~9 KB per row on top of the HTML — and rendering it took
 * ~65 ms per row. Here the payload is just the row data, serialised once.
 */
export function LeadsTable({ rows }: { rows: Lead[] }) {
  const [selected, setSelected] = useState<Lead | null>(null);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <Building2 className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">No leads match these filters</p>
        <p className="text-xs text-muted-foreground">Try clearing a filter or widening a range.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <SortHeader field="company" className="min-w-[240px]">Company</SortHeader>
            <SortHeader field="industry" className="min-w-[180px]">Industry</SortHeader>
            <SortHeader field="country" className="min-w-[130px]">Location</SortHeader>
            <SortHeader field="revenue" numeric>Revenue</SortHeader>
            <SortHeader field="funding" numeric>Funding</SortHeader>
            <SortHeader field="growth" numeric>Growth</SortHeader>
            <SortHeader field="visits" numeric>Visits/mo</SortHeader>
            <SortHeader field="employees" numeric>Staff</SortHeader>
            <TableHead className="min-w-[170px]">Contact</TableHead>
            <TableHead className="w-[120px]">Links</TableHead>
            <SortHeader field="source">Source</SortHeader>
            <TableHead className="w-[80px]">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((lead) => (
            <LeadRow key={lead.id} lead={lead} onView={setSelected} />
          ))}
        </TableBody>
      </Table>
      <LeadDetailsDialog lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

const LeadRow = memo(function LeadRow({ lead, onView }: { lead: Lead; onView: (lead: Lead) => void }) {
  return (
    <TableRow className="group">
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Avatar lead={lead} />
          <div className="min-w-0">
            <div className="truncate font-medium">{lead.company_name ?? '—'}</div>
            {lead.domain && (
              <div className="truncate text-xs text-muted-foreground">{lead.domain}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span className="line-clamp-1">{lead.industry ?? '—'}</span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span className="line-clamp-1">
          {[lead.city, lead.country].filter(Boolean).join(', ') || '—'}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(lead.revenue_usd) ?? <Dash />}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(lead.funding_usd) ?? <Dash />}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Growth value={lead.growth_percent} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {lead.monthly_visits != null ? compact(lead.monthly_visits) : <Dash />}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {lead.employees != null ? lead.employees.toLocaleString() : <Dash />}
      </TableCell>
      <TableCell>
        {lead.contact_name || lead.contact_phone ? (
          <div className="min-w-0 space-y-0.5">
            {lead.contact_name && (
              <div className="truncate text-sm">{lead.contact_name}</div>
            )}
            {(lead.contact_title || lead.contact_email) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {lead.contact_title && <span className="truncate">{lead.contact_title}</span>}
                {lead.contact_email && (
                  <Mail
                    className={`size-3 shrink-0 ${lead.email_status === 'Verified' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                    aria-label={lead.email_status ? `Email ${lead.email_status.toLowerCase()}` : 'Has email'}
                  />
                )}
              </div>
            )}
            {lead.contact_phone && (
              <a
                href={`tel:${lead.contact_phone.replace(/[^\d+]/g, '')}`}
                className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground"
              >
                <Phone className="size-3 shrink-0" />
                <span className="truncate">{lead.contact_phone}</span>
              </a>
            )}
          </div>
        ) : (
          <Dash />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <IconLink href={lead.website_url} label="Website"><Globe className="size-3.5" /></IconLink>
          <IconLink href={lead.linkedin_url} label="LinkedIn"><LinkedinIcon className="size-3.5" /></IconLink>
          <IconLink href={lead.twitter_url} label="Twitter"><TwitterIcon className="size-3.5" /></IconLink>
          <IconLink href={lead.facebook_url} label="Facebook"><FacebookIcon className="size-3.5" /></IconLink>
          <IconLink href={lead.crunchbase_url} label="Crunchbase"><Building2 className="size-3.5" /></IconLink>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={SOURCE_STYLES[lead.source] ?? ''}>
          {lead.source.replace('_', ' ')}
        </Badge>
      </TableCell>
      <TableCell>
        <Button variant="outline" size="xs" onClick={() => onView(lead)}>
          <Eye data-icon="inline-start" />
          View
        </Button>
      </TableCell>
    </TableRow>
  );
});

const Dash = () => <span className="text-muted-foreground/40">—</span>;

/** 17,213,438 -> 17.2M, so the traffic column stays scannable. */
const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

function Growth({ value }: { value: string | number | null }) {
  if (value == null) return <Dash />;
  const n = Number(value);
  if (!Number.isFinite(n)) return <Dash />;
  return (
    <span className={n > 0 ? 'text-emerald-600 dark:text-emerald-400' : n < 0 ? 'text-red-600 dark:text-red-400' : ''}>
      {n > 0 ? '+' : ''}
      {n % 1 === 0 ? n : n.toFixed(1)}%
    </span>
  );
}

function Avatar({ lead }: { lead: Lead }) {
  const initial = (lead.company_name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-[11px] font-medium text-muted-foreground">
      {lead.logo_url ? (
        // Remote logos come from many hosts, so plain <img> avoids next/image config churn.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={lead.logo_url} alt="" className="size-full object-contain" loading="lazy" decoding="async" />
      ) : (
        initial
      )}
    </div>
  );
}

/** External links: a plain anchor — next/link buys nothing for other origins. */
function IconLink({
  href, label, children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) return <span className="opacity-15">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className="transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}
