export function Splash({ message }) {
  return (
    <div className="splash">
      <div className="splash-bar"><span /></div>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}
