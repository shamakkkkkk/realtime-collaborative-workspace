import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const safeNext = (value) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/boards');

export default function AuthPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <h1>Real-time <span className="gradient-text">collaborative</span> workspace</h1>
        <p>An infinite canvas for sticky notes, diagrams and ideas. Everyone sees every change the instant it happens.</p>
        <ul className="tech">
          <li>React</li><li>Yjs CRDT</li><li>WebSockets</li><li>Node.js</li><li>PostgreSQL</li><li>Redis</li>
        </ul>
        <div className="float-notes" aria-hidden="true">
          <div className="fn fn1">Ship the MVP</div>
          <div className="fn fn2">User research</div>
          <div className="fn fn3">Ideas ✨</div>
          <div className="fn-cursor"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 3l16 7.5-6.8 2.2L10.5 20z" fill="#22d3ee" stroke="#0a0c12" strokeWidth="1.5" strokeLinejoin="round" /></svg><span>Ada</span></div>
        </div>
      </section>

      <section className="auth-card-wrap">
        <form className="auth-card glass" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted">{mode === 'login' ? 'Sign in to open your boards.' : 'It takes ten seconds.'}</p>

          {mode === 'register' && (
            <label>Name<input value={form.name} onChange={set('name')} placeholder="Ada Lovelace" autoComplete="name" required maxLength={40} /></label>
          )}
          <label>Email<input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input type="password" value={form.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} /></label>

          {error && <p className="error">{error}</p>}
          <button className="btn primary wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>

          <p className="switch">
            {mode === 'login' ? "No account yet? " : 'Already have an account? '}
            <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}
