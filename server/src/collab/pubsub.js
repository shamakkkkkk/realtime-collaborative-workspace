import crypto from 'node:crypto';
import { Redis } from 'ioredis';

export const PS_UPDATE = 0; // payload: Yjs update
export const PS_AWARENESS = 1; // payload: awareness update
export const PS_SYNC_REQUEST = 2; // payload: Yjs state vector ("send me what I am missing")

const channelOf = (boardId) => `workspace:board:${boardId}`;

/**
 * Redis pub/sub fan-out so that collaborators connected to DIFFERENT server
 * instances still see each other in real time.
 *
 * Wire format: [8 bytes instance id][1 byte type][payload]. A node ignores
 * messages it published itself. Delivery is at-most-once, which is fine for a
 * CRDT: any missed update is recovered by the next state-vector exchange.
 */
export function createPubSub({ url, logger }) {
  if (!url) return null;

  const instanceId = crypto.randomBytes(8);
  const redisOptions = { maxRetriesPerRequest: 1, commandTimeout: 3000 };
  const pub = new Redis(url, redisOptions);
  const sub = new Redis(url);
  const handlers = new Map(); // channel -> (type, payload) => void

  pub.on('error', (err) => logger.warn({ err: err.message }, 'redis(pub) error'));
  sub.on('error', (err) => logger.warn({ err: err.message }, 'redis(sub) error'));

  sub.on('messageBuffer', (channelBuf, message) => {
    const handler = handlers.get(channelBuf.toString());
    if (!handler || message.length < 9) return;
    if (message.subarray(0, 8).equals(instanceId)) return;
    try {
      handler(message[8], new Uint8Array(message.subarray(9)));
    } catch (err) {
      logger.warn({ err }, 'pubsub handler failed');
    }
  });

  return {
    redis: pub,
    subscribe(boardId, handler) {
      const channel = channelOf(boardId);
      handlers.set(channel, handler);
      // not awaited on purpose: ioredis re-subscribes automatically after reconnects
      sub.subscribe(channel).catch((err) => logger.warn({ err: err.message }, 'subscribe failed'));
    },
    unsubscribe(boardId) {
      const channel = channelOf(boardId);
      handlers.delete(channel);
      sub.unsubscribe(channel).catch(() => {});
    },
    publish(boardId, type, payload) {
      const message = Buffer.concat([instanceId, Buffer.from([type]), Buffer.from(payload)]);
      pub.publish(channelOf(boardId), message).catch((err) =>
        logger.warn({ err: err.message }, 'publish failed'),
      );
    },
    status: () => pub.status,
    async close() {
      pub.disconnect();
      sub.disconnect();
    },
  };
}
