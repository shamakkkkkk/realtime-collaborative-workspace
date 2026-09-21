import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Splash } from '../components/Splash.jsx';

export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false); // StrictMode runs effects twice in dev

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post(`/api/join/${token}`)
      .then((data) => navigate(`/b/${data.boardId}`, { replace: true }))
      .catch((err) => setError(err.message));
  }, [token, navigate]);

  if (error) {
    return (
      <div className="splash">
        <h2>Could not join</h2>
        <p className="muted">{error}</p>
        <Link className="btn" to="/boards">Go to my boards</Link>
      </div>
    );
  }
  return <Splash message="Joining board…" />;
}
