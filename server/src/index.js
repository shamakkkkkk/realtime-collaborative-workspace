import http from 'node:http';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool, waitForDatabase } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { PgStore } from './collab/pg-store.js';
import { RoomManager } from './collab/manager.js';
import { createPubSub } from './collab/pubsub.js';
import { attachCollabServer } from './collab/ws.js';

async function main() {
  await waitForDatabase();
  await migrate(pool);

  const pubsub = createPubSub({ url: config.redisUrl, logger });
  const rooms = new RoomManager({ store: new PgStore(pool), pubsub, logger });
  const app = createApp({ rooms, pubsub });

  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000; // longer than typical load balancer idle timeouts
  server.headersTimeout = 66_000;
  const collab = attachCollabServer({ server, rooms, logger });

  await new Promise((resolve) => server.listen(config.port, '0.0.0.0', resolve));
  logger.info(
    { port: config.port, env: config.env, redis: pubsub ? 'enabled' : 'disabled' },
    'Server is running',
  );

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    try {
      collab.close();
      server.close();
      await rooms.shutdown(); // flushes every open board to PostgreSQL
      await pubsub?.close();
      await pool.end();
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
    }
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
