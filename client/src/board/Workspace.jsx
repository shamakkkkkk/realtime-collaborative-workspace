import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import Canvas from './Canvas.jsx';
import ShareModal from './ShareModal.jsx';
import { DEFAULT_COLOR, MAX_ZOOM, MIN_ZOOM, PALETTE, TOOLS } from './constants.js';
import { clamp, fitCamera } from './geometry.js';
import { useAwareness, useConnection, useElements } from './hooks.js';

const CLIPBOARD_MIME = 'application/x-collab-elements';
const MAX_PASTE_TEXT = 5000;

/** Rough sticky-note size for a piece of pasted text (20px font, ~22 chars per line). */
function stickySizeFor(text) {
  const lines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 20)), 0);
  return { w: 260, h: Math.min(640, Math.max(180, 40 + lines * 27)) };
}

const isTyping = (e) =>
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

export default function Workspace({ board, setBoard, session, user }) {
  const { store, ops, undo, awareness, provider } = session;
  const elements = useElements(store);
  const remote = useAwareness(awareness);
  const { status, synced } = useConnection(provider);
  const readOnly = board.role === 'viewer';

  const [cam, setCam] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 });
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const colorRef = useRef(color);
  colorRef.current = color;
  const [selection, setSelection] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [title, setTitle] = useState(board.title);

  const selectedElements = useMemo(() => elements.filter((e) => selection.has(e.id)), [elements, selection]);

  // Frame the existing content once, right after the first sync.
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    if (!synced || framed) return;
    setFramed(true);
    setCam(fitCamera(store.getSnapshot(), { width: window.innerWidth, height: window.innerHeight }));
  }, [synced, framed, store]);

  // Share my selection with others (they see a coloured outline).
  useEffect(() => {
    awareness.setLocalStateField('selection', Array.from(selection));
  }, [awareness, selection]);

  const zoomBy = useCallback((factor) => {
    setCam((c) => {
      const zoom = clamp(c.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const wx = (cx - c.x) / c.zoom;
      const wy = (cy - c.y) / c.zoom;
      return { x: cx - wx * zoom, y: cy - wy * zoom, zoom };
    });
  }, []);

  const fit = useCallback(() => {
    setCam(fitCamera(store.getSnapshot(), { width: window.innerWidth, height: window.innerHeight }));
  }, [store]);

  const deleteSelection = useCallback(() => {
    if (readOnly || selection.size === 0) return;
    ops.remove([...selection]);
    setSelection(new Set());
  }, [ops, readOnly, selection]);

  const duplicateSelection = useCallback(() => {
    if (readOnly || selection.size === 0) return;
    const created = ops.duplicate([...selection]);
    setSelection(new Set(created));
  }, [ops, readOnly, selection]);

  const applyColor = (c) => {
    setColor(c);
    if (!readOnly && selection.size) {
      const patches = {};
      for (const id of selection) patches[id] = { color: c };
      ops.updateMany(patches);
    }
  };

  // copy / cut / paste (elements between boards, or plain text -> sticky note)
  const camRef = useRef(cam);
  camRef.current = cam;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  useEffect(() => {
    const onCopy = (e, cut = false) => {
      if (isTyping(e) || readOnly) return;
      const ids = selectionRef.current;
      const items = store.getSnapshot().filter((el) => ids.has(el.id));
      if (items.length === 0) return;
      e.preventDefault();
      e.clipboardData.setData(CLIPBOARD_MIME, JSON.stringify(items));
      e.clipboardData.setData('text/plain', items.map((el) => el.text).filter(Boolean).join('\n'));
      if (cut) {
        ops.remove(items.map((el) => el.id));
        setSelection(new Set());
      }
    };

    const onPaste = (e) => {
      if (isTyping(e) || readOnly || !e.clipboardData) return;

      const raw = e.clipboardData.getData(CLIPBOARD_MIME);
      if (raw) {
        try {
          const items = JSON.parse(raw);
          if (Array.isArray(items)) {
            e.preventDefault();
            const created = ops.insert(items.slice(0, 500));
            if (created.length) setSelection(new Set(created));
            return;
          }
        } catch {
          /* not ours, fall through to plain text */
        }
      }

      const text = (e.clipboardData.getData('text/plain') || '').replace(/\r\n?/g, '\n').trim();
      if (!text) return;
      e.preventDefault();
      const c = camRef.current;
      const center = { x: (window.innerWidth / 2 - c.x) / c.zoom, y: (window.innerHeight / 2 - c.y) / c.zoom };
      const size = stickySizeFor(text.slice(0, MAX_PASTE_TEXT));
      const id = ops.create({
        type: 'sticky',
        x: center.x - size.w / 2,
        y: center.y - size.h / 2,
        w: size.w,
        h: size.h,
        color: colorRef.current,
        text: text.slice(0, MAX_PASTE_TEXT),
      });
      setSelection(new Set([id]));
    };

    const onCut = (e) => onCopy(e, true);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [ops, store, readOnly]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (!readOnly) (e.shiftKey ? undo.redo() : undo.undo());
      } else if (mod && key === 'y') {
        e.preventDefault();
        if (!readOnly) undo.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && key === 'a') {
        e.preventDefault();
        setSelection(new Set(store.getSnapshot().map((el) => el.id)));
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        setSelection(new Set());
        setTool('select');
      } else if (!mod && !e.altKey && !readOnly) {
        const match = TOOLS.find((t) => t.key.toLowerCase() === key);
        if (match) setTool(match.id);
        else if (key === '=' || key === '+') zoomBy(1.2);
        else if (key === '-') zoomBy(1 / 1.2);
        else if (key === '0') fit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, store, readOnly, duplicateSelection, deleteSelection, zoomBy, fit]);

  const saveTitle = async () => {
    const next = title.trim();
    if (!next) return setTitle(board.title);
    if (next === board.title) return;
    try {
      await api.patch(`/api/boards/${board.id}`, { title: next });
      setBoard({ ...board, title: next });
    } catch {
      setTitle(board.title);
    }
  };

  const people = [remote.me, ...remote.users].filter(Boolean);
  const showColors = !readOnly && (selection.size > 0 || !['select', 'hand'].includes(tool));

  return (
    <div className="workspace">
      <Canvas
        elements={elements}
        ops={ops}
        awareness={awareness}
        remote={remote}
        cam={cam}
        setCam={setCam}
        tool={readOnly ? 'select' : tool}
        setTool={setTool}
        color={color}
        selection={selection}
        setSelection={setSelection}
        editingId={editingId}
        setEditingId={setEditingId}
        readOnly={readOnly}
      />

      <header className="topbar glass">
        <Link className="icon-btn" to="/boards" title="All boards"><Icon name="back" /></Link>
        {board.role === 'owner' ? (
          <input
            className="title-input"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          <span className="title-static">{board.title}</span>
        )}
        <span className={`status status-${status === 'connected' && synced ? 'ok' : 'wait'}`}>
          <i />{status === 'connected' ? (synced ? 'Live' : 'Syncing…') : 'Reconnecting…'}
        </span>
        {readOnly && <span className="badge">View only</span>}
      </header>

      <div className="topbar-right">
        <div className="avatars glass">
          {people.slice(0, 6).map((p, i) => (
            <span key={p.id} className="avatar" style={{ background: p.color, zIndex: 10 - i }} title={p.id === user.id ? `${p.name} (you)` : p.name}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {people.length > 6 && <span className="avatar more">+{people.length - 6}</span>}
        </div>
        {board.role === 'owner' && (
          <button className="btn primary" onClick={() => setShareOpen(true)}>
            <Icon name="share" size={16} /> Share
          </button>
        )}
      </div>

      {showColors && (
        <div className="color-panel glass">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`swatch ${(selectedElements.length === 1 ? selectedElements[0].color : color) === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => applyColor(c)}
              aria-label={`Colour ${c}`}
            />
          ))}
          {selection.size > 0 && (
            <>
              <span className="sep" />
              <button className="icon-btn" title="Duplicate (Ctrl+D)" onClick={duplicateSelection}><Icon name="copy" size={18} /></button>
              <button className="icon-btn danger" title="Delete (Del)" onClick={deleteSelection}><Icon name="trash" size={18} /></button>
            </>
          )}
        </div>
      )}

      {!readOnly && (
        <nav className="toolbar glass">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`tool ${tool === t.id ? 'active' : ''}`}
              title={`${t.label} (${t.key})`}
              onClick={() => setTool(t.id)}
            >
              <Icon name={t.icon} />
            </button>
          ))}
          <span className="sep" />
          <button className="tool" title="Undo (Ctrl+Z)" onClick={() => undo.undo()}><Icon name="undo" /></button>
          <button className="tool" title="Redo (Ctrl+Shift+Z)" onClick={() => undo.redo()}><Icon name="redo" /></button>
        </nav>
      )}

      <div className="zoom glass">
        <button className="icon-btn" onClick={() => zoomBy(1 / 1.2)} title="Zoom out (-)"><Icon name="minus" size={16} /></button>
        <span className="zoom-value">{Math.round(cam.zoom * 100)}%</span>
        <button className="icon-btn" onClick={() => zoomBy(1.2)} title="Zoom in (+)"><Icon name="plus" size={16} /></button>
        <button className="icon-btn" onClick={fit} title="Fit content (0)"><Icon name="fit" size={16} /></button>
        <button className="icon-btn" onClick={() => setHelpOpen((v) => !v)} title="Shortcuts"><Icon name="help" size={16} /></button>
      </div>

      {helpOpen && (
        <div className="help glass">
          <h4>Shortcuts</h4>
          <dl>
            <dt>V H N R O T A P</dt><dd>Select · Pan · Sticky · Rect · Ellipse · Text · Arrow · Pen</dd>
            <dt>Double-click</dt><dd>New sticky / edit text</dd>
            <dt>Scroll</dt><dd>Pan</dd>
            <dt>Ctrl/⌘ + scroll</dt><dd>Zoom</dd>
            <dt>Space + drag</dt><dd>Pan</dd>
            <dt>Shift + click</dt><dd>Multi-select</dd>
            <dt>Ctrl+Z / Ctrl+Shift+Z</dt><dd>Undo / redo (yours only)</dd>
            <dt>Ctrl+C / X / V</dt><dd>Copy · Cut · Paste (text becomes a sticky note)</dd>
            <dt>Ctrl+D · Del</dt><dd>Duplicate · Delete</dd>
          </dl>
        </div>
      )}

      {status !== 'connected' && (
        <div className="offline-banner">
          Connection lost. Your changes are kept locally and will sync automatically when you are back online.
        </div>
      )}

      {shareOpen && <ShareModal board={board} setBoard={setBoard} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
