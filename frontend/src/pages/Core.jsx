import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { ExamCountdown } from './Exams';
import { usePageMeta } from '../hooks/usePageMeta';

export function AuthPage() {
  usePageMeta({ title: 'Login', noindex: true });
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
  usePageMeta({ title: 'Where your campus talks', description: 'CampusConnect: live chat, Q&A, PYQ bank, teacher ratings and exam countdowns for your campus.' });
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
        {[['/chat', '💬 Live Chat', 'Group room, online now'], ['/discussions', '❓ Campus Queries', 'Ask, answer, upvote'], ['/pyq', '📚 PYQ Bank', 'Papers by branch/year'], ['/teachers', '👩‍🏫 Teachers', 'Ratings + teacher notes'], ['/exams', '⏳ Exams', 'Countdowns + hurry mode'], ['/dms', '✉️ DMs', '1-on-1 messages']].map(([to, t, d], i) => (
          <Link key={to} to={to} className="card lift anim-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}><h3 className="font-bold">{t}</h3><p className="text-sm opacity-70">{d}</p></Link>
        ))}
      </div>
    </div>
  );
}

function Answer({ qid, a, user, onLike }) {
  const [open, setOpen] = useState(false);
  const likes = a.likes?.length || 0;
  const liked = user && a.likes?.includes(user);
  return (
    <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3">
      <div className="flex items-center gap-2 text-xs mb-1">
        <Link to={`/profile/${a.author}`} className="font-bold text-brand-600 hover:underline">{a.author}</Link>
        {a.createdAt && <span className="opacity-50">{new Date(a.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>}
      </div>
      <p className="text-sm whitespace-pre-wrap">{a.text.length > 300 && !open ? a.text.slice(0, 300) + '…' : a.text}</p>
      {a.text.length > 300 && (
        <button className="text-xs text-brand-600 font-semibold mt-0.5" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</button>
      )}
      <div className="mt-1.5">
        <button
          onClick={() => onLike(qid, a._id)}
          className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 border active:scale-90 transition-all ${liked ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
        >
          ▲ <span key={likes} className="anim-pop inline-block">{likes}</span>
        </button>
      </div>
    </div>
  );
}

export function Discussions() {
  const { user } = useAuth();
  usePageMeta({ title: 'Campus Queries', description: 'Ask questions, write answers and upvote the best ones — campus Q&A forum.' });
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('latest');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const load = async (reset = true) => {
    const p = reset ? 1 : page + 1;
    const { data, headers } = await api.get('/discussions', { params: { search, sort, page: p, limit: 20 } });
    const total = parseInt(headers['x-total-count'] || '0', 10);
    setPosts(reset ? data : [...posts, ...data]);
    setPage(p);
    setHasMore(total > p * 20);
  };
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    try { await api.post('/discussions', { title, content }); setTitle(''); setContent(''); load(true); }
    catch (err) { alert(err.response?.data?.error || 'Login required to ask'); }
  };
  const likeQ = async (id) => { try { const { data } = await api.post(`/discussions/${id}/like`); setPosts(posts.map(p => p._id === id ? data : p)); } catch { alert('Login required'); } };
  const likeA = async (qid, cid) => {
    try { const { data } = await api.post(`/discussions/${qid}/comments/${cid}/like`); setPosts(posts.map(p => p._id === qid ? data : p)); }
    catch (err) { alert(err.response?.data?.error || 'Login required'); }
  };
  const answer = async (id) => {
    const text = (drafts[id] || '').trim();
    if (!text) return;
    try {
      const { data } = await api.post(`/discussions/${id}/comments`, { text });
      setPosts(posts.map(p => p._id === id ? data : p));
      setDrafts({ ...drafts, [id]: '' });
      setExpanded({ ...expanded, [id]: true });
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
  };
  return (
    <div className="space-y-3">
      <h2 className="font-display font-bold text-2xl">❓ Campus Queries</h2>
      <div className="flex flex-wrap gap-2">
        <input className="input !w-auto flex-1 min-w-[160px]" placeholder="Search questions..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(true)} />
        <select className="input !w-auto" value={sort} onChange={e => { setSort(e.target.value); }}>
          <option value="latest">Latest</option>
          <option value="liked">Most liked</option>
        </select>
        <button className="btn-ghost shrink-0" onClick={() => load(true)}>Go</button>
      </div>
      {user && (
        <form onSubmit={create} className="card space-y-2">
          <h3 className="font-bold">Ask the campus 💬</h3>
          <input className="input" placeholder="Your question in one line? *" value={title} onChange={e => setTitle(e.target.value)} required />
          <textarea className="input" rows="2" placeholder="Details, branch/subject context… (optional, helps better answers)" value={content} onChange={e => setContent(e.target.value)} />
          <button className="btn-primary">Ask question</button>
        </form>
      )}
      {posts.map((p, i) => {
        const answers = [...(p.comments || [])].sort((a, b) => (b.likes || []).length - (a.likes || []).length);
        const isOpen = expanded[p._id];
        const shown = isOpen ? answers : answers.slice(0, 2);
        const n = p.comments?.length || 0;
        return (
          <div key={p._id} className="card lift anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
            <h3 className="font-display font-bold text-lg leading-snug">{p.title}</h3>
            {p.content && <p className="text-sm mt-1 opacity-80">{p.content}</p>}
            <p className="text-xs opacity-60 mt-1.5">
              Asked by <Link to={`/profile/${p.author}`} className="text-brand-600 hover:underline font-semibold">{p.author}</Link>
              {' '}• <span key={p.likes?.length || 0} className="anim-pop inline-block">👍 {p.likes?.length || 0}</span>
              {' '}• 💬 {n} answer{n === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button className="btn-ghost text-sm !py-1" onClick={() => likeQ(p._id)}>👍 Like question</button>
              {n > 2 && (
                <button className="btn-ghost text-sm !py-1" onClick={() => setExpanded({ ...expanded, [p._id]: !isOpen })}>
                  {isOpen ? 'Hide answers ▲' : `View all ${n} answers ▼`}
                </button>
              )}
            </div>
            {shown.length > 0 && (
              <div className="mt-3 space-y-2">
                {shown.map(a => <Answer key={a._id} qid={p._id} a={a} user={user} onLike={likeA} />)}
              </div>
            )}
            {user ? (
              <div className="flex gap-2 mt-3">
                <input
                  className="input" placeholder="Write your answer…" value={drafts[p._id] || ''}
                  onChange={e => setDrafts({ ...drafts, [p._id]: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && answer(p._id)} maxLength={1000}
                />
                <button className="btn-primary shrink-0" onClick={() => answer(p._id)}>Answer</button>
              </div>
            ) : (
              <p className="text-xs opacity-60 mt-3"><Link to="/auth" className="text-brand-600">Log in</Link> to answer.</p>
            )}
          </div>
        );
      })}
      {posts.length === 0 && <div className="card text-sm opacity-60">No questions yet — ask the first one! ☝️</div>}
      {hasMore && <button className="btn-ghost w-full" onClick={() => load(false)}>Load more</button>}
    </div>
  );
}
