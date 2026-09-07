/**
 * Rebuilds lead_facets so the filter dropdowns never GROUP BY the big table.
 * Run after every import:  node scripts/refresh-facets.mjs
 */
import { connect } from './lib/db.mjs';

const FACETS = [
  { facet: 'source',   col: 'source',   perSource: false },
  { facet: 'industry', col: 'industry', perSource: true },
  { facet: 'country',  col: 'country',  perSource: true },
  { facet: 'category', col: 'category', perSource: true },
];

const db = await connect();
try {
  for (const f of FACETS) {
    await db.query('DELETE FROM lead_facets WHERE facet = ?', [f.facet]);
    const src = f.perSource ? 'source' : "''";
    await db.query(
      `INSERT INTO lead_facets (facet, source, value, lead_count)
       SELECT ?, ${src}, ${f.col}, COUNT(*)
       FROM leads
       WHERE ${f.col} IS NOT NULL AND ${f.col} <> ''
       GROUP BY ${f.perSource ? 'source, ' : ''}${f.col}`,
      [f.facet],
    );
    const [[{ n }]] = await db.query('SELECT COUNT(*) n FROM lead_facets WHERE facet = ?', [f.facet]);
    console.log(`${f.facet.padEnd(10)} ${n} values`);
  }
} finally {
  await db.end();
}
