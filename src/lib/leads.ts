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
/**
 * Hard ceiling on how long a count may run before we fall back to an estimate.
 * The response stream stays open until the count settles, so this is also how
 * long the browser keeps "loading" after the rows are already on screen.
 */
export const COUNT_TIMEOUT_SECONDS = 1;
/**
 * How long the planned page query may run before we try a cheaper shape (see
 * `searchLeads`). A facet combined with a sort on a column the facet's rows
 * rarely populate can walk the whole sort index; measured at 14-20 s.
 */
export const ROWS_TIMEOUT_SECONDS = 3;
/** Ceiling on the fallback (default order) query; beyond this the request errors rather than hangs. */
export const FALLBACK_TIMEOUT_SECONDS = 15;

/** MariaDB `max_statement_time` (1969) and MySQL 8 `MAX_EXECUTION_TIME` (3024) both abort the statement. */
const isTimeout = (e: unknown) => {
  const errno = (e as { errno?: number }).errno;
  return errno === 1969 || errno === 3024;
};

/**
 * Text search shape. Words of three or more letters use the fulltext index;
 * anything shorter is a prefix match on the company name, which has a
 * B-tree index (fulltext needs whole tokens).
 */
function searchMode(q?: string): 'fulltext' | 'prefix' | null {
  const t = q?.trim();
  if (!t) return null;
  const tokens = t.split(/\s+/).filter((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length >= 3);
  return tokens.length ? 'fulltext' : 'prefix';
}

function buildWhere(f: LeadFilters) {
  const where: string[] = [];
  const params: unknown[] = [];

  const q = f.q?.trim();
  const mode = searchMode(q);
  if (q && mode === 'fulltext') {
    const tokens = q.split(/\s+/).filter((t) => t.replace(/[^\p{L}\p{N}]/gu, '').length >= 3);
    const expr = tokens
      .map((t) => `+${t.replace(/[+\-><()~*"@]/g, ' ').trim()}*`)
      .filter((t) => t.length > 2)
      .join(' ');
    if (expr) {
      where.push('MATCH (company_name, domain, industry, contact_name) AGAINST (? IN BOOLEAN MODE)');
      params.push(expr);
    }
  } else if (q && mode === 'prefix') {
    // While the user is still typing ("ab") the old `company LIKE 'ab%' OR
    // domain LIKE 'ab%'` made the optimizer sort-union two ~100k-entry index
    // ranges and filesort them (11 s per keystroke). A single prefix range on
    // idx_company, read in name order, is instant. Domains become searchable
    // once the third character arrives and the fulltext path takes over.
    where.push('company_name LIKE ?');
    params.push(`${q}%`);
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

/**
 * Composite indexes over facet pairs (db/migrations/006). Keyed by the two
 * facet names in FACET_KEYS order.
 */
const PAIR_INDEXES: Record<string, string> = {
  'industry|country': 'idx_country_industry',
  'country|category': 'idx_country_category',
  'industry|category': 'idx_industry_category',
};

/** The composite covering two of the active facets, if the database has one. */
function pairIndex(facets: FacetKey[], known: Set<string>) {
  for (let i = 0; i < facets.length; i++) {
    for (let j = i + 1; j < facets.length; j++) {
      const idx = PAIR_INDEXES[`${facets[i]}|${facets[j]}`];
      if (idx && known.has(idx)) return idx;
    }
  }
  return null;
}

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

const FACET_KEYS = ['source', 'industry', 'country', 'category'] as const;

type FacetKey = (typeof FACET_KEYS)[number];

/**
 * Rows matching each active facet filter on its own, from the facet table.
 * The smallest is the upper bound on the result set and names the index worth
 * seeking on.
 */
async function facetEstimates(f: LeadFilters) {
  const active = FACET_KEYS.filter((k) => f[k]?.length);
  const out = new Map<FacetKey, number>();
  if (!active.length) return out;
  const { totals } = await facetIndex();
  for (const facet of active) {
    const m = totals.get(facet);
    if (!m) continue;
    out.set(facet, f[facet]!.reduce((sum, v) => sum + (m.get(v) ?? 0), 0));
  }
  return out;
}

/**
 * Facet values mostly belong to one source: every industry like "Home &
 * Garden" and every platform is StoreLeads-only, Apollo has its own industry
 * list. `lead_facets` records which sources carry each value, so the filter
 * can be narrowed to those sources without changing what it matches. That
 * turns "country + platform" (no covering index, 13 s) into a lookup on the
 * existing (source, country) / (source, category) composites, and gives every
 * facet + sort pair a selective seek index. Between an import and the next
 * `npm run db:facets` a brand-new source's rows are invisible to this — the
 * same lag the header counts already have.
 */
async function narrowToSources(f: LeadFilters): Promise<{ filters: LeadFilters; empty: boolean }> {
  const active = FACET_KEYS.filter((k) => k !== 'source' && f[k]?.length);
  if (!active.length) return { filters: f, empty: false };
  const { totals, perSource } = await facetIndex();
  const allSources = [...(totals.get('source')?.keys() ?? [])];
  if (!allSources.length) return { filters: f, empty: false };

  let allowed = new Set(f.source?.length ? f.source : allSources);
  for (const facet of active) {
    const bySource = perSource.get(facet);
    if (!bySource) continue;
    const having = new Set<string>();
    for (const [src, m] of bySource) {
      if (f[facet]!.some((v) => m.has(v))) having.add(src);
    }
    allowed = new Set([...allowed].filter((s) => having.has(s)));
  }
  if (allowed.size === 0) return { filters: f, empty: true };
  if (!f.source?.length && allowed.size === allSources.length) return { filters: f, empty: false };
  if (f.source?.length && allowed.size === f.source.length) return { filters: f, empty: false };
  return { filters: { ...f, source: [...allowed] }, empty: false };
}

/** Upper bound on matching rows from the facet filters alone, or null if none apply. */
function smallestEstimate(estimates: Map<FacetKey, number>) {
  let est = Infinity;
  for (const n of estimates.values()) est = Math.min(est, n);
  return est === Infinity ? null : est;
}

/** The active range filter whose column we can sort by, if any (first wins). */
function activeRange(f: LeadFilters) {
  for (const [min, max, idx] of RANGE_INDEXES) {
    if (f[min] != null || (max && f[max] != null)) return { idx, col: RANGE_COLUMNS[idx] };
  }
  return null;
}

const RANGE_COLUMNS: Record<string, string> = {
  idx_revenue: 'revenue_usd',
  idx_funding: 'funding_usd',
  idx_employees: 'employees',
  idx_monthly_visits: 'monthly_visits',
  idx_tech_count: 'tech_count',
  idx_growth: 'growth_percent',
};

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
    .then((rows) => {
      const known = new Set(rows.map((r) => r.index_name));
      const missing = missingIndexes(known);
      if (known.size && missing.length) {
        warnOnce('missing-indexes', `[leads] this database lacks ${missing.length} of the indexes the filters rely on (${missing.join(', ')}). Filtered pages fall back to slow plans until \`node scripts/add-indexes.mjs\` is run against it.`);
      }
      return known;
    })
    .catch(() => { knownIndexes = undefined; return new Set<string>(); });
  return knownIndexes;
}

/** Every index the planner knows how to use, so a deployment can be checked against it. */
export function plannerIndexes() {
  const all = new Set<string>();
  Object.values(FILTER_INDEXES).flat().forEach((i) => all.add(i));
  Object.values(PAIR_INDEXES).forEach((i) => all.add(i));
  Object.values(SORT_INDEXES).forEach((i) => all.add(i));
  RANGE_INDEXES.forEach(([, , i]) => all.add(i));
  return [...all].sort();
}

export function missingIndexes(known: Set<string>) {
  return plannerIndexes().filter((i) => !known.has(i));
}

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

async function indexHint(f: LeadFilters, sortCol: string, estimates: Map<FacetKey, number>) {
  const hints = new Set<string>();

  // A range filter sorted by its own column is one index range read in order
  // (0-120 ms measured, with or without a facet on top); anything else the
  // optimizer might pick for it means a filesort or a row-by-row walk.
  const range = activeRange(f);
  if (range && range.col === sortCol) {
    const known = await existingIndexes();
    return known.has(range.idx) ? `FORCE INDEX (${range.idx})` : '';
  }

  const known = await existingIndexes();
  const facets = [...estimates.keys()];
  if (f.source?.length) {
    // Source's composites (source, country/industry/category) cover source +
    // one other facet exactly, so they always go in when source is filtered.
    FILTER_INDEXES.source.forEach((i) => hints.add(i));
  } else if (facets.length >= 2) {
    // Two facets and no source: only a composite over the pair is safe. Any
    // single-column index walks one facet's rows in id order testing the other
    // column row by row, and how soon it finds 50 matches depends entirely on
    // where the data sits (Sweden + Home & Garden: 11 s via the country index,
    // 0.3 s via the industry index; Sweden + WooCommerce the other way round).
    // Without the composite, leave the optimizer unhinted: it index-merges the
    // two single-column indexes, which is index-only and bounded by the
    // smaller list (0.2-0.6 s measured) instead of by luck.
    const pair = pairIndex(facets, known);
    if (pair) hints.add(pair);
    else return '';
  } else if (facets.length === 1) {
    FILTER_INDEXES[facets[0]]?.forEach((i) => hints.add(i));
  } else if (f.emailStatus?.length) {
    FILTER_INDEXES.emailStatus.forEach((i) => hints.add(i));
  }
  if (range) hints.add(range.idx);

  // Nothing selective to seek on: scanning in sort order is the right plan.
  if (hints.size === 0) return '';
  const estimate = smallestEstimate(estimates);
  const sortIdx = SORT_INDEXES[sortCol];
  if (sortIdx && (estimate == null || estimate > SMALL_RESULT_SET)) hints.add(sortIdx);
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
  const mode = searchMode(f.q);
  const relevance = mode === 'fulltext' && !f.sort;
  let sortCol = SORTABLE[f.sort ?? ''] ?? 'id';
  let dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  if (!f.sort) {
    const range = activeRange(f);
    if (mode === 'prefix') {
      // Prefix matches come straight off idx_company in name order; "newest
      // first" would filesort every match (100k+ for two letters).
      sortCol = 'company_name';
      dir = 'ASC';
    } else if (range) {
      // "Revenue over $1M" newest-first filesorted 1.6M index entries (0.4-1 s);
      // biggest-first is the index's own order and is what the filter implies.
      sortCol = range.col;
      dir = 'DESC';
    }
  }
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

export type LeadPage = {
  rows: Lead[];
  page: number;
  perPage: number;
  /** The requested sort was dropped because no index could serve it in time. */
  sortIgnored: boolean;
};

/** One page of leads. The total is deliberately separate — see `countLeads`. */
export async function searchLeads(input: LeadFilters): Promise<LeadPage> {
  const { perPage, page, offset } = pageBounds(input);
  const { filters: f, empty } = await narrowToSources(input);
  // The selected values live in sources that share no rows: nothing can match.
  if (empty) return { rows: [], page, perPage, sortIgnored: false };
  const { fullWhere, params, orderBy, sortCol } = buildQueryShape(f);

  // Two steps: find the page of ids using only the index, then fetch the wide
  // rows by primary key. Sorting/skipping over 36 wide columns (20 GB table)
  // was 10-100x slower than doing the same over index entries.
  // Everything the query plan depends on, fetched together (all cached after
  // the first request, so this is normally free).
  const [estimates, known] = await Promise.all([facetEstimates(f), existingIndexes(), flavor()]);
  const hint = await indexHint(f, sortCol, estimates);

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
  const run = async (forceIndex: string, seconds: number): Promise<Lead[]> => {
    const ids = (
      await query<{ id: number }>(
        await withTimeout(seconds,
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

  // A sort we already saw time out for these filters is not retried; go
  // straight to the default order so the second click is instant.
  const sortKey = f.sort ? slowSortKey(f, sortCol) : null;
  if (sortKey && slowSorts.has(sortKey)) {
    const fallback = await searchLeads({ ...f, sort: undefined, dir: undefined });
    return { ...fallback, sortIgnored: true };
  }

  let rows: Lead[];
  try {
    // Only a sorted page has a cheaper shape to fall back to, so only it gets
    // the short budget; everything else may run to the hard ceiling.
    rows = await run(hint, f.sort ? ROWS_TIMEOUT_SECONDS : FALLBACK_TIMEOUT_SECONDS);
  } catch (e) {
    if (hint && (e as { errno?: number }).errno === 1176) {
      // The server rejected the hint (an index we thought existed does not, or
      // its name is unusable here). Correct-but-slower beats an error page.
      knownIndexes = undefined;
      rows = await run('', FALLBACK_TIMEOUT_SECONDS);
    } else if (isTimeout(e) && sortKey) {
      // No index serves this facet + sort pair (e.g. an industry whose rows sit
      // at the far end of the revenue index): the walk was going to take 15 s
      // or more. The same filter in default order is a plain index seek, so
      // show that and tell the user the sort was dropped.
      slowSorts.add(sortKey);
      warnOnce(`slow-sort:${sortKey}`, `[leads] sort by ${sortCol} timed out after ${ROWS_TIMEOUT_SECONDS}s for filters ${sortKey}; serving default order for this combination from now on.`);
      const fallback = await searchLeads({ ...f, sort: undefined, dir: undefined });
      return { ...fallback, sortIgnored: true };
    } else {
      throw e;
    }
  }

  return { rows, page, perPage, sortIgnored: false };
}

/** Filter + sort combinations that timed out in this process (see `searchLeads`). */
const slowSorts = new Set<string>();
function slowSortKey(f: LeadFilters, sortCol: string) {
  const parts = [`sort=${sortCol}:${f.dir ?? 'desc'}`];
  for (const k of [...FACET_KEYS, 'emailStatus', 'has'] as const) {
    if (f[k]?.length) parts.push(`${k}=${[...f[k]!].sort().join(',')}`);
  }
  if (f.q?.trim()) parts.push('q');
  for (const [min, max] of RANGE_INDEXES) {
    if (f[min] != null) parts.push(`${min}=${f[min]}`);
    if (max && f[max] != null) parts.push(`${max}=${f[max]}`);
  }
  return parts.join('&');
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
  // Only the "nothing can match" part of the source narrowing helps here; the
  // narrowed predicate itself would make a two-facet count walk rows, where
  // the unhinted count index-merges the two single-column indexes (0.2 s).
  const { empty } = await narrowToSources(f);
  if (empty) return { total: 0, capped: false };
  // Facet-only filters have a pre-computed exact total; skip the database.
  const exact = await exactTotalFromFacets(f);
  if (exact != null) return { total: exact, capped: false };

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

/**
 * Exact match count from `lead_facets` when the filters are nothing but facet
 * values, which is most page views. The table stores every (facet, value)
 * count per source, so any single facet, and `source` combined with one other
 * facet, is a lookup; anything else (text search, ranges, "has" toggles, two
 * non-source facets) needs the real count. An ascending sort adds an
 * `IS NOT NULL` guard that the facets cannot see, so that also falls through.
 * Facets are rebuilt by `npm run db:facets`, so between an import and the next
 * rebuild this total lags exactly like the header counts do.
 */
async function exactTotalFromFacets(f: LeadFilters): Promise<number | null> {
  if (f.q?.trim() || f.emailStatus?.length || f.has?.length) return null;
  for (const [min, max] of RANGE_INDEXES) {
    if (f[min] != null || (max && f[max] != null)) return null;
  }
  const sortCol = SORTABLE[f.sort ?? ''] ?? 'id';
  if (sortCol !== 'id' && f.dir === 'asc') return null;

  const active = FACET_KEYS.filter((k) => f[k]?.length);
  const { totals, perSource } = await facetIndex();
  const sumOf = (m: Map<string, number> | undefined, values: string[]) =>
    values.reduce((sum, v) => sum + (m?.get(v) ?? 0), 0);

  if (active.length === 0) {
    let all = 0;
    for (const n of totals.get('source')?.values() ?? []) all += n;
    return all;
  }
  if (active.length === 1) return sumOf(totals.get(active[0]), f[active[0]]!);
  if (active.length === 2 && f.source?.length) {
    const other = active.find((k) => k !== 'source')!;
    const bySource = perSource.get(other);
    return f.source.reduce((sum, src) => sum + sumOf(bySource?.get(src), f[other]!), 0);
  }
  return null;
}

export type FacetValue = { value: string; lead_count: number };

type FacetIndex = {
  /** Dropdown options: per facet, values with their count summed over sources. */
  options: Record<string, FacetValue[]>;
  /** facet -> value -> count, for the planner and exact totals. */
  totals: Map<string, Map<string, number>>;
  /** facet -> source -> value -> count, for exact source+facet totals. */
  perSource: Map<string, Map<string, Map<string, number>>>;
};

/**
 * Facets only change when `npm run db:facets` runs after an import, so hold
 * them in memory for a few minutes rather than paying a database round trip on
 * every page view. Shared with `getStats`, the query planner and `countLeads`.
 */
const FACET_CACHE_MS = 5 * 60_000;
let facetsCache: { at: number; promise: Promise<FacetIndex> } | undefined;
function facetIndex() {
  if (facetsCache && Date.now() - facetsCache.at < FACET_CACHE_MS) return facetsCache.promise;
  const promise = query<{ facet: string; source: string; value: string; lead_count: number }>(
    `SELECT facet, source, value, lead_count FROM lead_facets`,
  ).then((rows) => {
    const totals = new Map<string, Map<string, number>>();
    const perSource = new Map<string, Map<string, Map<string, number>>>();
    for (const r of rows) {
      const n = Number(r.lead_count);
      let t = totals.get(r.facet);
      if (!t) totals.set(r.facet, (t = new Map()));
      t.set(r.value, (t.get(r.value) ?? 0) + n);
      let bySource = perSource.get(r.facet);
      if (!bySource) perSource.set(r.facet, (bySource = new Map()));
      let m = bySource.get(r.source);
      if (!m) bySource.set(r.source, (m = new Map()));
      m.set(r.value, (m.get(r.value) ?? 0) + n);
    }
    const options: Record<string, FacetValue[]> = { source: [], industry: [], country: [], category: [] };
    for (const [facet, m] of totals) {
      options[facet] = [...m]
        .map(([value, lead_count]) => ({ value, lead_count }))
        .sort((a, b) => b.lead_count - a.lead_count);
    }
    return { options, totals, perSource };
  });
  facetsCache = { at: Date.now(), promise };
  // Do not pin a failure in the cache.
  promise.catch(() => { if (facetsCache?.promise === promise) facetsCache = undefined; });
  return promise;
}

export function getFacets() {
  return facetIndex().then((i) => i.options);
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
