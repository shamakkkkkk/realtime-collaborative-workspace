import { STATUS_CODES } from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { userFromCookieHeader } from '../auth.js';
import { getBoardAccess } from '../services/access.js';

const BOARD_PATH = /^\/ws\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const HEARTBEAT_MS = 30_000;
const MAX_MESSAGES_PER_SECOND = 1000;

function reject(socket, status) {
  socket.write(
    `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

/** Browsers always send Origin on WebSocket handshakes: only accept our own pages. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (tests, curl)
  try {
    if (new URL(origin).host === req.headers.host) return true;
  } catch {
    return false;
  }
  return config.allowedOrigins.includes(origin);
}

/**
 * Upgrades /ws/<boardId> requests to the collaboration protocol.
 * Authentication and authorisation happen during the HTTP handshake, so an
 * unauthorised client never gets a socket at all.
 */
export function attachCollabServer({ server, rooms, logger }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    handleUpgrade(req, socket, head).catch((err) => {
      logger.error({ err }, 'websocket upgrade failed');
      reject(socket, 500);
    });
  });

  async function handleUpgrade(req, socket, head) {
    const { pathname } = new URL(req.url, 'http://localhost');
    const match = pathname.match(BOARD_PATH);
    if (!match) return reject(socket, 404);
    if (!originAllowed(req)) return reject(socket, 403);

    const user = userFromCookieHeader(req.headers.cookie);
    if (!user) return reject(socket, 401);

    const boardId = match[1].toLowerCase();
    const access = await getBoardAccess(boardId, user.id);
    if (!access) return reject(socket, 403);

    // owners and editors may write, viewers are read-only
    const role = access.role === 'viewer' ? 'viewer' : 'editor';
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, { boardId, role, user }));
  }

  function onConnection(ws, { boardId, role, user }) {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    const conn = {
      role,
      user,
      clientIds: new Set(),
      send(bytes) {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(bytes, { binary: true }, (err) => {
          if (err) ws.terminate();
        });
      },
      close(code, reason) {
        ws.close(code, reason);
      },
    };

    let room = null;
    let closed = false;
    const queue = []; // messages that arrive while the board is still loading

    let budget = MAX_MESSAGES_PER_SECOND;
    const refill = setInterval(() => {
      budget = MAX_MESSAGES_PER_SECOND;
    }, 1000);

    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      if (--budget < 0) return ws.close(1008, 'rate limit exceeded');
      if (room) room.receive(conn, data);
      else queue.push(data);
    });

    ws.on('close', () => {
      closed = true;
      clearInterval(refill);
      if (room) {
        room.removeConnection(conn);
        rooms.release(room);
      }
    });

    ws.on('error', (err) => logger.debug({ err: err.message }, 'websocket error'));

    rooms
      .acquire(boardId)
      .then((acquired) => {
        if (closed) return;
        room = acquired;
        room.addConnection(conn);
        for (const data of queue.splice(0)) room.receive(conn, data);
      })
      .catch((err) => {
        logger.error({ err, boardId }, 'could not join room');
        ws.close(1011, 'internal error');
      });
  }

  // drop half-open connections (laptop lid closed, tunnel died, ...)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    wss,
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.close(1001, 'server shutting down');
      wss.close();
    },
  };
}
