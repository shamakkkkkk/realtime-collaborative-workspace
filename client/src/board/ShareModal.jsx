import { useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';

export default function ShareModal({ board, setBoard, onClose }) {
  const [role, setRole] = useState(board.share?.role ?? 'editor');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const link = board.share ? `${window.location.origin}/join/${board.share.token}` : '';

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await api.post(`/api/boards/${board.id}/share`, { role });
      setBoard({ ...board, share: data.share });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api.del(`/api/boards/${board.id}/share`);
      setBoard({ ...board, share: null });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked, the link is selectable anyway */
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal glass" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Share board</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <p className="muted">Anyone with the link who is signed in can join with the permission you choose.</p>

        <div className="segmented">
          <button className={role === 'editor' ? 'active' : ''} onClick={() => setRole('editor')}>Can edit</button>
          <button className={role === 'viewer' ? 'active' : ''} onClick={() => setRole('viewer')}>Can view</button>
        </div>

        {board.share ? (
          <>
            <div className="link-row">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button className="btn primary" onClick={copy}>
                <Icon name={copied ? 'check' : 'link'} size={16} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="modal-actions">
              <button className="btn" disabled={busy} onClick={create}>
                Regenerate link ({role === 'editor' ? 'edit' : 'view'})
              </button>
              <button className="btn danger" disabled={busy} onClick={disable}>Disable link</button>
            </div>
          </>
        ) : (
          <div className="modal-actions">
            <button className="btn primary" disabled={busy} onClick={create}>Create invite link</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
