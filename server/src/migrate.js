import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, '../migrations');
const LOCK_KEY = 727274; // arbitrary constant, serialises concurrent boots

/**
 * Minimal forward-only migration runner.
 * - every *.sql file in /migrations runs once, in filename order, inside a transaction
 * - an advisory lock makes it safe when several instances boot at the same time
 */
export async function migrate(pool, dir = MIGRATIONS_DIR) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info({ migration: file }, 'migration applied');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}
