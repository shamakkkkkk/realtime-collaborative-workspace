import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, validate, wrap } from '../http.js';
import { getBoardAccess } from '../services/access.js';

const idSchema = z.string().uuid('Invalid board id');
const titleSchema = z.string().trim().min(1, 'Title is required').max(80);
const createSchema = z.object({ title: titleSchema.optional() });
const renameSchema = z.object({ title: titleSchema });
const shareSchema = z.object({ role: z.enum(['viewer', 'editor']) });

const boardDto = (board, role) => ({
  id: board.id,
  title: board.title,
  role,
  ownerId: board.owner_id,
  createdAt: board.created_at,
  updatedAt: board.updated_at,
  share:
    role === 'owner' && board.share_token
      ? { token: board.share_token, role: board.share_role }
      : null,
});

export function boardsRouter({ rooms }) {
  const router = Router();
  router.use(requireAuth);

  async function requireAccess(req, minRole = 'viewer') {
    const id = validate(idSchema, req.params.id);
    const access = await getBoardAccess(id, req.user.id);
    // 404 (not 403) so board ids cannot be probed
    if (!access) throw new HttpError(404, 'Board not found');
    const rank = { viewer: 0, editor: 1, owner: 2 };
    if (rank[access.role] < rank[minRole]) throw new HttpError(403, 'Not allowed');
    return access;
  }

  router.get(
    '/boards',
    wrap(async (req, res) => {
      const { rows } = await query(
        `SELECT b.id, b.title, b.created_at, b.updated_at, u.name AS owner_name,
                CASE WHEN b.owner_id = $1 THEN 'owner' ELSE m.role END AS role
           FROM boards b
           JOIN users u ON u.id = b.owner_id
           LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = $1
          WHERE b.owner_id = $1 OR m.user_id = $1
          ORDER BY b.updated_at DESC
          LIMIT 200`,
        [req.user.id],
      );
      res.json({
        boards: rows.map((r) => ({
          id: r.id,
          title: r.title,
          role: r.role,
          ownerName: r.owner_name,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    }),
  );

  router.post(
    '/boards',
    wrap(async (req, res) => {
      const body = validate(createSchema, req.body ?? {});
      const { rows } = await query(
        `INSERT INTO boards (owner_id, title) VALUES ($1, COALESCE($2, 'Untitled board'))
         RETURNING *`,
        [req.user.id, body.title ?? null],
      );
      res.status(201).json({ board: boardDto(rows[0], 'owner') });
    }),
  );

  router.get(
    '/boards/:id',
    wrap(async (req, res) => {
      const { board, role } = await requireAccess(req);
      res.json({ board: boardDto(board, role) });
    }),
  );

  router.patch(
    '/boards/:id',
    wrap(async (req, res) => {
      const { board } = await requireAccess(req, 'owner');
      const body = validate(renameSchema, req.body);
      await query('UPDATE boards SET title = $2, updated_at = now() WHERE id = $1', [
        board.id,
        body.title,
      ]);
      res.json({ ok: true, title: body.title });
    }),
  );

  router.delete(
    '/boards/:id',
    wrap(async (req, res) => {
      const { board } = await requireAccess(req, 'owner');
      await rooms.drop(board.id); // disconnect live collaborators first
      await query('DELETE FROM boards WHERE id = $1', [board.id]);
      res.json({ ok: true });
    }),
  );

  // --- sharing -----------------------------------------------------------------
  router.post(
    '/boards/:id/share',
    wrap(async (req, res) => {
      const { board } = await requireAccess(req, 'owner');
      const body = validate(shareSchema, req.body);
      const token = crypto.randomBytes(18).toString('base64url');
      await query('UPDATE boards SET share_token = $2, share_role = $3 WHERE id = $1', [
        board.id,
        token,
        body.role,
      ]);
      res.json({ share: { token, role: body.role } });
    }),
  );

  router.delete(
    '/boards/:id/share',
    wrap(async (req, res) => {
      const { board } = await requireAccess(req, 'owner');
      await query('UPDATE boards SET share_token = NULL, share_role = NULL WHERE id = $1', [
        board.id,
      ]);
      res.json({ ok: true });
    }),
  );

  router.post(
    '/join/:token',
    wrap(async (req, res) => {
      const token = validate(z.string().min(10).max(64), req.params.token);
      const { rows } = await query(
        'SELECT id, owner_id, share_role FROM boards WHERE share_token = $1',
        [token],
      );
      const board = rows[0];
      if (!board) throw new HttpError(404, 'This invite link is invalid or has been disabled');
      if (board.owner_id !== req.user.id) {
        // never downgrade an existing editor to viewer
        await query(
          `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)
           ON CONFLICT (board_id, user_id) DO UPDATE
             SET role = CASE WHEN board_members.role = 'editor' OR EXCLUDED.role = 'editor'
                             THEN 'editor' ELSE 'viewer' END`,
          [board.id, req.user.id, board.share_role],
        );
      }
      res.json({ boardId: board.id });
    }),
  );

  return router;
}
