import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icons.jsx';
import { hashString } from '../board/geometry.js';

function timeAgo(iso) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of units) if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  return 'just now';
}

function Preview({ id }) {
  const h = hashString(id);
  const hue = h % 360;
  const note = (i, left, top, rot) => (
    <i key={i} style={{ left: `${left}%`, top: `${top}%`, transform: `rotate(${rot}deg)`, background: `hsl(${(hue + i * 55) % 360} 85% 70%)` }} />
  );
  return (
    <div className="preview" style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 16%), hsl(${(hue + 60) % 360} 60% 10%))` }}>
      {note(0, 12 + (h % 10), 18, -6)}
      {note(1, 42 + ((h >> 3) % 10), 40, 4)}
      {note(2, 64 + ((h >> 5) % 8), 14, -3)}
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api.get('/api/boards').then((d) => setBoards(d.boards)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      const data = await api.post('/api/boards', {});
      navigate(`/b/${data.board.id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (board) => {
    if (!window.confirm(`Delete "${board.title}" for everyone? This cannot be undone.`)) return;
    try {
      await api.del(`/api/boards/${board.id}`);
      setBoards((list) => list.filter((b) => b.id !== board.id));
    } catch (e) {
      setError(e.message);
    }
  };

  const mine = boards?.filter((b) => b.role === 'owner') ?? [];
  const shared = boards?.filter((b) => b.role !== 'owner') ?? [];

  const Card = ({ board }) => (
    <article className="card" onClick={() => navigate(`/b/${board.id}`)}>
      <Preview id={board.id} />
      <div className="card-body">
        <h3>{board.title}</h3>
        <p className="muted">
          {board.role === 'owner' ? 'Edited' : `by ${board.ownerName} ·`} {timeAgo(board.updatedAt)}
          {board.role !== 'owner' && <span className="badge">{board.role}</span>}
        </p>
      </div>
      {board.role === 'owner' && (
        <button className="icon-btn danger card-delete" title="Delete board" onClick={(e) => { e.stopPropagation(); remove(board); }}>
          <Icon name="trash" size={16} />
        </button>
      )}
    </article>
  );

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="brand">Real-time collaborative workspace</div>
        <div className="dash-user">
          <span className="avatar" style={{ background: 'linear-gradient(135deg,#7c5cff,#22d3ee)' }}>{user.name.slice(0, 1).toUpperCase()}</span>
          <span className="muted">{user.name}</span>
          <button className="icon-btn" title="Sign out" onClick={logout}><Icon name="logout" size={18} /></button>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-title">
          <h1>Your boards</h1>
          <button className="btn primary" onClick={create}><Icon name="plus" size={16} /> New board</button>
        </div>
        {error && <p className="error">{error}</p>}
        {boards === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            {mine.length === 0 ? (
              <div className="empty-dash">
                <h3>No boards yet</h3>
                <p className="muted">Create your first board and invite someone to it.</p>
                <button className="btn primary" onClick={create}><Icon name="plus" size={16} /> Create board</button>
              </div>
            ) : (
              <div className="grid">{mine.map((b) => <Card key={b.id} board={b} />)}</div>
            )}
            {shared.length > 0 && (
              <>
                <h2 className="section">Shared with you</h2>
                <div className="grid">{shared.map((b) => <Card key={b.id} board={b} />)}</div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
