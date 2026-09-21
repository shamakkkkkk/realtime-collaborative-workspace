import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import { config } from './config.js';

export const COOKIE_NAME = 'session';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const BCRYPT_COST = 11;

// Compared against when the e-mail is unknown, so response time does not leak
// which addresses are registered.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash ?? DUMMY_HASH);

export function signToken(user) {
  return jwt.sign({ name: user.name, email: user.email }, config.jwtSecret, {
    subject: user.id,
    expiresIn: TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return { id: payload.sub, name: payload.name, email: payload.email };
  } catch {
    return null;
  }
}

/** Works for both Express requests and raw WebSocket upgrade requests. */
export function userFromCookieHeader(header) {
  if (!header) return null;
  const token = parseCookie(header)[COOKIE_NAME];
  return token ? verifyToken(token) : null;
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
});

export function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), {
    ...cookieOptions(),
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

export function requireAuth(req, res, next) {
  const user = userFromCookieHeader(req.headers.cookie);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}
