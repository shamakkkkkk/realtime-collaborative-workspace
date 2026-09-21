import { query } from '../db.js';

/**
 * Resolves what `userId` may do with a board.
 * Returns { board, role } where role is 'owner' | 'editor' | 'viewer',
 * or null when the board does not exist or the user has no access.
 */
export async function getBoardAccess(boardId, userId) {
  const { rows } = await query(
    `SELECT b.id, b.owner_id, b.title, b.share_token, b.share_role, b.created_at, b.updated_at,
            CASE WHEN b.owner_id = $2 THEN 'owner' ELSE m.role END AS role
       FROM boards b
       LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = $2
      WHERE b.id = $1`,
    [boardId, userId],
  );
  const row = rows[0];
  if (!row || !row.role) return null;
  const { role, ...board } = row;
  return { board, role };
}
