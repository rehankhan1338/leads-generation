import { connect } from './scripts/lib/db.mjs';
const db = await connect();
const [[a]] = await db.query('SELECT COUNT(*) total, COUNT(DISTINCT id) ids FROM leads');
const [[b]] = await db.query('SELECT COUNT(*) c FROM (SELECT 1 FROM leads GROUP BY source, source_uid HAVING COUNT(*) > 1) t');
console.log('rows', a.total, 'distinct ids', a.ids, 'dup (source,source_uid) groups', b.c);
await db.end();
