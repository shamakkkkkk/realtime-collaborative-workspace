import { Room } from './room.js';

/**
 * Keeps one in-memory Room (Y.Doc + awareness) per active board and closes it
 * after a grace period without connections.
 */
export class RoomManager {
  constructor({ store, pubsub = null, logger, idleMs = 30_000, flushMs, compactEvery }) {
    this.roomOptions = { store, pubsub, logger, flushMs, compactEvery };
    this.logger = logger;
    this.idleMs = idleMs;
    this.rooms = new Map(); // boardId -> Room
    this.closing = new Map(); // boardId -> Promise (room is being flushed and destroyed)
  }

  async acquire(boardId) {
    const closing = this.closing.get(boardId);
    if (closing) await closing; // never load while the previous copy is still flushing

    let room = this.rooms.get(boardId);
    if (!room) {
      room = new Room(boardId, this.roomOptions);
      room.ready = room.init();
      this.rooms.set(boardId, room);
      const created = room;
      created.ready.catch((err) => {
        this.logger.error({ err, boardId }, 'failed to load board');
        if (this.rooms.get(boardId) === created) this.rooms.delete(boardId);
        created.destroy({ persist: false }).catch(() => {});
      });
    }
    await room.ready;
    if (room.size === 0) this.#scheduleIdle(room); // cancelled by addConnection
    return room;
  }

  release(room) {
    if (room.size === 0) this.#scheduleIdle(room);
  }

  #scheduleIdle(room) {
    clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => this.#close(room), this.idleMs);
    room.idleTimer.unref?.();
  }

  #close(room) {
    if (room.size > 0 || this.rooms.get(room.id) !== room) return;
    this.rooms.delete(room.id);
    const promise = room
      .destroy()
      .catch((err) => this.logger.error({ err, boardId: room.id }, 'failed to close room'))
      .finally(() => this.closing.delete(room.id));
    this.closing.set(room.id, promise);
  }

  /** The board was deleted: disconnect everybody and forget the in-memory state. */
  async drop(boardId) {
    const room = this.rooms.get(boardId);
    if (!room) return;
    this.rooms.delete(boardId);
    for (const conn of room.conns) conn.close?.(4404, 'board deleted');
    await room.destroy({ persist: false }).catch(() => {});
  }

  stats() {
    let connections = 0;
    for (const room of this.rooms.values()) connections += room.size;
    return { rooms: this.rooms.size, connections };
  }

  async shutdown() {
    const rooms = [...this.rooms.values()];
    this.rooms.clear();
    await Promise.allSettled([
      ...rooms.map((room) => room.destroy()),
      ...this.closing.values(),
    ]);
  }
}
