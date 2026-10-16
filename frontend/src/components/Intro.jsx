import { useEffect, useState } from 'react';
import FluidWord from './FluidWord';

// Apple-keynote-style opening: the wordmark writes itself letter by letter
// (rise + de-blur stagger), a light sweep crosses it, then the curtain lifts.
export default function Intro({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1900);
    const t2 = setTimeout(onDone, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  const skip = () => { setLeaving(true); setTimeout(onDone, 350); };

  return (
    <div
      onClick={skip}
      className={`fixed inset-0 z-[100] grid place-items-center transition-all duration-500 ${leaving ? 'opacity-0 -translate-y-6 pointer-events-none' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(160deg, #1e1b4b, #312e81)' }}
    >
      <div className="relative text-center px-6">
        <p className="intro-eyebrow">Welcome to</p>
        <h1><FluidWord size="intro" delay={0.15} /></h1>
        <p className="intro-tag">Where your campus talks.</p>
      </div>
    </div>
  );
}
