import mysql from 'mysql2/promise';

declare global {
  var __leadsPool: mysql.Pool | undefined;
}

// Managed MySQL providers (DigitalOcean, Aiven, PlanetScale) require TLS and
// reject plain connections. Enable it whenever DB_SSL is set, or automatically
// when the host is not local.
const host = process.env.DB_HOST || '127.0.0.1';
const isLocal = host === '127.0.0.1' || host === 'localhost';
const useSsl = process.env.DB_SSL ? process.env.DB_SSL !== 'false' : !isLocal;

export const pool =
  global.__leadsPool ??
  mysql.createPool({
    host,
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'leads_db',
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 10,
    waitForConnections: true,
    charset: 'utf8mb4',
    dateStrings: true,
  });

if (process.env.NODE_ENV !== 'production') global.__leadsPool = pool;

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

let flavorPromise: Promise<'mariadb' | 'mysql'> | undefined;
/** Which server we are talking to; one query per process, cached. */
export async function flavor() {
  flavorPromise ??= pool
    .query<mysql.RowDataPacket[]>('SELECT VERSION() AS v')
    .then(([[r]]) => (/mariadb/i.test(String(r.v)) ? 'mariadb' : 'mysql'))
    .catch(() => { flavorPromise = undefined; return 'mysql' as const; });
  return flavorPromise;
}

/**
 * Wrap a SELECT so the server aborts it after `seconds`. MariaDB (local XAMPP)
 * uses SET STATEMENT; MySQL 8 (DigitalOcean) uses the MAX_EXECUTION_TIME hint
 * and rejects the MariaDB form with a parse error.
 */
export async function withTimeout(seconds: number, selectSql: string) {
  if ((await flavor()) === 'mariadb') {
    return `SET STATEMENT max_statement_time=${seconds} FOR ${selectSql}`;
  }
  return selectSql.replace(/^\s*SELECT\b/i, `SELECT /*+ MAX_EXECUTION_TIME(${seconds * 1000}) */`);
}
