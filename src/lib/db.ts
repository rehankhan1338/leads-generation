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
