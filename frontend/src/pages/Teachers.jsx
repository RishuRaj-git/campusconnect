import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { SERVER_URL, downloadPyq } from '../api';
import { useAuth } from '../context/AuthContext';

export const DIMS = [
  ['teaching', 'Teaching clarity'],
  ['grading', 'Grading leniency'],
  ['attendance', 'Attendance strictness'],
  ['pyqRep', 'Repeats from PYQs']
];

export function Stars({ value }) {
  const full = Math.round(value || 0);
  return <span className="text-amber-500 tracking-tight">{'★'.repeat(full)}{'☆'.repeat(5 - full)}</span>;
}

function Bar({ label, value }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-40 shrink-0 opacity-70">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-400 transition-all duration-500" style={{ width: `${(value / 5) * 100}%` }} />
      </div>
      <b className="w-8 text-right">{value?.toFixed(1)}</b>
    </div>
  );
}

export function Teachers() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [depts, setDepts] = useState([]);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', department: '', subjects: '', bio: '' });

  const load = async () => {
    const { data } = await api.get('/teachers', { params: { q, dept } });
    setItems(data);
  };
  useEffect(() => { api.get('/teachers/departments').then(r => setDepts(r.data)).catch(() => {}); load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/teachers', { ...form, subjects: form.subjects.split(',').map(s => s.trim()).filter(Boolean) });
      setForm({ name: '', department: '', subjects: '', bio: '' });
      setShowAdd(false);
      const { data } = await api.get('/teachers/departments').catch(() => ({ data: [] }));
      setDepts(data);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Login required'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input className="input !w-auto flex-1 min-w-[160px]" placeholder="Search teachers…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input !w-auto" value={dept} onChange={e => setDept(e.target.value)}>
          <option value="">All departments</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button className="btn-primary" onClick={() => load()}>Search</button>
        {user && <button className="btn-ghost" onClick={() => setShowAdd(!showAdd)}>+ Add teacher</button>}
      </div>

      {showAdd && (
        <form onSubmit={add} className="card space-y-2 anim-fade-in">
          <h3 className="font-bold">Add a teacher</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            <input className="input" placeholder="Full name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            <input className="input" placeholder="Department (e.g. CSE)" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
          </div>
          <input className="input" placeholder="Subjects (comma separated)" value={form.subjects} onChange={e => setForm({ ...form, subjects: e.target.value })} />
          <button className="btn-primary">Add</button>
        </form>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((t, i) => (
          <Link key={t._id} to={`/teachers/${t._id}`} className="card lift anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
            <h3 className="font-bold">👩‍🏫 {t.name}</h3>
            <p className="text-xs opacity-60 mt-0.5">{t.department || '—'}{t.subjects?.length ? ` • ${t.subjects.slice(0, 3).join(', ')}` : ''}</p>
            <p className="text-sm mt-1"><Stars value={t.avgOverall} /> <span className="opacity-60">({t.ratingCount} ratings)</span></p>
          </Link>
        ))}
      </div>
      {items.length === 0 && <div className="card text-sm opacity-60">No teachers yet — add the first one above. 👆</div>}
    </div>
  );
}

export function TeacherDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [scores, setScores] = useState({ teaching: 5, grading: 5, attendance: 3, pyqRep: 5 });
  const [comment, setComment] = useState('');

  const load = async () => setD((await api.get(`/teachers/${id}`)).data);
  useEffect(() => { load(); }, [id]);

  const rate = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/teachers/${id}/rate`, { ...scores, comment });
      setComment('');
      alert(data.message + ` (${data.count} total)`);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Login required to rate'); }
  };

  if (!d) return <div className="skeleton h-64" />;
  const { teacher: t, stats, reviews, notes } = d;

  return (
    <div className="space-y-3">
      <div className="card">
        <h2 className="font-display font-bold text-2xl">👩‍🏫 {t.name}</h2>
        <p className="text-sm opacity-60">{t.department || '—'}{t.subjects?.length ? ` • ${t.subjects.join(', ')}` : ''}</p>
        <div className="mt-3 space-y-1.5">
          {stats.hidden ? (
            <p className="text-sm bg-amber-100 dark:bg-amber-900/30 rounded-xl px-3 py-2">
              🔒 Scores unlock after {stats.needed} ratings ({stats.count}/{stats.needed} so far) — rate below to help unlock!
            </p>
          ) : (
            <>
              <p className="text-lg"><Stars value={(stats.teaching + stats.grading + stats.attendance + stats.pyqRep) / 4} /> <span className="text-sm opacity-60">{stats.count} ratings</span></p>
              <Bar label="Teaching clarity" value={stats.teaching} />
              <Bar label="Grading leniency" value={stats.grading} />
              <Bar label="Attendance strictness" value={stats.attendance} />
              <Bar label="Repeats from PYQs" value={stats.pyqRep} />
            </>
          )}
        </div>
      </div>

      {user && (
        <form onSubmit={rate} className="card space-y-2">
          <h3 className="font-bold">Rate {t.name.split(' ')[0]} — be fair, rate the teaching 🤝</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {DIMS.map(([k, label]) => (
              <label key={k} className="text-sm">{label}
                <select className="input mt-1" value={scores[k]} onChange={e => setScores({ ...scores, [k]: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v} ★</option>)}
                </select>
              </label>
            ))}
          </div>
          <textarea className="input" rows="2" placeholder="Short constructive comment (optional, max 500 chars)" value={comment} onChange={e => setComment(e.target.value)} />
          <button className="btn-primary">Submit rating</button>
        </form>
      )}

      <div className="card">
        <h3 className="font-bold mb-2">💬 Student reviews ({reviews.length})</h3>
        <div className="space-y-2">
          {reviews.map(r => (
            <div key={r._id} className="text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
              <Stars value={(r.teaching + r.grading + r.attendance + r.pyqRep) / 4} />
              {r.comment && <p className="mt-0.5">{r.comment}</p>}
            </div>
          ))}
          {reviews.length === 0 && <p className="text-sm opacity-60">No reviews yet — be the first!</p>}
        </div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-2">📚 Notes by {t.name.split(' ')[0]} ({notes.length})</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {notes.map(n => (
            <div key={n._id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              <p className="font-bold text-sm">{n.title}</p>
              <p className="text-xs opacity-60">{n.branch} • {n.subject} • {n.year}</p>
              {n.fileUrl && <button className="text-brand-600 text-sm" onClick={() => downloadPyq(n._id).catch(() => alert('Login required to download'))}>Download →</button>}
            </div>
          ))}
          {notes.length === 0 && <p className="text-sm opacity-60">No notes tagged yet — upload one from the <Link to="/pyq" className="text-brand-600">PYQs page</Link> and pick this teacher.</p>}
        </div>
      </div>
    </div>
  );
}
