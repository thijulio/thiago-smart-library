import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { readRuntimeConfig } from '../core/config';
import { createProductAuth } from '../core/auth';

export function productRuntime() {
  const config = readRuntimeConfig(process.env);
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 3,
    connectionTimeoutMillis: 10000,
  });
  // Pool errors must never log credential-bearing driver details.
  pool.on('error', () => {});
  return { pool, auth: createProductAuth(pool, config) };
}
