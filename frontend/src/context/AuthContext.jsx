import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL } from '../api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Module-level singleton: one socket per token, shared across
// StrictMode remounts and re-renders. Disconnects only on
// logout / token change — never in effect cleanup.
let sharedSocket = null;
let sharedToken = null;

function acquireSocket(token, username) {
  if (sharedSocket && sharedToken === token) return sharedSocket;
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
  }
  sharedSocket = io(SERVER_URL || undefined, { auth: { token, username } });
  sharedToken = token;
  return sharedSocket;
}

function releaseSocket() {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
    sharedToken = null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => localStorage.getItem('cc_user') || null);
  const [token, setToken] = useState(() => localStorage.getItem('cc_token') || null);
  const [socket, setSocket] = useState(() => (sharedSocket && sharedToken === localStorage.getItem('cc_token') ? sharedSocket : null));
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!token) { setSocket(null); return; }
    const s = acquireSocket(token, userRef.current);
    s.emit('identify', userRef.current);
    setSocket(s);
    // NOTE: no disconnect here — cleanup would kill the shared
    // socket on every StrictMode remount / re-render.
  }, [token]);

  const login = (t, u) => { localStorage.setItem('cc_token', t); localStorage.setItem('cc_user', u); setToken(t); setUser(u); };
  const logout = () => { releaseSocket(); localStorage.removeItem('cc_token'); localStorage.removeItem('cc_user'); localStorage.removeItem('cc_admin'); setToken(null); setUser(null); setSocket(null); };
  return <AuthCtx.Provider value={{ user, token, login, logout, socket, isAdmin: localStorage.getItem('cc_admin') === '1' }}>{children}</AuthCtx.Provider>;
}
