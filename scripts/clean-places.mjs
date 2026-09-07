/**
 * Null out shifted-column place values after an Apollo import.
 *
 * Roughly 1% of Apollo rows arrive with their columns shifted, which puts
 * cities, states, job titles and Python dicts into `country`. The adapters
 * reject the obviously malformed ones, but plain text ("England", "Paris")
 * cannot be told apart from a country without a reference set — so we use the
 * countries already present in the *other* sources as that reference.
 *
 * Drives the UPDATE from lead_facets (small) via idx_country_only, so it
 * touches only the affected rows instead of scanning the table.
 *
 *   node scripts/clean-places.mjs            # clean apollo_org and apollo_people
 *   node scripts/clean-places.mjs apollo_org # one source
 *
 * Run `npm run db:facets` first (it needs current facet values), and again after.
 */
import { connect } from './lib/db.mjs';

const ALL = ['apollo_org', 'apollo_people'];
const targets = process.argv.slice(2).filter((s) => ALL.includes(s));
const sources = targets.length ? targets : ALL;

const db = await connect();
try {
  for (const source of sources) {
    const reference = ['latka', 'storeleads', ...ALL.filter((s) => s !== source)];
    const [res] = await db.query(
      `SET STATEMENT max_statement_time=1800 FOR
       UPDATE leads l
       JOIN lead_facets f
         ON f.facet = 'country' AND f.source = ? AND f.value = l.country
       LEFT JOIN (SELECT DISTINCT value FROM lead_facets
                  WHERE facet = 'country' AND source IN (?)) ok
         ON ok.value = f.value
       SET l.country = NULL, l.state = NULL, l.city = NULL
       WHERE l.source = ?
         AND (ok.value IS NULL OR f.value LIKE '%,%' OR f.value REGEXP '[0-9{}\\\\[\\\\]"]')`,
      [source, reference, source],
    );
    console.log(`${source.padEnd(14)} cleaned ${res.affectedRows.toLocaleString()} rows`);
  }
} finally {
  await db.end();
}
