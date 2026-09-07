/** Shared field cleaners used by every platform adapter. */

export const clean = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === '-' || s === 'N/A' || s === 'null' || s === 'undefined') return null;
  return s;
};

export const truncate = (v, n) => (v == null ? null : (v.length > n ? v.slice(0, n) : v));

/** "$54M" -> 54000000, "$571.4K" -> 571400, "$1.2B" -> 1200000000 */
export function parseMoney(v) {
  const s = clean(v);
  if (!s) return null;
  const m = s.replace(/[$,\s]/g, '').match(/^(-?\d+(?:\.\d+)?)([KkMmBb])?$/);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] ?? 1;
  const n = Math.round(parseFloat(m[1]) * mult);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "400.00%" -> 400.00 ; "Neg" -> null */
export function parsePercent(v) {
  const s = clean(v);
  if (!s) return null;
  const m = s.replace(/[,\s]/g, '').match(/^(-?\d+(?:\.\d+)?)%?$/);
  return m ? parseFloat(m[1]) : null;
}

export function parseInt0(v) {
  const s = clean(v);
  if (!s) return null;
  const n = parseInt(s.replace(/[,\s]/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function hostOf(url) {
  const s = clean(url);
  if (!s) return null;
  try {
    return new URL(s.startsWith('http') ? s : `https://${s}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch { return null; }
}

/** Buckets a URL by the site it points at. */
export function classifyUrl(url) {
  const h = hostOf(url);
  if (!h) return null;
  if (h.endsWith('linkedin.com')) return 'linkedin';
  if (h.endsWith('facebook.com')) return 'facebook';
  if (h.endsWith('twitter.com') || h === 'x.com' || h.endsWith('.x.com')) return 'twitter';
  if (h.endsWith('crunchbase.com')) return 'crunchbase';
  if (h.endsWith('getlatka.com')) return 'source';
  return 'website';
}

/**
 * Source exports mix websites and socials into the same columns, so we sort a
 * list of URLs into named buckets rather than trusting the column name.
 */
export function sortUrls(urls) {
  const out = { linkedin: null, facebook: null, twitter: null, crunchbase: null, website: null };
  for (const u of urls) {
    const kind = classifyUrl(u);
    if (!kind || kind === 'source') continue;
    if (!out[kind]) out[kind] = clean(u);
  }
  return out;
}

const SMALL_WORDS = new Set(['and', 'of', 'the', 'da', 'de']);

/** "united-states" -> "United States" */
export function slugToName(slug) {
  const s = clean(slug);
  if (!s) return null;
  return s
    .split('-')
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** "USD $733,248,619.56" / "$1,234.50" -> 733248619 / 1234 */
export function parseCurrency(v) {
  const s = clean(v);
  if (!s) return null;
  const m = s.replace(/[A-Z]{3}\s*/i, '').replace(/[$,\s]/g, '').match(/^(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[1]));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** StoreLeads packs repeated values into colon-separated lists. */
export function firstOf(v, sep = ':') {
  const s = clean(v);
  if (!s) return null;
  return clean(s.split(sep)[0]);
}

export function countOf(v, sep = ':') {
  const s = clean(v);
  return s ? s.split(sep).filter(Boolean).length : 0;
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/** "US" -> "United States", using the ICU data built into Node. */
export function countryFromCode(code) {
  const s = clean(code);
  if (!s || !/^[A-Za-z]{2}$/.test(s)) return null;
  try {
    const name = REGION_NAMES.of(s.toUpperCase());
    return name && name !== s.toUpperCase() ? name : null;
  } catch { return null; }
}

/** Apollo serialises lists as Python literals: "['a', 'b']" -> ['a','b'] */
export function parsePyList(v) {
  const s = clean(v);
  if (!s || !s.startsWith('[')) return [];
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(s))) out.push((m[1] ?? m[2]).replace(/\\(.)/g, '$1'));
  return out;
}

/** "international affairs" -> "International Affairs" */
export function titleCase(v) {
  const s = clean(v);
  if (!s) return null;
  return s.replace(/\S+/g, (w) => (SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)));
}

/**
 * A place name never contains digits, brackets, braces or quotes. Shifted rows
 * put dicts, lists and job titles into country/state/city; reject those.
 * Plain-text junk (a city in the country column) still gets through — the
 * post-import cleanup in the README handles that via the facet table.
 */
export function placeName(v, max = 60) {
  const s = clean(v);
  if (!s || s.length > max || /[0-9{}[\]"\n\t]/.test(s)) return null;
  return s;
}
