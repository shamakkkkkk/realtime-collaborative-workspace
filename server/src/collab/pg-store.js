import * as Y from 'yjs';
import { withTx } from '../db.js';

/**
 * PostgreSQL persistence for CRDT documents.
 *
 *   board_updates   append-only log of (merged) Yjs updates
 *   board_snapshots one compacted state per board
 *
 * load    = snapshot + replay of the log, read in ONE repeatable-read transaction
 * append  = one INSERT per flush (also bumps boards.updated_at)
 * compact = folds log into snapshot from the database's own state (never from
 *           memory), guarded by an advisory lock, so it stays correct even when
 *           several server instances are running.
 */
export class PgStore {
  constructor(pool) {
    this.pool = pool;
  }

  async load(boardId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const snap = await client.query('SELECT state FROM board_snapshots WHERE board_id = $1', [
        boardId,
      ]);
      const ups = await client.query(
        'SELECT id, payload FROM board_updates WHERE board_id = $1 ORDER BY id',
        [boardId],
      );
      await client.query('COMMIT');
      return {
        snapshot: snap.rows[0] ? new Uint8Array(snap.rows[0].state) : null,
        updates: ups.rows.map((r) => ({ id: Number(r.id), payload: new Uint8Array(r.payload) })),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async append(boardId, payload) {
    const { rows } = await this.pool.query(
      `WITH ins AS (
         INSERT INTO board_updates (board_id, payload) VALUES ($1, $2) RETURNING id
       ), touch AS (
         UPDATE boards SET updated_at = now() WHERE id = $1
       )
       SELECT id FROM ins`,
      [boardId, Buffer.from(payload)],
    );
    return Number(rows[0].id);
  }

  async compact(boardId) {
    return withTx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [boardId]);
      const snap = await client.query('SELECT state FROM board_snapshots WHERE board_id = $1', [
        boardId,
      ]);
      const ups = await client.query(
        'SELECT id, payload FROM board_updates WHERE board_id = $1 ORDER BY id',
        [boardId],
      );
      if (ups.rows.length === 0) return 0;

      const doc = new Y.Doc();
      if (snap.rows[0]) Y.applyUpdate(doc, new Uint8Array(snap.rows[0].state));
      for (const row of ups.rows) Y.applyUpdate(doc, new Uint8Array(row.payload));
      const state = Buffer.from(Y.encodeStateAsUpdate(doc));
      doc.destroy();

      await client.query(
        `INSERT INTO board_snapshots (board_id, state, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (board_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
        [boardId, state],
      );
      // delete exactly the rows that were folded in (ids can commit out of order)
      await client.query('DELETE FROM board_updates WHERE id = ANY($1::bigint[])', [
        ups.rows.map((r) => r.id),
      ]);
      return ups.rows.length;
    }, this.pool);
  }
}
