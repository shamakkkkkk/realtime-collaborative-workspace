import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

// One .env in the repository root is shared by the server and docker compose.
dotenv.config({ path: path.resolve(here, '../../.env') });

const bool = (fallback) =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z
    .string()
    .default('postgres://workspace:workspace@localhost:5432/workspace'),
  DATABASE_SSL: bool('false'),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  COOKIE_SECURE: bool('false').optional(),
  ALLOWED_ORIGINS: z.string().default(''),
  CLIENT_DIST: z.string().optional(),
});

// Empty values in .env files ("REDIS_URL=") are treated as "not set".
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = schema.safeParse(raw);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  console.error('JWT_SECRET must be set to at least 32 characters in production.');
  process.exit(1);
}

export const config = {
  env: env.NODE_ENV,
  isProd,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  databaseSsl: env.DATABASE_SSL,
  redisUrl: env.REDIS_URL,
  jwtSecret: env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  cookieSecure: env.COOKIE_SECURE ?? isProd,
  allowedOrigins: env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  clientDist: path.resolve(env.CLIENT_DIST ?? path.join(here, '../../client/dist')),
};
