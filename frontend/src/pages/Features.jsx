import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import api, { SERVER_URL, downloadPyq } from '../api';
import { useAuth } from '../context/AuthContext';

export const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function useAutoScroll(dep) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

export function Chat() {
  const { user, socket } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [live, setLive] = useState(false);
  const logRef = useAutoScroll(msgs);
  useEffect(() => {
    if (!socket) { setLive(false); return; }
    setLive(socket.connected);
    const onConnect = () => { setLive(true); setNote(''); };
    const onDisconnect = () => setLive(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('chat history', setMsgs);
    socket.on('chat message', (m) => setMsgs((p) => [...p.slice(-99), m]));
    socket.on('chat message blocked', (d) => setNote(d.reason));
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('chat history'); socket.off('chat message'); socket.off('chat message blocked'); };
  }, [socket]);
  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (!user) { setNote('Login to chat'); return; }
    if (!socket || !socket.connected) { setNote('Connecting… wait a second and retry'); return; }
    socket.emit('chat message', { message: text });
    setText('');
  };
  return (
    <div className="card !p-3 sm:!p-5">
      <h2 className="font-bold text-xl mb-2 flex items-center gap-2 px-1">💬 Live Chat
        <span className="flex items-center gap-1 text-xs font-normal opacity-70">
          <span className={`w-2 h-2 rounded-full ${live ? 'bg-green-500' : 'bg-amber-500 hurry-blink'}`} />
          {live ? 'Live' : 'Connecting…'}
        </span>
      </h2>
      {!user && <p className="text-sm text-amber-600 mb-2 px-1">Login to send messages.</p>}
      {note && <p className="text-sm text-red-600 mb-2 px-1 anim-fade-in">{note}</p>}
      <div ref={logRef} className="h-[55vh] sm:h-80 overflow-y-auto rounded-xl p-2 sm:p-3 space-y-1.5 bg-slate-50 dark:bg-slate-950">
        {msgs.map((m, i) => {
          const mine = user && m.username === user;
          return (
            <div key={`${m.createdAt || ''}-${i}`} className={`flex ${mine ? 'justify-end' : 'justify-start'} anim-slide-in`}>
              <div className={`max-w-[82%] sm:max-w-[70%] px-3 py-1.5 rounded-2xl text-sm break-words ${mine ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-md'}`}>
                {!mine && <Link to={`/profile/${m.username}`} className="block text-xs font-bold text-brand-600 dark:text-accent-400 hover:underline">{m.username}</Link>}
                <p>{m.message}</p>
                <p className={`text-[10px] mt-0.5 text-right ${mine ? 'text-white/70' : 'opacity-50'}`}>{m.createdAt ? fmtTime(m.createdAt) : ''}</p>
              </div>
            </div>
          );
        })}
        {msgs.length === 0 && <p className="text-sm opacity-50 text-center pt-8">No messages yet — say hi! 👋</p>}
      </div>
      <form onSubmit={send} className="flex gap-2 mt-3">
        <input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Message…" maxLength={1000} />
        <button className="btn-primary shrink-0">Send</button>
      </form>
    </div>
  );
}

export function DMs() {
  const { user, socket } = useAuth();
  const [convos, setConvos] = useState([]);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const [params, setParams] = useSearchParams();
  const logRef = useAutoScroll(msgs);
  const load = async () => { try { const { data } = await api.get('/dms/conversations'); setConvos(data); return data; } catch { return []; } };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!socket) return;
    socket.on('dm message', (m) => { if (active && m.conversationId === active._id) setMsgs((p) => [...p, m]); });
    return () => socket.off('dm message');
  }, [socket, active]);
  const open = async (c) => { setActive(c); const { data } = await api.get(`/dms/conversations/${c._id}/messages`); setMsgs(data); };
  const start = async (username) => {
    const name = (username || find).trim();
    if (!name) return;
    try { const { data } = await api.post('/dms/conversations', { username: name }); setFind(''); await load(); open(data); }
    catch (err) { alert(err.response?.data?.error || 'Failed'); }
  };
  // Deep link from profiles: /dms?to=username auto-opens that chat
  useEffect(() => {
    const to = params.get('to');
    if (to && user) { setParams({}, { replace: true }); start(to); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const send = (e) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    if (!socket || !socket.connected) { alert('Connecting… wait a second and retry'); return; }
    socket.emit('dm message', { conversationId: active._id, toUsername: active.otherUser.username, text });
    setText('');
  };
  if (!user) return <div className="card">Login to use DMs.</div>;
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <div className="card !p-3 max-h-[32vh] md:max-h-none overflow-y-auto">
        <div className="flex gap-2 mb-2"><input className="input" placeholder="username..." value={find} onChange={e => setFind(e.target.value)} onKeyDown={e => e.key === 'Enter' && start()} /><button className="btn-primary shrink-0" onClick={() => start()}>+</button></div>
        {convos.map(c => (
          <div key={c._id} className={`flex items-center gap-2 p-2 rounded-xl ${active?._id === c._id ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
            <button onClick={() => open(c)} className="flex-1 text-left min-w-0">
              <span className="block font-bold text-sm truncate">{c.otherUser?.username}</span>
              <span className="block text-xs opacity-60 truncate">{c.lastMessage}</span>
            </button>
            <Link to={`/profile/${c.otherUser?.username}`} className="text-xs text-brand-600 shrink-0 px-1">View ›</Link>
          </div>
        ))}
        {convos.length === 0 && <p className="text-sm opacity-60">No chats yet — search a username above. 🔍</p>}
      </div>
      <div className="card !p-3 sm:!p-5 md:col-span-2">
        {!active ? <p className="opacity-60">Pick a conversation. 💬</p> : (<>
          <h3 className="font-bold mb-2">Chat with <Link to={`/profile/${active.otherUser?.username}`} className="text-brand-600 hover:underline">{active.otherUser?.username}</Link></h3>
          <div ref={logRef} className="h-[50vh] sm:h-72 overflow-y-auto rounded-xl p-2 bg-slate-50 dark:bg-slate-950 space-y-1.5">
            {msgs.map((m, i) => {
              const mine = m.sender === user;
              return (
                <div key={m._id || i} className={`flex ${mine ? 'justify-end' : 'justify-start'} anim-slide-in`}>
                  <div className={`max-w-[82%] px-3 py-1.5 rounded-2xl text-sm break-words ${mine ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bl-md'}`}>
                    <p>{m.text}</p>
                    <p className={`text-[10px] mt-0.5 text-right ${mine ? 'text-white/70' : 'opacity-50'}`}>{m.createdAt ? fmtTime(m.createdAt) : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={send} className="flex gap-2 mt-3"><input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Message..." maxLength={2000} /><button className="btn-primary shrink-0">Send</button></form>
        </>)}
      </div>
    </div>
  );
}

export function PYQ() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ branches: [], subjects: [], years: [] });
  const [f, setF] = useState({ branch: '', subject: '', year: '' });
  const [form, setForm] = useState({ branch: '', subject: '', year: '', semester: '', title: '', notes: '', examType: 'Other', teacherName: '' });
  const [teachers, setTeachers] = useState([]);
  const [params, setParams] = useSearchParams();
  const teacherId = params.get('teacher') || '';
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const load = async (reset = true) => {
    const p = reset ? 1 : page + 1;
    const { data, headers } = await api.get('/pyq', { params: { ...f, teacher: teacherId || undefined, page: p, limit: 20 } });
    const total = parseInt(headers['x-total-count'] || '0', 10);
    setItems(reset ? data : [...items, ...data]);
    setPage(p);
    setHasMore(total > p * 20);
  };
  useEffect(() => { api.get('/pyq/meta').then(r => setMeta(r.data)).catch(() => {}); api.get('/teachers', { params: { limit: 100 } }).then(r => setTeachers(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(true); }, [teacherId]);
  const upload = async (e) => {
    e.preventDefault();
    setUploading(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
    if (file) fd.append('file', file);
    try { await api.post('/pyq/upload', fd); setForm({ branch: '', subject: '', year: '', semester: '', title: '', notes: '', examType: 'Other', teacherName: '' }); setFile(null); load(true); alert('Uploaded! 🎉'); }
    catch (err) { alert(err.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); }
  };
  const remove = async (id) => {
    if (!confirm('Delete this PYQ?')) return;
    try { await api.delete(`/pyq/${id}`); setItems(items.filter(p => p._id !== id)); }
    catch (err) { alert(err.response?.data?.error || 'Delete failed'); }
  };
  const dl = async (id) => {
    try { await downloadPyq(id); load(true); }
    catch (err) { alert(err.response?.data?.error || 'Login required to download'); }
  };
  return (
    <div className="space-y-3">
      {teacherId && (
        <div className="card anim-fade-in flex items-center justify-between text-sm">
          <span>👩‍🏫 Showing notes for one teacher</span>
          <button className="btn-ghost !py-1 text-xs" onClick={() => setParams({})}>Clear ✕</button>
        </div>
      )}
      <div className="card flex flex-wrap gap-2">
        <select className="input !w-auto" value={f.branch} onChange={e => setF({ ...f, branch: e.target.value })}><option value="">All branches</option>{meta.branches.map(b => <option key={b} value={b}>{b}</option>)}</select>
        <select className="input !w-auto" value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })}><option value="">All subjects</option>{meta.subjects.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <button className="btn-primary" onClick={() => load(true)}>Filter</button>
      </div>
      {user && (
        <form onSubmit={upload} className="card space-y-2">
          <h3 className="font-bold">Upload PYQ</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            <input className="input" placeholder="Branch (e.g. CSE)" value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} required />
            <input className="input" placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required />
            <input className="input" placeholder="Year (e.g. 2024)" type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} required />
            <input className="input" placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            <input className="input" placeholder="Semester (1-8, optional)" type="number" min="1" max="8" value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })} />
            <select className="input" value={form.examType} onChange={e => setForm({ ...form, examType: e.target.value })}>
              {['Mid-Term', 'End-Term', 'Internal', 'Practical', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <textarea className="input" placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <input className="input" list="cc-teachers" placeholder="Teacher (optional — pick from Teachers page)" value={form.teacherName} onChange={e => setForm({ ...form, teacherName: e.target.value })} />
          <datalist id="cc-teachers">{teachers.map(t => <option key={t._id} value={t.name} />)}</datalist>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files[0])} />
          <button className="btn-primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
        </form>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((p, i) => (
          <div key={p._id} className="card lift anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
            <h4 className="font-bold">{p.title}</h4>
            <p className="text-xs opacity-60 mt-0.5">{p.branch} • {p.subject} • {p.year}{p.semester ? ` • Sem ${p.semester}` : ''}{p.examType && p.examType !== 'Other' ? ` • ${p.examType}` : ''} • ⬇ {p.downloads} • by {p.uploadedBy?.username || 'unknown'}</p>
            {p.teacher && <p className="text-xs mt-0.5">👩‍🏫 <Link to={`/teachers/${p.teacher._id}`} className="text-brand-600">{p.teacher.name}</Link></p>}
            {p.notes && <p className="text-sm mt-1">{p.notes}</p>}
            <div className="flex gap-2 mt-2">
              {p.fileUrl && <button className="btn-ghost text-sm !py-1" onClick={() => dl(p._id)}>Download / View →</button>}
              {(isAdmin || p.uploadedBy?.username === user) && <button className="btn-ghost text-sm !py-1 text-red-600" onClick={() => remove(p._id)}>Delete</button>}
            </div>
          </div>
        ))}
      </div>
      {hasMore && <button className="btn-ghost w-full" onClick={() => load(false)}>Load more</button>}
    </div>
  );
}

export function Profile() {
  const { user } = useAuth();
  const { username: paramName } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ branch: '', semester: '', year: '', enrollmentNo: '', bio: '' });
  const viewing = paramName || user;
  const own = user && viewing === user;
  useEffect(() => {
    if (!viewing) return;
    setMissing(false);
    api.get(`/profile/${viewing}`).then(r => { setP(r.data); setForm(r.data); }).catch(() => setMissing(true));
  }, [viewing]);
  if (!viewing) return <div className="card">Login to view profiles. <Link to="/auth" className="text-brand-600">Login →</Link></div>;
  if (missing) return <div className="card anim-fade-in">User “{viewing}” not found. 🕵️</div>;
  const save = async (e) => { e.preventDefault(); const { data } = await api.put('/profile', form); setP({ ...p, ...data }); alert('Saved!'); };
  const [uploading, setUploading] = useState(false);
  const [imgDead, setImgDead] = useState(false);
  useEffect(() => { setImgDead(false); }, [viewing, p?.avatarUrl]);
  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('avatar', f);
    try {
      const { data } = await api.post('/profile/avatar', fd);
      setP({ ...p, avatarUrl: data.avatarUrl });
    } catch (err) { alert(err.response?.data?.error || 'Avatar upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };
  return (
    <div className="card space-y-2 max-w-lg">
      <div className="flex items-center gap-3">
        {!imgDead && p?.avatarUrl
          ? <img src={p.avatarUrl} alt="avatar" onError={() => setImgDead(true)} className="w-16 h-16 rounded-full object-cover border-2 border-brand-500/40 anim-pop" />
          : <span className="w-16 h-16 rounded-full grid place-items-center text-2xl bg-slate-200 dark:bg-slate-800">👤</span>}
        <div className="flex-1">
          <h2 className="font-bold text-xl">{viewing}</h2>
          {p && <p className="text-sm opacity-60">📝 {p.stats.discussionCount} posts • 📚 {p.stats.pyqCount} PYQs</p>}
        </div>
        {!own && user && (
          <button className="btn-primary text-sm shrink-0" onClick={() => nav(`/dms?to=${viewing}`)}>✉️ Message</button>
        )}
      </div>
      {p?.bio && <p className="text-sm bg-slate-50 dark:bg-slate-950 rounded-xl px-3 py-2">{p.bio}</p>}
      {(p?.branch || p?.semester || p?.year) && (
        <p className="text-xs opacity-60">{[p.branch, p.semester ? `Sem ${p.semester}` : '', p.year].filter(Boolean).join(' • ')}</p>
      )}
      {own && (<>
      <label className="btn-ghost text-sm text-center cursor-pointer">
        {uploading ? 'Uploading…' : '📷 Change photo'}
        <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={uploadAvatar} disabled={uploading} />
      </label>
      <form onSubmit={save} className="space-y-2">
        <input className="input" placeholder="Branch" value={form.branch || ''} onChange={e => setForm({ ...form, branch: e.target.value })} />
        <input className="input" placeholder="Semester" type="number" value={form.semester || ''} onChange={e => setForm({ ...form, semester: e.target.value })} />
        <input className="input" placeholder="Year" value={form.year || ''} onChange={e => setForm({ ...form, year: e.target.value })} />
        <input className="input" placeholder="Enrollment No" value={form.enrollmentNo || ''} onChange={e => setForm({ ...form, enrollmentNo: e.target.value })} />
        <textarea className="input" placeholder="Bio (200 chars)" value={form.bio || ''} onChange={e => setForm({ ...form, bio: e.target.value })} />
        <button className="btn-primary">Save</button>
      </form>
      </>)}
    </div>
  );
}

export function Admin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [chats, setChats] = useState([]);
  const [pyqs, setPyqs] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [teachersAdmin, setTeachersAdmin] = useState([]);
  const [tab, setTab] = useState('users');
  const [q, setQ] = useState('');
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, u, d, c, p, fl, tl] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/admin/users'),
          api.get('/admin/discussions'),
          api.get('/admin/chatmessages'),
          api.get('/pyq', { params: { limit: 50 } }),
          api.get('/teachers/reviews/flagged').catch(() => ({ data: [] })),
          api.get('/teachers', { params: { limit: 100 } }).catch(() => ({ data: [] }))
        ]);
        setStats(s.data); setUsers(u.data); setPosts(d.data); setChats(c.data); setPyqs(p.data);
        setFlagged(fl.data); setTeachersAdmin(tl.data);
      } catch { setDenied(true); }
    })();
  }, []);

  const refreshUsers = async () => setUsers((await api.get('/admin/users')).data);
  const toggleBan = async (u) => {
    await api.post(`/admin/users/${u.username}/${u.isBanned ? 'unban' : 'ban'}`);
    refreshUsers();
  };
  const delPost = async (id) => { if (!confirm('Delete this post?')) return; await api.delete(`/admin/discussions/${id}`); setPosts(posts.filter(p => p._id !== id)); };
  const delChat = async (id) => { if (!confirm('Delete this message?')) return; await api.delete(`/admin/chatmessages/${id}`); setChats(chats.filter(c => c._id !== id)); };
  const delPyq = async (id) => { if (!confirm('Delete this PYQ?')) return; await api.delete(`/pyq/${id}`); setPyqs(pyqs.filter(p => p._id !== id)); };
  const unhideReview = async (id) => { await api.post(`/teachers/ratings/${id}/visibility`, { hidden: false }); setFlagged(flagged.filter(r => r._id !== id)); };
  const delTeacher = async (id) => { if (!confirm('Remove this teacher and all their ratings?')) return; await api.delete(`/teachers/${id}`); setTeachersAdmin(teachersAdmin.filter(t => t._id !== id)); };

  if (denied) return <div className="card anim-fade-up">🔒 Admin only. Login as an admin to view this page.</div>;

  const shownUsers = users.filter(u => u.username.toLowerCase().includes(q.toLowerCase()));
  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)} className={tab === id ? 'btn-primary !py-1.5 text-sm' : 'btn-ghost !py-1.5 text-sm'}>{label}</button>
  );

  return (
    <div className="space-y-3">
      <h2 className="font-display font-bold text-2xl">🛡️ Admin Suite</h2>
      {stats
        ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Object.entries(stats).map(([k, v], i) => <div key={k} className="card lift text-center anim-fade-up" style={{ animationDelay: `${i * 60}ms` }}><p className="text-2xl font-bold">{v}</p><p className="text-xs opacity-60">{k}</p></div>)}</div>
        : <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-20" />)}</div>}

      <div className="flex flex-wrap gap-2">{['users', 'posts', 'chat', 'pyqs', 'teachers'].map((id) => tabBtn(id, { users: `Users (${users.length})`, posts: `Posts (${posts.length})`, chat: `Chat (${chats.length})`, pyqs: `PYQs (${pyqs.length})`, teachers: `Teachers (${flagged.length} flagged)` }[id]))}</div>

      {tab === 'users' && (
        <div className="card anim-fade-in">
          <input className="input mb-2" placeholder="Search users…" value={q} onChange={e => setQ(e.target.value)} />
          {shownUsers.map(u => (
            <div key={u._id} className="flex items-center justify-between py-1.5 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0">
              <span><b>{u.username}</b> <span className="opacity-60">{u.branch || ''}</span> {u.isAdmin && '⭐'} {u.isBanned && '⛔'}</span>
              {!u.isAdmin && <button className="btn-ghost !py-1 text-xs" onClick={() => toggleBan(u)}>{u.isBanned ? 'Unban' : 'Ban'}</button>}
            </div>
          ))}
          {shownUsers.length === 0 && <p className="text-sm opacity-60">No users found.</p>}
        </div>
      )}

      {tab === 'posts' && (
        <div className="space-y-2">
          {posts.map(p => (
            <div key={p._id} className="card anim-fade-in">
              <div className="flex justify-between gap-2">
                <div><h4 className="font-bold text-sm">{p.title}</h4><p className="text-xs opacity-60">by {p.author} • {p.likes?.length || 0} likes • {p.comments?.length || 0} comments</p></div>
                <button className="btn-ghost !py-1 text-xs text-red-600 shrink-0" onClick={() => delPost(p._id)}>Delete</button>
              </div>
            </div>
          ))}
          {posts.length === 0 && <div className="card text-sm opacity-60">No posts yet.</div>}
        </div>
      )}

      {tab === 'chat' && (
        <div className="card anim-fade-in space-y-1">
          {chats.map(c => (
            <div key={c._id} className="flex justify-between gap-2 text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <p className="truncate"><b>{c.username}:</b> {c.message}</p>
              <button className="text-red-600 text-xs shrink-0" onClick={() => delChat(c._id)}>Delete</button>
            </div>
          ))}
          {chats.length === 0 && <p className="text-sm opacity-60">No messages.</p>}
        </div>
      )}

      {tab === 'pyqs' && (
        <div className="space-y-2">
          {pyqs.map(p => (
            <div key={p._id} className="card anim-fade-in">
              <div className="flex justify-between gap-2">
                <div><h4 className="font-bold text-sm">{p.title}</h4><p className="text-xs opacity-60">{p.branch} • {p.subject} • {p.year} • ⬇ {p.downloads}</p></div>
                <button className="btn-ghost !py-1 text-xs text-red-600 shrink-0" onClick={() => delPyq(p._id)}>Delete</button>
              </div>
            </div>
          ))}
          {pyqs.length === 0 && <div className="card text-sm opacity-60">No PYQs yet — users can add them from the PYQs page.</div>}
        </div>
      )}

      {tab === 'teachers' && (
        <div className="space-y-2">
          <div className="card anim-fade-in">
            <h3 className="font-bold mb-2">🚩 Hidden reviews ({flagged.length})</h3>
            {flagged.map(r => (
              <div key={r._id} className="flex justify-between gap-2 text-sm py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <p className="truncate"><b>{r.teacher?.name}</b> by <b>{r.rater?.username}</b>: {r.comment || `(${r.teaching}/${r.grading}/${r.attendance}/${r.pyqRep})`}</p>
                <button className="text-brand-600 text-xs shrink-0" onClick={() => unhideReview(r._id)}>Unhide</button>
              </div>
            ))}
            {flagged.length === 0 && <p className="text-sm opacity-60">Queue clear. 🎉</p>}
          </div>
          <div className="card anim-fade-in">
            <h3 className="font-bold mb-2">👩‍🏫 All teachers ({teachersAdmin.length})</h3>
            {teachersAdmin.map(t => (
              <div key={t._id} className="flex justify-between gap-2 text-sm py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <span><b>{t.name}</b> <span className="opacity-60">{t.department} • {t.ratingCount} ratings</span></span>
                <button className="text-red-600 text-xs shrink-0" onClick={() => delTeacher(t._id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
