import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export function useNow(step = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), step);
    return () => clearInterval(t);
  }, [step]);
  return now;
}

export function diffParts(target, now) {
  let s = Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60);
  return { d, h, m, s: s % 60 };
}

// chill (>30d) → soon (≤30d) → hurry (≤7d)
export function urgency(days) {
  if (days <= 7) return 'hurry';
  if (days <= 30) return 'soon';
  return 'chill';
}

const pad = (n) => String(n).padStart(2, '0');

export function CountdownDigits({ target, now }) {
  const { d, h, m, s } = diffParts(target, now);
  const cells = [[d, 'days'], [pad(h), 'hrs'], [pad(m), 'min'], [pad(s), 'sec']];
  return (
    <div className="flex items-center gap-1.5">
      {cells.map(([v, label], i) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="flex flex-col items-center">
            <span key={v} className="count-digit anim-pop">{v}</span>
            <span className="text-[10px] opacity-60 mt-0.5">{label}</span>
          </span>
          {i < 3 && <span className="font-bold opacity-40 -mt-4">:</span>}
        </span>
      ))}
    </div>
  );
}

// Sleek one-liner: illuminating pointer, constantly blinking, leaving a trail.
export function HurryLine({ exam, days }) {
  if (!exam) return null;
  const dayNum = new Date(exam.examDate).getDate();
  return (
    <Link to="/exams" title="Click to edit exam dates" className="sleek-line anim-fade-in hover:border-red-500/60 transition-colors">
      <span className="pointer" aria-hidden />
      <span className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
        Semester exam on {dayNum} <span className="opacity-40">·</span>{' '}
        <span className="text-red-500">{days} day{days !== 1 ? 's' : ''} left</span>
      </span>
      <span className="text-xs opacity-40 ml-auto shrink-0">✎ edit</span>
    </Link>
  );
}

// Home-page widget: next upcoming exam with live countdown + urgency theme
export function ExamCountdown() {
  const now = useNow(1000);
  const [next, setNext] = useState(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    api.get('/exams', { params: { limit: 50 } })
      .then(r => { setNext(r.data[0] || null); setCount(r.data.length); })
      .catch(() => {});
  }, []);

  if (!next) {
    return (
      <Link to="/exams" className="card lift anim-fade-up flex items-center justify-between">
        <div><h3 className="font-bold">📝 Exam Season</h3><p className="text-sm opacity-70">No exam dates yet — add your semester schedule.</p></div>
        <span className="btn-primary text-sm">+ Add</span>
      </Link>
    );
  }
  const days = Math.max(0, Math.ceil((new Date(next.examDate).getTime() - now) / 86400000));
  const level = urgency(days);
  return (
    <div className="space-y-2">
      {level === 'hurry' && <HurryLine exam={next} days={days} />}
      <div className={`card lift ${level === 'hurry' ? 'hurry border-red-500/60' : level === 'soon' ? 'border-amber-400/60' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${level === 'hurry' ? 'text-red-600 hurry-blink' : 'opacity-60'}`}>
              {level === 'hurry' ? '🔥 Exam week — hurry up!' : level === 'soon' ? '⏳ Coming soon' : '📝 Next exam'}
            </p>
            <h3 className="font-display font-bold text-xl">{next.title}</h3>
            <p className="text-sm opacity-60">{next.subject}{next.branch ? ` • ${next.branch}` : ''} • {new Date(next.examDate).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <CountdownDigits target={next.examDate} now={now} />
        </div>
        <div className="flex gap-2 mt-3">
          <Link to="/exams" className="btn-ghost text-sm !py-1.5">All {count} exams →</Link>
          <Link to="/pyq" className="btn-primary text-sm !py-1.5">Revise PYQs</Link>
        </div>
      </div>
    </div>
  );
}

export function ExamsPage() {
  const { isAdmin } = useAuth();
  const now = useNow(30000);
  const [exams, setExams] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState({ title: '', subject: '', branch: '', examDate: '', examType: 'End-Term', venue: '' });

  const load = async () => setExams((await api.get('/exams', { params: showAll ? { all: 1 } : {} })).data);
  useEffect(() => { load(); }, [showAll]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/exams', form);
      setForm({ title: '', subject: '', branch: '', examDate: '', examType: 'End-Term', venue: '' });
      load();
    } catch (err) { alert(err.response?.data?.error || 'Only admins can add exams'); }
  };
  const remove = async (exam) => {
    if (!confirm(`Delete "${exam.title}"?`)) return;
    try { await api.delete(`/exams/${exam._id}`); load(); }
    catch (err) { alert(err.response?.data?.error || 'Delete failed'); }
  };

  const hurryOne = exams.map(e => ({ e, days: Math.ceil((new Date(e.examDate).getTime() - now) / 86400000) })).find(x => x.days <= 7 && x.days >= 0);

  return (
    <div className="space-y-3">
      <h2 className="font-display font-bold text-2xl">📝 Exam Season</h2>
      {hurryOne && <HurryLine exam={hurryOne.e} days={hurryOne.days} />}

      {isAdmin ? (
        <form onSubmit={add} className="card space-y-2 anim-fade-in">
          <h3 className="font-bold">+ Add exam date</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            <input className="input" placeholder="Title * (e.g. Maths End-Term)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            <input className="input" placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            <input className="input" type="datetime-local" value={form.examDate} onChange={e => setForm({ ...form, examDate: e.target.value })} required />
            <select className="input" value={form.examType} onChange={e => setForm({ ...form, examType: e.target.value })}>
              {['Mid-Term', 'End-Term', 'Internal', 'Practical', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className="input" placeholder="Branch (optional)" value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} />
            <input className="input" placeholder="Venue (optional)" value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} />
          </div>
          <button className="btn-primary">Add</button>
        </form>
      ) : null}

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show past exams too</label>

      <div className="space-y-2">
        {exams.map((e, i) => {
          const days = Math.ceil((new Date(e.examDate).getTime() - now) / 86400000);
          const level = days < 0 ? 'done' : urgency(days);
          return (
            <div key={e._id} className={`card lift anim-fade-up ${level === 'hurry' ? 'hurry border-red-500/60' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <div className="flex flex-wrap justify-between gap-2 items-center">
                <div>
                  <h4 className="font-bold">{level === 'hurry' ? '🔥 ' : ''}{e.title} <span className="text-xs font-normal opacity-60">{e.examType}</span></h4>
                  <p className="text-xs opacity-60">{e.subject}{e.branch ? ` • ${e.branch}` : ''}{e.venue ? ` • 📍 ${e.venue}` : ''} • by {e.author}</p>
                  <p className="text-sm mt-0.5">📅 {new Date(e.examDate).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — <b className={level === 'hurry' ? 'text-red-600' : ''}>{days < 0 ? 'done ✅' : days === 0 ? 'TODAY!' : `${days} day${days > 1 ? 's' : ''} left`}</b></p>
                </div>
                {(isAdmin) && <button className="btn-ghost !py-1 text-xs text-red-600" onClick={() => remove(e)}>Delete</button>}
              </div>
            </div>
          );
        })}
        {exams.length === 0 && <div className="card text-sm opacity-60">No exams scheduled. Add your semester dates above 👆</div>}
      </div>
    </div>
  );
}
