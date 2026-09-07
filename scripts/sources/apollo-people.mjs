import {
  clean, truncate, parseInt0, parsePyList, titleCase, placeName,
} from '../lib/normalize.mjs';

/** Free/consumer mailbox domains are not the person's employer. */
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com',
  'live.com', 'msn.com', 'me.com', 'mail.com', 'gmx.com', 'protonmail.com',
  'yandex.ru', 'qq.com', '163.com', '126.com', 'comcast.net', 'sbcglobal.net',
]);

/**
 * Apollo person export -> unified lead row.
 *
 * Tab-separated, 39 columns. These are contact-level records, so the person
 * fields carry the value and the company side is just a name. `raw` is kept
 * deliberately small: at 93M rows every 100 bytes is another ~9 GB on disk.
 */
export const apolloPeople = {
  source: 'apollo_people',
  delimiter: '\t',
  expectFields: 39,
  // Quotes in this export are literal text, never CSV quoting.
  quotes: false,

  map(r) {
    const id = clean(r._id);
    // 24-hex ObjectId; anything else means this row's columns are shifted.
    if (!id || !/^[0-9a-f]{24}$/i.test(id)) return null;

    const name = clean(r.person_name);
    const email = clean(r.person_email);
    if (!name && !email) return null;

    // The employer domain is not a column, but the work email implies it and
    // it is what lets these rows line up with the organisation records.
    const emailDomain = email && email.includes('@')
      ? email.split('@').pop().toLowerCase().replace(/^www\./, '')
      : null;
    const domain = emailDomain && !CONSUMER_DOMAINS.has(emailDomain) ? emailDomain : null;

    const linkedin = clean(r.person_linkedin_url);
    const confidence = clean(r.person_extrapolated_email_confidence);

    return {
      source: 'apollo_people',
      source_uid: truncate(id, 191),
      company_name: truncate(titleCase(clean(r.sanitized_organization_name_unanalyzed)), 255),
      domain: truncate(domain, 191),
      website_url: domain ? `https://${domain}` : null,
      linkedin_url: null,
      twitter_url: null,
      facebook_url: null,
      crunchbase_url: null,
      logo_url: null,
      source_url: null,

      industry: null,
      // Seniority is the most useful facet on contact records.
      category: truncate(titleCase(clean(r.person_seniority)), 128),
      country: placeName(r.person_location_country)?.includes(',') ? null : placeName(r.person_location_country),
      country_code: null,
      state: placeName(r.person_location_state, 128),
      city: placeName(r.person_location_city, 128),

      employees: null,
      monthly_visits: null,
      monthly_sales_usd: null,
      tech_count: null,
      platform_rank: null,
      founded_year: null,

      revenue_usd: null,
      revenue_text: null,
      revenue_alt_usd: null,
      funding_usd: null,
      funding_text: null,
      growth_percent: null,

      contact_name: truncate(name, 191),
      contact_title: truncate(clean(r.person_title), 191),
      contact_email: truncate(email, 255),
      // "Extrapolated" means Apollo guessed the address rather than verifying it.
      email_status: truncate(clean(r.person_email_status_cd), 16),
      contact_phone: truncate(clean(r.person_sanitized_phone) || clean(r.person_phone), 64),
      contact_linkedin_url: truncate(linkedin, 512),

      raw: JSON.stringify({
        // "Extrapolated" means Apollo guessed the address rather than verifying
        // it — the single most important quality signal on this source.
        email_status: clean(r.person_email_status_cd),
        email_confidence: confidence ? Number(confidence) : null,
        seniority: clean(r.person_seniority),
        functions: clean(r.person_functions),
        title_normalized: clean(r.person_title_normalized),
        org_ids: parsePyList(r.current_organization_ids),
        linkedin_connections: parseInt0(r.person_num_linkedin_connections),
        job_start_date: clean(r.job_start_date),
        postal_code: clean(r.person_location_postal_code),
      }),
    };
  },
};
