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
// API (counts the download) then save the file.
// Why blob and not window.open(url)? Our Cloudinary account denies delivery
// of `.pdf`-suffixed URLs (401), so files are stored extensionless and the
// real name (e.g. "paper.pdf") is restored here via the download attribute.
export async function downloadPyq(id) {
  const { data } = await api.get(`/pyq/${id}/download`);
  const url = data.url.startsWith('http') ? data.url : `${SERVER_URL}${data.url}`;
  const name = data.fileName || 'download';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  } catch {
    window.open(url, '_blank', 'noopener'); // last-resort fallback
  }
}

export default api;
