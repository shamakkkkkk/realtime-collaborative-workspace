import * as Y from 'yjs';

/**
 * Batches the high-frequency stream of Yjs updates (dragging a shape produces
 * dozens per second) into few, merged database writes and periodically asks the
 * store to compact the log.
 */
export class Persistor {
  constructor({ boardId, store, logger, flushMs = 500, compactEvery = 200 }) {
    this.boardId = boardId;
    this.store = store;
    this.logger = logger;
    this.flushMs = flushMs;
    this.compactEvery = compactEvery;
    this.pending = [];
    this.timer = null;
    this.chain = Promise.resolve();
    this.sinceCompaction = 0;
  }

  /** Loads the persisted state into `doc`. */
  async load(doc, origin) {
    const { snapshot, updates } = await this.store.load(this.boardId);
    if (snapshot) Y.applyUpdate(doc, snapshot, origin);
    for (const u of updates) Y.applyUpdate(doc, u.payload, origin);
    this.sinceCompaction = updates.length;
  }

  push(update) {
    this.pending.push(update);
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.flushMs);
    }
  }

  /** Resolves once everything queued so far has been written. */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.chain = this.chain
      .then(() => this.#writePending())
      .catch((err) => this.logger.error({ err, boardId: this.boardId }, 'flush failed'));
    return this.chain;
  }

  async #writePending() {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    const merged = batch.length === 1 ? batch[0] : Y.mergeUpdates(batch);
    try {
      await this.store.append(this.boardId, merged);
      this.sinceCompaction += 1;
    } catch (err) {
      if (err.code === '23503') {
        // foreign-key violation: the board was deleted while we were holding it
        this.logger.warn({ boardId: this.boardId }, 'board no longer exists, dropping updates');
        this.discard();
        return;
      }
      // keep the data and retry shortly, the database may just be restarting
      this.logger.error({ err, boardId: this.boardId }, 'persisting update failed, will retry');
      this.pending.unshift(merged);
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.flush();
        }, 2000);
      }
      return;
    }
    if (this.sinceCompaction >= this.compactEvery) {
      try {
        await this.store.compact(this.boardId);
        this.sinceCompaction = 0;
      } catch (err) {
        this.logger.warn({ err, boardId: this.boardId }, 'compaction failed');
      }
    }
  }

  /** Final flush + compaction when a room is closed. */
  async close() {
    await this.flush();
    if (this.sinceCompaction > 0 && this.pending.length === 0) {
      try {
        await this.store.compact(this.boardId);
        this.sinceCompaction = 0;
      } catch (err) {
        this.logger.warn({ err, boardId: this.boardId }, 'final compaction failed');
      }
    }
  }

  /** Drop everything without touching the database (board was deleted). */
  discard() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = [];
  }
}
