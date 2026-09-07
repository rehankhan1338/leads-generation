import {
  clean, truncate, parseInt0, parseCurrency, firstOf, countryFromCode,
} from '../lib/normalize.mjs';

/**
 * StoreLeads ecommerce export -> unified lead row.
 *
 * 140 source columns, so only the fields worth filtering or displaying are
 * promoted to real columns; a curated subset goes to `raw`. Storing all 140
 * as JSON would roughly double the table size for millions of rows.
 */
export const storeleads = {
  source: 'storeleads',

  map(r) {
    const domain = (clean(r.domain) || '').replace(/^www\./i, '').toLowerCase();
    if (!domain) return null;

    // "/Pets & Animals/Dogs" -> "Pets & Animals"; lists are colon-separated.
    const categoryPath = firstOf(r.categories, ':') || '';
    const industry = categoryPath.split('/').filter(Boolean)[0] || null;

    const code = clean(r.country_code);

    return {
      source: 'storeleads',
      source_uid: truncate(domain, 191),
      company_name: truncate(clean(r.merchant_name) || clean(r.title), 255),
      domain: truncate(domain, 191),
      website_url: truncate(clean(r.domain_url) || `https://${domain}`, 512),
      linkedin_url: truncate(clean(r.linkedin_url), 512),
      twitter_url: truncate(clean(r.twitter_url), 512),
      facebook_url: truncate(clean(r.facebook_url), 512),
      crunchbase_url: null,
      logo_url: truncate(clean(r.favicon_url), 512),
      source_url: null,

      industry: truncate(industry, 128),
      // The ecommerce platform is the most useful extra facet in this export.
      category: truncate(clean(r.platform), 128),
      country: truncate(countryFromCode(code), 96),
      country_code: code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null,
      state: truncate(clean(r.state), 128),
      city: truncate(clean(r.city), 128),

      employees: parseInt0(r.employee_count),
      monthly_visits: parseInt0(r.estimated_monthly_visits),
      monthly_sales_usd: parseCurrency(r.estimated_monthly_sales),
      tech_count: parseInt0(r.technologies_count),
      platform_rank: parseInt0(r.platform_rank),
      founded_year: null,

      revenue_usd: parseCurrency(r.estimated_yearly_sales),
      revenue_text: truncate(clean(r.estimated_yearly_sales), 32),
      revenue_alt_usd: null,
      funding_usd: null,
      funding_text: null,
      growth_percent: null,

      contact_name: null,
      contact_title: null,
      // Both fields are colon-separated lists; the rest are kept in `raw`.
      contact_email: truncate(firstOf(r.emails), 255),
      contact_phone: truncate(firstOf(r.phones), 64),
      contact_linkedin_url: null,

      raw: JSON.stringify({
        platform_version: clean(r.platform_version),
        theme: clean(r.theme),
        rank: clean(r.rank),
        categories: clean(r.categories),
        currency: clean(r.currency),
        language_code: clean(r.language_code),
        region: clean(r.region),
        subregion: clean(r.subregion),
        created: clean(r.created),
        status: clean(r.status),
        title: truncate(clean(r.title), 200),
        emails: clean(r.emails),
        phones: clean(r.phones),
        instagram_url: clean(r.instagram_url),
        tiktok_url: clean(r.tiktok_url),
        youtube_url: clean(r.youtube_url),
        pinterest_url: clean(r.pinterest_url),
        sales_channels: clean(r.sales_channels),
        shipping_carriers: clean(r.shipping_carriers),
        installed_apps_count: clean(r.installed_apps_count),
        installed_apps_names: truncate(clean(r.installed_apps_names), 300),
        technologies: truncate(clean(r.technologies), 400),
        company_location: clean(r.company_location),
        street_address: clean(r.street_address),
        zip: clean(r.zip),
        contact_page_url: clean(r.contact_page_url),
        about_us_url: clean(r.about_us_url),
      }),
    };
  },
};
