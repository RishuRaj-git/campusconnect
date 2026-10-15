import { useEffect, useState } from 'react';

// Apple-keynote-style opening: the wordmark writes itself letter by letter
// (rise + de-blur stagger), a light sweep crosses it, then the curtain lifts.
export default function Intro({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  const word = 'CampusConnect';

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1900);
    const t2 = setTimeout(onDone, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  const skip = () => { setLeaving(true); setTimeout(onDone, 350); };

  return (
    <div
      onClick={skip}
      className={`fixed inset-0 z-[100] grid place-items-center bg-slate-950 transition-all duration-500 ${leaving ? 'opacity-0 -translate-y-6 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="text-center px-6">
        <p className="intro-eyebrow">Welcome to</p>
        <h1 className="intro-word" aria-label={word}>
          {word.split('').map((ch, i) => (
            <span key={i} className="intro-letter" style={{ animationDelay: `${0.15 + i * 0.055}s` }}>{ch}</span>
          ))}
          <span className="intro-sheen" aria-hidden />
        </h1>
        <p className="intro-tag">Where your campus talks.</p>
      </div>
    </div>
  );
}
