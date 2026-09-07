import type { LeadFilters } from './leads';

export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined): string[] | undefined => {
  if (v == null) return undefined;
  const list = (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
};
const num = (v: string | string[] | undefined) => {
  const s = one(v);
  if (s == null || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export function parseFilters(sp: RawParams): LeadFilters {
  return {
    q: one(sp.q) || undefined,
    source: many(sp.source),
    industry: many(sp.industry),
    country: many(sp.country),
    category: many(sp.category),
    emailStatus: many(sp.emailStatus),
    revenueMin: num(sp.revenueMin),
    revenueMax: num(sp.revenueMax),
    fundingMin: num(sp.fundingMin),
    fundingMax: num(sp.fundingMax),
    employeesMin: num(sp.employeesMin),
    employeesMax: num(sp.employeesMax),
    visitsMin: num(sp.visitsMin),
    visitsMax: num(sp.visitsMax),
    techMin: num(sp.techMin),
    growthMin: num(sp.growthMin),
    has: many(sp.has),
    sort: one(sp.sort) || undefined,
    dir: one(sp.dir) === 'asc' ? 'asc' : 'desc',
    page: num(sp.page) || 1,
    perPage: num(sp.perPage) || 50,
  };
}

/** Number of filters in play, for the "clear all" affordance. */
export function activeFilterCount(f: LeadFilters) {
  let n = 0;
  if (f.q) n++;
  n += f.source?.length ?? 0;
  n += f.industry?.length ?? 0;
  n += f.country?.length ?? 0;
  n += f.category?.length ?? 0;
  n += f.emailStatus?.length ?? 0;
  n += f.has?.length ?? 0;
  for (const k of ['revenueMin', 'revenueMax', 'fundingMin', 'fundingMax', 'employeesMin', 'employeesMax', 'growthMin', 'visitsMin', 'visitsMax', 'techMin'] as const) {
    if (f[k] != null) n++;
  }
  return n;
}

export function formatMoney(n: number | null | undefined) {
  if (n == null) return null;
  if (n >= 1e9) return `$${trim(n / 1e9)}B`;
  if (n >= 1e6) return `$${trim(n / 1e6)}M`;
  if (n >= 1e3) return `$${trim(n / 1e3)}K`;
  return `$${n}`;
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

export const formatNumber = (n: number) => n.toLocaleString('en-US');
