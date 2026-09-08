import { flavor, query, withTimeout } from './db';

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

const LEAD_COLUMNS = `id, source, company_name, domain, website_url, linkedin_url, twitter_url,
            facebook_url, crunchbase_url, logo_url, source_url, industry, category,
            country, country_code, state, city, employees, monthly_visits,
            monthly_sales_usd, tech_count, platform_rank, founded_year,
            revenue_usd, revenue_text, funding_usd, funding_text, growth_percent,
            contact_name, contact_title, contact_email, email_status, contact_phone,
            contact_linkedin_url, revenue_alt_usd, imported_at`;

/**
 * Indexes that can serve each filter. Given any `ORDER BY id ... LIMIT n` the
 * MariaDB optimizer assumes it will find n matches almost immediately and walks
 * the PRIMARY key backwards testing every row — with a rare filter (Latka is
 * 47k of 16M rows, mostly the oldest ids) that means reading the whole 20 GB
 * table, which took minutes and pinned a pool connection. Handing it an
 * explicit list of candidate indexes takes that option off the table while
 * still letting it pick the best of the rest.
 */
const FILTER_INDEXES: Record<string, string[]> = {
  source: ['idx_source', 'idx_source_employees', 'idx_source_country_employees', 'idx_country', 'idx_industry', 'idx_category'],
  country: ['idx_country_only', 'idx_country_employees'],
  industry: ['idx_industry_only'],
  category: ['idx_category_only'],
  emailStatus: ['idx_email_status'],
};

const SORT_INDEXES: Record<string, string> = {
  revenue_usd: 'idx_revenue',
  funding_usd: 'idx_funding',
  growth_percent: 'idx_growth',
  employees: 'idx_employees',
  monthly_visits: 'idx_monthly_visits',
  tech_count: 'idx_tech_count',
  company_name: 'idx_company',
  source: 'idx_source',
  country: 'idx_country_only',
  industry: 'idx_industry_only',
};

const RANGE_INDEXES: [keyof LeadFilters, keyof LeadFilters | null, string][] = [
  ['revenueMin', 'revenueMax', 'idx_revenue'],
  ['fundingMin', 'fundingMax', 'idx_funding'],
  ['employeesMin', 'employeesMax', 'idx_employees'],
  ['visitsMin', 'visitsMax', 'idx_monthly_visits'],
  ['techMin', null, 'idx_tech_count'],
  ['growthMin', null, 'idx_growth'],
];

/**
 * Below this many candidate rows it is cheaper to read them all through the
 * filter index and sort, than to walk the sort index testing each row for the
 * filter. Latka (47k rows) sorted by company took 6.6 s via idx_company but
 * 0.2 s via idx_source; for StoreLeads (4.5M rows) it is the reverse.
 */
const SMALL_RESULT_SET = 100_000;

/** Facet counts, refreshed from lead_facets every few minutes, used to size the query plan. */
const FACET_CACHE_MS = 5 * 60_000;
let facetCountsCache: { at: number; counts: Record<string, Map<string, number>> } | undefined;
async function facetCounts() {
  if (facetCountsCache && Date.now() - facetCountsCache.at < FACET_CACHE_MS) return facetCountsCache.counts;
  const facets = await getFacets();
  const counts: Record<string, Map<string, number>> = {};
  for (const [facet, values] of Object.entries(facets)) {
    counts[facet] = new Map(values.map((v) => [v.value, v.lead_count]));
  }
  facetCountsCache = { at: Date.now(), counts };
  return counts;
}

/** Upper bound on matching rows from the facet filters alone, or null if none apply. */
async function estimateMatches(f: LeadFilters) {
  const active = (['source', 'industry', 'country', 'category'] as const).filter((k) => f[k]?.length);
  if (!active.length) return null;
  const counts = await facetCounts();
  let est = Infinity;
  for (const facet of active) {
    const m = counts[facet];
    if (!m) continue;
    est = Math.min(est, f[facet]!.reduce((sum, v) => sum + (m.get(v) ?? 0), 0));
  }
  return est === Infinity ? null : est;
}

/**
 * Index names present on the connected database. Not every environment has run
 * every migration, and FORCE INDEX with an unknown name is a hard error
 * (MySQL 1176), so hints are limited to what actually exists.
 */
let knownIndexes: Promise<Set<string>> | undefined;
function existingIndexes() {
  knownIndexes ??= query<{ index_name: string }>(
    `SELECT DISTINCT INDEX_NAME AS index_name FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'leads'`,
  )
    .then((rows) => new Set(rows.map((r) => r.index_name)))
    .catch(() => { knownIndexes = undefined; return new Set<string>(); });
  return knownIndexes;
}

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

async function indexHint(f: LeadFilters, sortCol: string, estimate: number | null) {
  const hints = new Set<string>();
  for (const [key, idx] of Object.entries(FILTER_INDEXES)) {
    if ((f[key as keyof LeadFilters] as string[] | undefined)?.length) idx.forEach((i) => hints.add(i));
  }
  for (const [min, max, idx] of RANGE_INDEXES) {
    if (f[min] != null || (max && f[max] != null)) hints.add(idx);
  }
  // Nothing selective to seek on: scanning in sort order is the right plan.
  if (hints.size === 0) return '';
  const sortIdx = SORT_INDEXES[sortCol];
  if (sortIdx && (estimate == null || estimate > SMALL_RESULT_SET)) hints.add(sortIdx);
  const known = await existingIndexes();
  const usable = [...hints].filter((i) => known.has(i));
  return usable.length ? `FORCE INDEX (${usable.join(', ')})` : '';
}

function pageBounds(f: LeadFilters) {
  const perPage = Math.min(Math.max(f.perPage ?? 50, 10), 200);
  const page = Math.max(f.page ?? 1, 1);
  return { perPage, page, offset: (page - 1) * perPage };
}

/** WHERE clause including the NULL guard the sort needs, so rows and count agree. */
function buildQueryShape(f: LeadFilters) {
  const { sql: whereSql, params } = buildWhere(f);

  // A text search with no explicit sort comes back in relevance order. Forcing
  // `ORDER BY id` on a fulltext match makes InnoDB materialise every hit first
  // (a common prefix like "shop*" matches millions) and ran for minutes.
  const relevance = Boolean(f.q?.trim()) && !f.sort;
  const sortCol = SORTABLE[f.sort ?? ''] ?? 'id';
  const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  // Keep ORDER BY a plain indexed column: an expression like
  // `(col IS NULL) ASC, col DESC` forces a filesort over every matching row,
  // which at millions of rows per source ran for minutes. MariaDB already
  // sorts NULLs first, so DESC naturally puts empty values last; for ASC we
  // exclude them instead so the index is still usable.
  const orderBy = relevance ? '' : `ORDER BY ${sortCol === 'id' ? `id ${dir}` : `${sortCol} ${dir}, id ${dir}`}`;
  const nullGuard = !relevance && sortCol !== 'id' && dir === 'ASC' ? `${sortCol} IS NOT NULL` : null;
  const fullWhere = nullGuard
    ? (whereSql ? `${whereSql} AND ${nullGuard}` : `WHERE ${nullGuard}`)
    : whereSql;

  return { fullWhere, params, orderBy, sortCol };
}

/** One page of leads. The total is deliberately separate — see `countLeads`. */
export async function searchLeads(f: LeadFilters) {
  const { fullWhere, params, orderBy, sortCol } = buildQueryShape(f);
  const { perPage, page, offset } = pageBounds(f);

  // Two steps: find the page of ids using only the index, then fetch the wide
  // rows by primary key. Sorting/skipping over 36 wide columns (20 GB table)
  // was 10-100x slower than doing the same over index entries.
  // Everything the query plan depends on, fetched together (all cached after
  // the first request, so this is normally free).
  const [estimate, known] = await Promise.all([estimateMatches(f), existingIndexes(), flavor()]);
  const hint = await indexHint(f, sortCol, estimate);

  // Sorting a 16M-row table on a column with no index means a filesort of the
  // whole table through the server's temp directory; on a managed database
  // that filled the disk and took the instance down. Refuse to sort that way
  // and fall back to newest-first until the index exists.
  const sortIdx = SORT_INDEXES[sortCol];
  if (sortIdx && known.size && !known.has(sortIdx)) {
    warnOnce(sortIdx, `[leads] sort by ${sortCol} ignored: index ${sortIdx} is missing on this database. Run scripts/add-indexes.mjs.`);
    return searchLeads({ ...f, sort: undefined, dir: undefined });
  }

  // Two statements on purpose. A single "derived table JOIN leads ORDER BY"
  // form was tried to save a round trip; MariaDB planned it well but MySQL 8
  // on production drove the join from the 16M-row side and filesorted the
  // whole table through temp disk until the volume was full. The id list is
  // tiny, so a second `WHERE id IN (...)` fetch is cheap and plan-proof.
  const run = async (forceIndex: string): Promise<Lead[]> => {
    const ids = (
      await query<{ id: number }>(
        await withTimeout(ROWS_TIMEOUT_SECONDS,
          `SELECT id FROM leads ${forceIndex} ${fullWhere} ${orderBy} LIMIT ? OFFSET ?`),
        [...params, perPage, offset],
      )
    ).map((r) => r.id);
    if (!ids.length) return [];
    const fetched = await query<Lead>(
      `SELECT ${LEAD_COLUMNS} FROM leads WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    // Restore page order (and fulltext relevance order) from the id list.
    const byId = new Map(fetched.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is Lead => r != null);
  };

  let rows: Lead[];
  try {
    rows = await run(hint);
  } catch (e) {
    // The server rejected the hint (an index we thought existed does not, or
    // its name is unusable here). Correct-but-slower beats an error page.
    if (!hint || (e as { errno?: number }).errno !== 1176) throw e;
    knownIndexes = undefined;
    rows = await run('');
  }

  return { rows, page, perPage };
}

/**
 * Total matches for the pagination footer. Some filter combinations have no
 * index that helps (e.g. source + "has email", or a common search prefix) and
 * counting them can run for minutes. Cap the rows examined and put a hard time
 * limit on top; if either trips we report an approximate total instead. This
 * is kept apart from `searchLeads` so the page can stream the rows immediately
 * and fill the total in when it arrives.
 */
export async function countLeads(f: LeadFilters, rowsOnPage: number | Promise<number>) {
  const { fullWhere, params } = buildQueryShape(f);
  const { perPage, offset } = pageBounds(f);
  try {
    const [{ n }] = await query<{ n: number }>(
      await withTimeout(COUNT_TIMEOUT_SECONDS,
        `SELECT COUNT(*) AS n FROM (SELECT 1 FROM leads ${fullWhere} LIMIT ${COUNT_CAP}) t`),
      params,
    );
    const total = Number(n);
    return { total, capped: total >= COUNT_CAP };
  } catch {
    // Timed out: we know there is at least this page, so keep paging usable.
    const n = await rowsOnPage;
    return { total: offset + n + (n === perPage ? perPage : 0), capped: true };
  }
}

export type FacetValue = { value: string; lead_count: number };

/**
 * Facets only change when `npm run db:facets` runs after an import, so hold
 * them in memory for a few minutes rather than paying a database round trip on
 * every page view. Shared with `getStats` and the query planner.
 */
let facetsCache: { at: number; promise: Promise<Record<string, FacetValue[]>> } | undefined;
export function getFacets() {
  if (facetsCache && Date.now() - facetsCache.at < FACET_CACHE_MS) return facetsCache.promise;
  const promise = query<{ facet: string; value: string; lead_count: number }>(
    `SELECT facet, value, SUM(lead_count) AS lead_count
     FROM lead_facets GROUP BY facet, value ORDER BY lead_count DESC`,
  ).then((rows) => {
    const out: Record<string, FacetValue[]> = { source: [], industry: [], country: [], category: [] };
    for (const r of rows) {
      (out[r.facet] ??= []).push({ value: r.value, lead_count: Number(r.lead_count) });
    }
    return out;
  });
  facetsCache = { at: Date.now(), promise };
  // Do not pin a failure in the cache.
  promise.catch(() => { if (facetsCache?.promise === promise) facetsCache = undefined; });
  return promise;
}

/**
 * Read the per-source totals from the pre-computed facet table. Doing this as a
 * GROUP BY on `leads` scans every row and costs seconds on every page load.
 * Run `npm run db:facets` after an import to keep these current.
 */
export async function getStats() {
  const facets = await getFacets();
  return (facets.source ?? [])
    .map((r) => ({ source: r.value, count: r.lead_count }))
    .sort((a, b) => b.count - a.count);
}
