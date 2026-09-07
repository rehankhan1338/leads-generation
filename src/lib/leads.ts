import { query, withTimeout } from './db';

export type Lead = {
  id: number;
  source: string;
  company_name: string | null;
  domain: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  crunchbase_url: string | null;
  logo_url: string | null;
  source_url: string | null;
  industry: string | null;
  category: string | null;
  country: string | null;
  country_code: string | null;
  state: string | null;
  city: string | null;
  employees: number | null;
  monthly_visits: number | null;
  monthly_sales_usd: number | null;
  tech_count: number | null;
  platform_rank: number | null;
  founded_year: number | null;
  revenue_usd: number | null;
  revenue_text: string | null;
  funding_usd: number | null;
  funding_text: string | null;
  growth_percent: string | number | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  email_status: string | null;
  contact_phone: string | null;
  contact_linkedin_url: string | null;
  revenue_alt_usd: number | null;
  imported_at: string | Date | null;
};

export type LeadFilters = {
  q?: string;
  source?: string[];
  industry?: string[];
  country?: string[];
  category?: string[];
  emailStatus?: string[];
  revenueMin?: number;
  revenueMax?: number;
  fundingMin?: number;
  fundingMax?: number;
  employeesMin?: number;
  employeesMax?: number;
  visitsMin?: number;
  visitsMax?: number;
  techMin?: number;
  growthMin?: number;
  /** requires the named field to be present: website, linkedin, email, phone, twitter, revenue, funding */
  has?: string[];
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
};

/** Column allow-list — never interpolate user input into ORDER BY. */
const SORTABLE: Record<string, string> = {
  company: 'company_name',
  revenue: 'revenue_usd',
  funding: 'funding_usd',
  growth: 'growth_percent',
  employees: 'employees',
  visits: 'monthly_visits',
  tech: 'tech_count',
  country: 'country',
  industry: 'industry',
  source: 'source',
  added: 'id',
};

const HAS_COLUMN: Record<string, string> = {
  website: 'website_url',
  linkedin: 'linkedin_url',
  twitter: 'twitter_url',
  email: 'contact_email',
  phone: 'contact_phone',
  contact: 'contact_name',
  revenue: 'revenue_usd',
  funding: 'funding_usd',
  logo: 'logo_url',
  visits: 'monthly_visits',
};

/** Counting every match on a 100M-row table is too slow; stop at this many. */
export const COUNT_CAP = 100_000;
/** Hard ceiling on how long a count may run before we fall back to an estimate. */
export const COUNT_TIMEOUT_SECONDS = 2;
/** Hard ceiling on the page query itself; beyond this the request errors rather than hangs. */
export const ROWS_TIMEOUT_SECONDS = 30;

function buildWhere(f: LeadFilters) {
  const where: string[] = [];
  const params: unknown[] = [];

  const q = f.q?.trim();
  if (q) {
    // Fulltext (indexed, prefix-matched) for real words; LIKE for very short terms.
    const tokens = q.split(/\s+/).filter((t) => t.replace(/[^\p{L}\p{N}]/gu, '').length >= 3);
    if (tokens.length) {
      const expr = tokens
        .map((t) => `+${t.replace(/[+\-><()~*"@]/g, ' ').trim()}*`)
        .filter((t) => t.length > 2)
        .join(' ');
      if (expr) {
        where.push('MATCH (company_name, domain, industry, contact_name) AGAINST (? IN BOOLEAN MODE)');
        params.push(expr);
      }
    } else {
      where.push('(company_name LIKE ? OR domain LIKE ?)');
      params.push(`${q}%`, `${q}%`);
    }
  }

  const inList = (col: string, vals?: string[]) => {
    if (!vals?.length) return;
    where.push(`${col} IN (${vals.map(() => '?').join(',')})`);
    params.push(...vals);
  };
  inList('source', f.source);
  inList('industry', f.industry);
  inList('country', f.country);
  inList('category', f.category);
  inList('email_status', f.emailStatus);

  const range = (col: string, min?: number, max?: number) => {
    if (min != null && Number.isFinite(min)) { where.push(`${col} >= ?`); params.push(min); }
    if (max != null && Number.isFinite(max)) { where.push(`${col} <= ?`); params.push(max); }
  };
  range('revenue_usd', f.revenueMin, f.revenueMax);
  range('funding_usd', f.fundingMin, f.fundingMax);
  range('employees', f.employeesMin, f.employeesMax);
  range('monthly_visits', f.visitsMin, f.visitsMax);
  range('tech_count', f.techMin, undefined);
  range('growth_percent', f.growthMin, undefined);

  for (const key of f.has ?? []) {
    const col = HAS_COLUMN[key];
    if (col) where.push(`${col} IS NOT NULL AND ${col} <> ''`);
  }

  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function searchLeads(f: LeadFilters) {
  const { sql: whereSql, params } = buildWhere(f);

  const perPage = Math.min(Math.max(f.perPage ?? 50, 10), 200);
  const page = Math.max(f.page ?? 1, 1);
  const offset = (page - 1) * perPage;

  const sortCol = SORTABLE[f.sort ?? ''] ?? 'id';
  const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  // Keep ORDER BY a plain indexed column: an expression like
  // `(col IS NULL) ASC, col DESC` forces a filesort over every matching row,
  // which at millions of rows per source ran for minutes. MariaDB already
  // sorts NULLs first, so DESC naturally puts empty values last; for ASC we
  // exclude them instead so the index is still usable.
  const orderBy = sortCol === 'id' ? `id ${dir}` : `${sortCol} ${dir}, id ${dir}`;
  const nullGuard = sortCol !== 'id' && dir === 'ASC' ? `${sortCol} IS NOT NULL` : null;
  const fullWhere = nullGuard
    ? (whereSql ? `${whereSql} AND ${nullGuard}` : `WHERE ${nullGuard}`)
    : whereSql;

  // Hard ceiling so a pathological sort/filter combination fails fast instead
  // of pinning a MySQL thread for minutes while the user waits.
  const rows = await query<Lead>(
    await withTimeout(ROWS_TIMEOUT_SECONDS, `SELECT id, source, company_name, domain, website_url, linkedin_url, twitter_url,
            facebook_url, crunchbase_url, logo_url, source_url, industry, category,
            country, country_code, state, city, employees, monthly_visits,
            monthly_sales_usd, tech_count, platform_rank, founded_year,
            revenue_usd, revenue_text, funding_usd, funding_text, growth_percent,
            contact_name, contact_title, contact_email, email_status, contact_phone,
            contact_linkedin_url, revenue_alt_usd, imported_at
     FROM leads ${fullWhere}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`),
    [...params, perPage, offset],
  );

  // Some filter combinations have no index that helps (e.g. country + "has
  // email"), and counting them can run for minutes. Cap the rows examined and
  // put a hard time limit on top; if either trips we report an approximate
  // total rather than making the page wait.
  let total = 0;
  let capped = false;
  try {
    const [{ n }] = await query<{ n: number }>(
      await withTimeout(COUNT_TIMEOUT_SECONDS,
        `SELECT COUNT(*) AS n FROM (SELECT 1 FROM leads ${fullWhere} LIMIT ${COUNT_CAP}) t`),
      params,
    );
    total = Number(n);
    capped = total >= COUNT_CAP;
  } catch {
    // Timed out: we know there is at least a full page, so keep paging usable.
    total = offset + rows.length + (rows.length === perPage ? perPage : 0);
    capped = true;
  }

  return { rows, total, capped, page, perPage };
}

export type FacetValue = { value: string; lead_count: number };

export async function getFacets() {
  const rows = await query<{ facet: string; value: string; lead_count: number }>(
    `SELECT facet, value, SUM(lead_count) AS lead_count
     FROM lead_facets GROUP BY facet, value ORDER BY lead_count DESC`,
  );
  const out: Record<string, FacetValue[]> = { source: [], industry: [], country: [], category: [] };
  for (const r of rows) {
    (out[r.facet] ??= []).push({ value: r.value, lead_count: Number(r.lead_count) });
  }
  return out;
}

/**
 * Read the per-source totals from the pre-computed facet table. Doing this as a
 * GROUP BY on `leads` scans every row and costs seconds on every page load.
 * Run `npm run db:facets` after an import to keep these current.
 */
export async function getStats() {
  const rows = await query<{ value: string; lead_count: number }>(
    `SELECT value, lead_count FROM lead_facets WHERE facet = 'source' ORDER BY lead_count DESC`,
  );
  return rows.map((r) => ({ source: r.value, count: Number(r.lead_count) }));
}
