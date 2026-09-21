import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Splash } from '../components/Splash.jsx';
import { createSession } from '../board/session.js';
import Workspace from '../board/Workspace.jsx';

export default function BoardPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setBoard(null);
    setError(null);
    api
      .get(`/api/boards/${id}`)
      .then((data) => !cancelled && setBoard(data.board))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The realtime session is created only after the server confirmed access.
  useEffect(() => {
    if (!board) return undefined;
    const s = createSession({ boardId: board.id, user });
    setSession(s);
    return () => {
      s.destroy();
      setSession(null);
    };
  }, [board?.id, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="splash">
        <h2>Board not available</h2>
        <p className="muted">{error.status === 404 ? 'It does not exist or you have no access.' : error.message}</p>
        <Link className="btn" to="/boards">Back to my boards</Link>
      </div>
    );
  }
  if (!board || !session) return <Splash message="Opening board…" />;

  return <Workspace board={board} setBoard={setBoard} session={session} user={user} />;
}
