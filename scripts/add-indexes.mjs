/**
 * Adds the indexes from db/schema.sql to an existing `leads` table that was
 * copied without them (e.g. a remote dump import). Safe to re-run: indexes
 * that already exist are skipped.
 *   node scripts/add-indexes.mjs            # all indexes
 *   node scripts/add-indexes.mjs --no-unique  # skip PRIMARY/UNIQUE (duplicates present)
 */
import { connect } from './lib/db.mjs';

const skipUnique = process.argv.includes('--no-unique');

const INDEXES = [
  { name: 'PRIMARY',        ddl: 'ADD PRIMARY KEY (id)',                              unique: true },
  { name: 'uq_source_uid',  ddl: 'ADD UNIQUE KEY uq_source_uid (source, source_uid)', unique: true },
  { name: 'idx_source',     ddl: 'ADD KEY idx_source (source)' },
  { name: 'idx_company',    ddl: 'ADD KEY idx_company (company_name)' },
  { name: 'idx_domain',     ddl: 'ADD KEY idx_domain (domain)' },
  { name: 'idx_industry',   ddl: 'ADD KEY idx_industry (source, industry)' },
  { name: 'idx_country',    ddl: 'ADD KEY idx_country (source, country)' },
  { name: 'idx_revenue',    ddl: 'ADD KEY idx_revenue (revenue_usd)' },
  { name: 'idx_funding',    ddl: 'ADD KEY idx_funding (funding_usd)' },
  { name: 'idx_employees',  ddl: 'ADD KEY idx_employees (employees)' },
  { name: 'idx_growth',     ddl: 'ADD KEY idx_growth (growth_percent)' },
  { name: 'idx_email',      ddl: 'ADD KEY idx_email (contact_email)' },
  { name: 'ft_leads',       ddl: 'ADD FULLTEXT KEY ft_leads (company_name, domain, industry, contact_name)' },
  // From db/migrations/*.sql — the filter/sort indexes src/lib/leads.ts hints at.
  // Without them filtered pages fall back to slow plans (never to errors).
  { name: 'idx_monthly_visits', ddl: 'ADD KEY idx_monthly_visits (monthly_visits)' },
  { name: 'idx_tech_count',     ddl: 'ADD KEY idx_tech_count (tech_count)' },
  { name: 'idx_platform_rank',  ddl: 'ADD KEY idx_platform_rank (platform_rank)' },
  { name: 'idx_category',       ddl: 'ADD KEY idx_category (source, category)' },
  { name: 'idx_country_only',   ddl: 'ADD KEY idx_country_only (country)' },
  { name: 'idx_industry_only',  ddl: 'ADD KEY idx_industry_only (industry)' },
  { name: 'idx_category_only',  ddl: 'ADD KEY idx_category_only (category)' },
  { name: 'idx_email_status',   ddl: 'ADD KEY idx_email_status (email_status)' },
  { name: 'idx_country_employees',        ddl: 'ADD KEY idx_country_employees (country, employees)' },
  { name: 'idx_source_employees',         ddl: 'ADD KEY idx_source_employees (source, employees)' },
  { name: 'idx_source_country_employees', ddl: 'ADD KEY idx_source_country_employees (source, country, employees)' },
];

const db = await connect();
try {
  const [rows] = await db.query('SHOW INDEX FROM leads');
  const existing = new Set(rows.map((r) => r.Key_name));
  for (const ix of INDEXES) {
    if (existing.has(ix.name)) { console.log(`${ix.name.padEnd(16)} exists`); continue; }
    if (ix.unique && skipUnique) { console.log(`${ix.name.padEnd(16)} skipped (--no-unique)`); continue; }
    const t0 = Date.now();
    process.stdout.write(`${ix.name.padEnd(16)} creating... `);
    await db.query(`ALTER TABLE leads ${ix.ddl}`);
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} finally {
  await db.end();
}
