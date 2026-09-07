import {
  clean, truncate, parseInt0, parsePyList, titleCase, hostOf,
} from '../lib/normalize.mjs';

/**
 * Apollo organisation export -> unified lead row.
 *
 * Tab-separated, 51 columns, and roughly 10% of records are split across lines
 * by unquoted newlines inside the description fields — the reader is given
 * `expectFields: 51` to rejoin those. Snapshot dates from 2020.
 */
/**
 * A place name never contains digits, brackets, braces or quotes. When a row's
 * columns are shifted, dicts and lists land here — reject them rather than
 * pollute the country/state/city facets.
 */
const placeName = (v, max = 60) => {
  const s = clean(v);
  if (!s || s.length > max || /[0-9{}[\]"\n\t]/.test(s)) return null;
  return s;
};

export const apolloOrg = {
  source: 'apollo_org',
  delimiter: '\t',
  expectFields: 51,
  // Quotes in this export are literal text, never CSV quoting.
  quotes: false,

  map(r) {
    const id = clean(r.organization_id);
    // Apollo ids are 24-hex Mongo ObjectIds; anything else means the row's
    // columns are shifted (a record short of tabs swallowed its neighbour).
    if (!id || !/^[0-9a-f]{24}$/i.test(id)) return null;

    const domain = (clean(r.organization_domain) || clean(r.organization_domain_analyzed) || '')
      .replace(/^www\./i, '')
      .toLowerCase();

    const website = clean(r.organization_website_url);

    // A handful of rows carry an id and nothing else — no name, no domain.
    // They are unusable as leads, so drop them rather than fill the table.
    if (!clean(r.organization_name) && !domain && !website) return null;
    const linkedin = parsePyList(r.organization_linkedin_numerical_urls)[0] ?? null;
    const industries = parsePyList(r.organization_industries);
    const technologies = parsePyList(r.organization_current_technologies);

    // Apollo reports revenue in thousands.
    const revenueK = parseInt0(r.organization_revenue_in_thousands_int);

    const year = parseInt0(r.organization_founded_year);

    return {
      source: 'apollo_org',
      source_uid: truncate(id, 191),
      company_name: truncate(clean(r.organization_name), 255),
      domain: truncate(domain || hostOf(website), 191),
      website_url: truncate(website, 512),
      linkedin_url: truncate(linkedin, 512),
      twitter_url: truncate(clean(r.organization_twitter_url), 512),
      facebook_url: truncate(clean(r.organization_facebook_url), 512),
      crunchbase_url: null,
      logo_url: null,
      source_url: null,

      industry: truncate(titleCase(industries[0]), 128),
      category: null,
      // "California, US" is a shifted state_with_country, not a country.
      country: placeName(r.organization_hq_location_country)?.includes(',') ? null : placeName(r.organization_hq_location_country),
      country_code: null,
      state: placeName(r.organization_hq_location_state, 128),
      city: placeName(r.organization_hq_location_city, 128),

      employees: parseInt0(r.organization_num_current_employees),
      monthly_visits: null,
      monthly_sales_usd: null,
      tech_count: technologies.length || null,
      platform_rank: parseInt0(r.organization_alexa_ranking),
      // Guard against the odd corrupt row carrying a stray dict or bad year.
      founded_year: year && year >= 1600 && year <= 2100 ? year : null,

      revenue_usd: revenueK != null ? revenueK * 1000 : null,
      revenue_text: null,
      revenue_alt_usd: null,
      funding_usd: parseInt0(r.organization_total_funding_long),
      funding_text: null,
      growth_percent: null,

      contact_name: null,
      contact_title: null,
      contact_email: null,
      contact_phone: truncate(clean(r.organization_phone), 64),
      contact_linkedin_url: null,

      raw: JSON.stringify({
        industries,
        keywords: truncate(clean(r.organization_relevant_keywords_str), 400),
        technologies: technologies.slice(0, 40),
        short_description: truncate(clean(r.organization_short_description), 400),
        public_symbol: clean(r.organization_public_symbol),
        num_linkedin_followers: clean(r.organization_num_linkedin_followers),
        alexa_ranking: clean(r.organization_alexa_ranking),
        retail_location_count: clean(r.organization_retail_location_count),
        angellist_url: clean(r.organization_angellist_url),
        languages: parsePyList(r.organization_languages),
        postal_code: clean(r.organization_hq_location_postal_code),
        city_with_state: clean(r.organization_hq_location_city_with_state_or_country),
        latest_funding_stage_cd: clean(r.organization_latest_funding_stage_cd),
        latest_funding_round_date: clean(r.organization_latest_funding_round_date),
        job_functions: truncate(clean(r.job_functions), 300),
      }),
    };
  },
};
