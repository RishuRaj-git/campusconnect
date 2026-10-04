import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { ExamCountdown } from './Exams';

export function AuthPage() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const { login } = useAuth();
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      if (mode === 'signup') { await api.post('/auth/signup', { username, password }); setMode('login'); setMsg('Account created! Please log in.'); }
      else {
        const { data } = await api.post('/auth/login', { username, password });
        login(data.token, data.username);
        localStorage.setItem('cc_admin', data.isAdmin ? '1' : '0');
        nav('/');
      }
    } catch (err) { setMsg(err.response?.data?.error || 'Something went wrong'); }
  };
  return (
    <div className="max-w-md mx-auto card mt-8">
      <h1 className="font-display text-2xl font-bold mb-1">Welcome to CampusConnect</h1>
      <p className="text-sm opacity-70 mb-4">Where your campus talks.</p>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('login')} className={mode === 'login' ? 'btn-primary' : 'btn-ghost'}>Login</button>
        <button onClick={() => setMode('signup')} className={mode === 'signup' ? 'btn-primary' : 'btn-ghost'}>Signup</button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
        <input className="input" type="password" placeholder="Password (6+ chars)" value={password} onChange={e => setPassword(e.target.value)} required />
        <button className="btn-primary w-full">{mode === 'login' ? 'Log in' : 'Sign up'}</button>
      </form>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </div>
  );
}

export function Home() {
  return (
    <div className="space-y-4">
      <div className="card bg-gradient-to-br from-brand-600 to-brand-900 text-white border-0">
        <p className="text-xs uppercase tracking-widest opacity-80">CampusConnect</p>
        <h1 className="font-display text-3xl font-bold">Where your campus talks.</h1>
        <p className="opacity-90 mt-1">Live chat, discussions, DMs and PYQs — in one clean app.</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <Link to="/chat" className="bg-accent-400 text-slate-950 font-semibold rounded-xl px-4 py-2 active:scale-95 transition">Open Chat</Link>
          <Link to="/pyq" className="border border-white/40 rounded-xl px-4 py-2 active:scale-95 transition">Browse PYQs</Link>
        </div>
      </div>
      <ExamCountdown />
      <div className="grid sm:grid-cols-2 gap-3">
        {[['/chat', '💬 Live Chat', 'Group room, online now'], ['/discussions', '🗣️ Discussions', 'Posts, likes, comments'], ['/pyq', '📚 PYQ Bank', 'Papers by branch/year'], ['/teachers', '👩‍🏫 Teachers', 'Ratings + teacher notes'], ['/exams', '⏳ Exams', 'Countdowns + hurry mode'], ['/dms', '✉️ DMs', '1-on-1 messages']].map(([to, t, d], i) => (
          <Link key={to} to={to} className="card lift anim-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}><h3 className="font-bold">{t}</h3><p className="text-sm opacity-70">{d}</p></Link>
        ))}
      </div>
    </div>
  );
}

export function Discussions() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const load = async (reset = true) => {
    const p = reset ? 1 : page + 1;
    const { data, headers } = await api.get('/discussions', { params: { search, page: p, limit: 20 } });
    const total = parseInt(headers['x-total-count'] || '0', 10);
    setPosts(reset ? data : [...posts, ...data]);
    setPage(p);
    setHasMore(total > p * 20);
  };
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    try { await api.post('/discussions', { title, content }); setTitle(''); setContent(''); load(true); }
    catch (err) { alert(err.response?.data?.error || 'Login required to post'); }
  };
  const like = async (id) => { try { const { data } = await api.post(`/discussions/${id}/like`); setPosts(posts.map(p => p._id === id ? data : p)); } catch { alert('Login required'); } };
  const comment = async (id, text) => {
    if (!text) return;
    try { const { data } = await api.post(`/discussions/${id}/comments`, { text }); setPosts(posts.map(p => p._id === id ? data : p)); }
    catch (err) { alert(err.response?.data?.error || 'Failed'); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2"><input className="input !w-auto flex-1 min-w-[180px]" placeholder="Search posts..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(true)} /><button className="btn-ghost shrink-0" onClick={() => load(true)}>Search</button></div>
      {user && (
        <form onSubmit={create} className="card space-y-2">
          <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} required />
          <textarea className="input" rows="3" placeholder="What's on your mind?" value={content} onChange={e => setContent(e.target.value)} required />
          <button className="btn-primary">Post</button>
        </form>
      )}
      {posts.map((p, i) => (
        <div key={p._id} className="card lift anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
          <h3 className="font-bold">{p.title}</h3>
          <p className="text-sm mt-1">{p.content}</p>
          <p className="text-xs opacity-60 mt-1">by <Link to={`/profile/${p.author}`} className="text-brand-600 hover:underline">{p.author}</Link> • <span key={p.likes?.length || 0} className="anim-pop inline-block">{p.likes?.length || 0} likes</span> • {p.comments?.length || 0} comments</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button className="btn-ghost text-sm" onClick={() => like(p._id)}>👍 Like</button>
            <button className="btn-ghost text-sm" onClick={() => { const t = prompt('Your comment:'); if (t) comment(p._id, t); }}>💬 Comment</button>
          </div>
          <div className="mt-2 space-y-1 text-sm">{p.comments?.slice(-3).map((c, i) => <p key={i}><Link to={`/profile/${c.author}`} className="font-bold text-brand-600 hover:underline">{c.author}</Link>: {c.text}</p>)}</div>
        </div>
      ))}
      {hasMore && <button className="btn-ghost w-full" onClick={() => load(false)}>Load more</button>}
    </div>
  );
}
