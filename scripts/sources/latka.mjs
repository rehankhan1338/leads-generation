import { clean, truncate, parseMoney, parsePercent, sortUrls, hostOf, slugToName } from '../lib/normalize.mjs';

const EMPTY_FOUNDER = 'https://getlatka.com/people/';

/** getlatka.com SaaS export -> unified lead row. */
export const latka = {
  source: 'latka',

  map(r) {
    const latkaUrl = clean(r.latka_url);
    if (!latkaUrl) return null;

    // The three URL columns are unreliable: linkedin_url sometimes holds the
    // website, website_or_social_url often holds Crunchbase or Facebook.
    const urls = sortUrls([r.website_url, r.website_or_social_url, r.linkedin_url]);
    const twitter = clean(r.twitter_url) ?? urls.twitter;

    // Country name comes from the country page slug; the code from "(US)" style.
    const slug = (clean(r.country_page_url) || '')
      .replace(/^https?:\/\/getlatka\.com\/companies\/countries\//i, '')
      .replace(/\/regions\/?$/i, '')
      .replace(/\/$/, '');
    const loc = clean(r.location);
    const codeMatch = loc && loc.match(/^\(([A-Za-z]{2})\)$/);
    const country = slugToName(slug) || (codeMatch ? null : loc);

    // Fall back to the profile slug for a domain (it is usually the domain).
    const profileSlug = latkaUrl.split('/').pop() || '';
    const domain = hostOf(urls.website) || (profileSlug.includes('.') ? profileSlug.toLowerCase() : null);

    const founderUrl = clean(r.founder_latka_url);

    const revenue = parseMoney(r.revenue);
    const revenueAlt = parseMoney(r.revenue_alt);

    return {
      source: 'latka',
      source_uid: truncate(latkaUrl, 191),
      company_name: truncate(clean(r.company_name), 255),
      domain: truncate(domain, 191),
      website_url: truncate(urls.website, 512),
      linkedin_url: truncate(urls.linkedin, 512),
      twitter_url: truncate(twitter, 512),
      facebook_url: truncate(urls.facebook, 512),
      crunchbase_url: truncate(urls.crunchbase, 512),
      logo_url: truncate(clean(r.logo_url), 512),
      source_url: truncate(latkaUrl, 512),

      industry: truncate(clean(r.industry), 128),
      category: null,
      country: truncate(country, 96),
      country_code: codeMatch ? codeMatch[1].toUpperCase() : null,
      state: null,
      city: null,

      employees: null,
      founded_year: null,
      // `revenue` is blank on many rows that still carry `revenue_alt`; treat
      // whichever exists as the canonical figure so range filters stay usable.
      revenue_usd: revenue ?? revenueAlt,
      revenue_text: truncate(clean(r.revenue) ?? clean(r.revenue_alt), 32),
      revenue_alt_usd: revenue != null ? revenueAlt : null,
      funding_usd: parseMoney(r.funding),
      funding_text: truncate(clean(r.funding), 32),
      growth_percent: parsePercent(r.growth_percent),

      contact_name: truncate(clean(r.founder_name), 191),
      contact_title: clean(r.founder_name) ? 'Founder' : null,
      contact_email: null,
      contact_phone: null,
      contact_linkedin_url: null,

      raw: JSON.stringify({
        latka_url: latkaUrl,
        founder_latka_url: founderUrl === EMPTY_FOUNDER ? null : founderUrl,
        location: loc,
        country_page_url: clean(r.country_page_url),
        industry_page_url: clean(r.industry_page_url),
        revenue: clean(r.revenue),
        revenue_alt: clean(r.revenue_alt),
      }),
    };
  },
};
