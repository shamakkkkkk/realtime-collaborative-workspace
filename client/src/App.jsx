import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BoardPage from './pages/BoardPage.jsx';
import JoinPage from './pages/JoinPage.jsx';
import { Splash } from './components/Splash.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/boards" element={<Protected><Dashboard /></Protected>} />
      <Route path="/b/:id" element={<Protected><BoardPage /></Protected>} />
      <Route path="/join/:token" element={<Protected><JoinPage /></Protected>} />
      <Route path="*" element={<Navigate to="/boards" replace />} />
    </Routes>
  );
}
