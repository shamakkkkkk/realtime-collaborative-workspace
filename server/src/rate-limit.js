import { logger } from './logger.js';

/**
 * Fixed-window rate limiter. Uses Redis when available (shared between
 * instances) and falls back to process memory otherwise.
 */
export function rateLimit({ name, windowMs, max, redis = null }) {
  const memory = new Map(); // key -> { count, resetAt }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memory) if (entry.resetAt <= now) memory.delete(key);
  }, windowMs);
  sweep.unref();

  async function hit(key) {
    if (redis) {
      try {
        const redisKey = `rl:${name}:${key}`;
        const count = await redis.incr(redisKey);
        if (count === 1) await redis.pexpire(redisKey, windowMs);
        return count;
      } catch (err) {
        logger.warn({ err }, 'redis rate limiter failed, using memory');
      }
    }
    const now = Date.now();
    let entry = memory.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      memory.set(key, entry);
    }
    entry.count += 1;
    return entry.count;
  }

  const middleware = async (req, res, next) => {
    try {
      const count = await hit(req.ip);
      if (count > max) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({ error: 'Too many requests, please slow down' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
  middleware.hit = hit;
  return middleware;
}
