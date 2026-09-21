import { useEffect, useState, useSyncExternalStore } from 'react';

export function useElements(store) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** connection status of the WebSocket provider */
export function useConnection(provider) {
  const [status, setStatus] = useState(provider.wsconnected ? 'connected' : 'connecting');
  const [synced, setSynced] = useState(provider.synced);
  useEffect(() => {
    const onStatus = (event) => setStatus(event.status);
    const onSync = (value) => setSynced(Boolean(value));
    provider.on('status', onStatus);
    provider.on('sync', onSync);
    return () => {
      provider.off('status', onStatus);
      provider.off('sync', onSync);
    };
  }, [provider]);
  return { status, synced };
}

function compute(awareness) {
  const users = new Map(); // user id -> user (deduplicated across tabs)
  const cursors = [];
  const selections = new Map(); // element id -> colour of the person who selected it
  let me = null;

  awareness.getStates().forEach((state, clientId) => {
    const user = state.user;
    if (!user) return;
    if (clientId === awareness.clientID) {
      me = user;
      return;
    }
    users.set(user.id, user);
    if (state.cursor) cursors.push({ clientId, ...state.cursor, name: user.name, color: user.color });
    if (Array.isArray(state.selection)) {
      for (const id of state.selection) selections.set(id, user.color);
    }
  });

  return { me, users: Array.from(users.values()), cursors, selections };
}

/** Presence (cursors, selections, who is online), batched to one update per frame. */
export function useAwareness(awareness) {
  const [state, setState] = useState(() => compute(awareness));
  useEffect(() => {
    let frame = 0;
    const onChange = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setState(compute(awareness));
      });
    };
    awareness.on('change', onChange);
    onChange();
    return () => {
      awareness.off('change', onChange);
      cancelAnimationFrame(frame);
    };
  }, [awareness]);
  return state;
}
