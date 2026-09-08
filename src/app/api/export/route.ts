import type { NextRequest } from 'next/server';
import { searchLeads, type Lead } from '@/lib/leads';
import { parseFilters, type RawParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

/** Column order in the file; keys must be Lead fields. */
const COLUMNS: [keyof Lead, string][] = [
  ['company_name', 'Company'],
  ['domain', 'Domain'],
  ['website_url', 'Website'],
  ['industry', 'Industry'],
  ['category', 'Category'],
  ['city', 'City'],
  ['state', 'State'],
  ['country', 'Country'],
  ['employees', 'Employees'],
  ['founded_year', 'Founded'],
  ['revenue_usd', 'Revenue (USD)'],
  ['revenue_text', 'Revenue (reported)'],
  ['funding_usd', 'Funding (USD)'],
  ['funding_text', 'Funding (reported)'],
  ['growth_percent', 'Growth %'],
  ['monthly_visits', 'Monthly visits'],
  ['monthly_sales_usd', 'Monthly sales (USD)'],
  ['tech_count', 'Tech count'],
  ['contact_name', 'Contact name'],
  ['contact_title', 'Contact title'],
  ['contact_email', 'Contact email'],
  ['email_status', 'Email status'],
  ['contact_phone', 'Contact phone'],
  ['contact_linkedin_url', 'Contact LinkedIn'],
  ['linkedin_url', 'LinkedIn'],
  ['twitter_url', 'Twitter'],
  ['facebook_url', 'Facebook'],
  ['crunchbase_url', 'Crunchbase'],
  ['source', 'Source'],
  ['source_url', 'Source URL'],
  ['id', 'Record ID'],
];

function cell(v: unknown) {
  if (v == null) return '';
  const s = String(v);
  // Quote anything that could break a row or be read as a formula by Excel.
  return /[",\r\n]|^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exports exactly the rows the dashboard is showing: same filters, sort and
 * page, taken from the same query string the page was rendered with.
 */
export async function GET(req: NextRequest) {
  const sp: RawParams = {};
  for (const [k, v] of req.nextUrl.searchParams) {
    const prev = sp[k];
    sp[k] = prev == null ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  const filters = parseFilters(sp);
  const { rows, page } = await searchLeads(filters);

  const lines = [
    COLUMNS.map(([, label]) => cell(label)).join(','),
    ...rows.map((r) => COLUMNS.map(([key]) => cell(r[key])).join(',')),
  ];
  // BOM so Excel opens UTF-8 company names correctly.
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  const date = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${date}-page-${page}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
