import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { HttpError } from './http.js';
import { authRouter } from './routes/auth.js';
import { boardsRouter } from './routes/boards.js';

export function createApp({ rooms, pubsub }) {
  const app = express();
  const redis = pubsub?.redis ?? null;
  const startedAt = Date.now();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render / Fly / Railway terminate TLS in front of us

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/healthz' },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  // Liveness + a few numbers that are nice to show in a demo.
  app.get('/healthz', async (req, res) => {
    let database = 'up';
    try {
      await pool.query('SELECT 1');
    } catch {
      database = 'down';
    }
    const body = {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      redis: pubsub ? pubsub.status() : 'disabled',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      ...rooms.stats(),
    };
    res.status(database === 'up' ? 200 : 503).json(body);
  });

  app.use('/api/auth', authRouter({ redis }));
  app.use('/api', boardsRouter({ rooms }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Built React app (single-service deployment).
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.clientDist, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (req, res) =>
      res.type('text').send('API is running. Start the client with `npm run dev`.'),
    );
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    req.log.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
