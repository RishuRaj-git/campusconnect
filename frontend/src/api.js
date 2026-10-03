import axios from 'axios';

// Same-origin by default (single-service deploy: backend serves this frontend).
// Split deploy (e.g. Vercel frontend + Render API): set VITE_SERVER_URL to the
// API origin, e.g. VITE_SERVER_URL=https://campusconnect.onrender.com
export const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');

const api = axios.create({ baseURL: SERVER_URL ? `${SERVER_URL}/api` : '/api' });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('cc_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

// Expired/invalid token → drop the dead session and send the user back to
// login instead of failing silently on every request. (401 only: 403s like
// "not your post" must NOT log anyone out.)
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response && err.response.status === 401 && localStorage.getItem('cc_token')) {
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_user');
      localStorage.removeItem('cc_admin');
      if (!window.location.pathname.startsWith('/auth')) window.location.assign('/auth');
    }
    return Promise.reject(err);
  }
);

// Login-gated download: plain <a href> can't carry a JWT, so verify via the
// API (counts the download) then open the returned file URL. Works for both
// Cloudinary URLs (absolute) and legacy local files (relative).
export async function downloadPyq(id) {
  const { data } = await api.get(`/pyq/${id}/download`);
  const url = data.url.startsWith('http') ? data.url : `${SERVER_URL}${data.url}`;
  window.open(url, '_blank', 'noopener');
}

export default api;
