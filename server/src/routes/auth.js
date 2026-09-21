import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import {
  clearAuthCookie,
  hashPassword,
  requireAuth,
  setAuthCookie,
  verifyPassword,
} from '../auth.js';
import { HttpError, validate, wrap } from '../http.js';
import { rateLimit } from '../rate-limit.js';

const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254);
const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

const registerSchema = z.object({
  email,
  password,
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(40, 'Name must be at most 40 characters'),
});
const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required') });

const publicUser = (row) => ({ id: row.id, email: row.email, name: row.name });

export function authRouter({ redis }) {
  const router = Router();
  const limiter = rateLimit({ name: 'auth', windowMs: 60_000, max: 20, redis });

  router.post(
    '/register',
    limiter,
    wrap(async (req, res) => {
      const body = validate(registerSchema, req.body);
      const passwordHash = await hashPassword(body.password);
      let user;
      try {
        const { rows } = await query(
          'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
          [body.email, body.name, passwordHash],
        );
        user = rows[0];
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, 'This email is already registered');
        throw err;
      }
      setAuthCookie(res, user);
      res.status(201).json({ user: publicUser(user) });
    }),
  );

  router.post(
    '/login',
    limiter,
    wrap(async (req, res) => {
      const body = validate(loginSchema, req.body);
      const { rows } = await query(
        'SELECT id, email, name, password_hash FROM users WHERE lower(email) = $1',
        [body.email],
      );
      const user = rows[0];
      const ok = await verifyPassword(body.password, user?.password_hash);
      if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
      setAuthCookie(res, user);
      res.json({ user: publicUser(user) });
    }),
  );

  router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  router.get(
    '/me',
    requireAuth,
    wrap(async (req, res) => {
      const { rows } = await query('SELECT id, email, name FROM users WHERE id = $1', [
        req.user.id,
      ]);
      if (!rows[0]) {
        clearAuthCookie(res);
        throw new HttpError(401, 'Not authenticated');
      }
      res.json({ user: publicUser(rows[0]) });
    }),
  );

  return router;
}
