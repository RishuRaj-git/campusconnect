import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const tabs = [
  { to: '/', label: 'Home', icon: <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" /> },
  { to: '/discussions', label: 'Q&A', icon: <><rect x="3" y="5" width="18" height="12" rx="3" /><path d="M9 21l3-4" /></> },
  { to: '/chat', label: 'Chat', icon: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></> },
  { to: '/dms', label: 'DMs', icon: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></> },
  { to: '/pyq', label: 'PYQs', icon: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z" /><path d="M5 17h14" /></> },
  { to: '/teachers', label: 'Teachers', icon: <><path d="M22 9 12 4 2 9l10 5 10-5Z" /><path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" /><path d="M22 9v5" /></> },
  { to: '/exams', label: 'Exams', icon: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /><circle cx="12" cy="15.5" r="2.2" /><path d="M12 14.5v1l.8.8" /></> },
  { to: '/profile', label: 'Profile', icon: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c0-4 3.4-6 7.5-6s7.5 2 7.5 6" /></> },
];

const iconProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('cc_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('cc_theme', dark ? 'dark' : 'light');
  }, [dark]);
  return (
    <button
      onClick={() => setDark(!dark)}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`toggle${dark ? ' toggle-dark' : ''}`}
    >
      {dark && (
        <>
          <span className="toggle-star" style={{ left: '.55rem', top: '.3rem', fontSize: '.55rem', animationDelay: '0s' }}>✦</span>
          <span className="toggle-star" style={{ left: '1rem', bottom: '.3rem', fontSize: '.45rem', animationDelay: '.7s' }}>✦</span>
        </>
      )}
      <span key={String(dark)} className="toggle-thumb"><span>{dark ? '🌙' : '☀️'}</span></span>
    </button>
  );
}

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-20 px-3 pt-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
        <Link to="/" className="font-display font-bold text-xl tracking-tight shrink-0">
          🟣 Campus<span className="text-brand-600 dark:text-accent-400">Connect</span>
        </Link>
        {/* Desktop: floating Apple-style pill */}
        <nav className="nav-pill hidden md:flex items-center gap-0.5 px-1.5 py-1.5">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <svg {...iconProps} className="w-4 h-4">{t.icon}</svg>{t.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <svg {...iconProps} className="w-4 h-4"><path d="M12 3l2.5 5.5L20 9.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1Z" /></svg>Admin
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          {user ? (
            <>
              <span className="hidden lg:inline text-sm">Hi, <b>{user}</b></span>
              <button className="btn-ghost !py-1.5 text-sm" onClick={() => { logout(); nav('/'); }}>Logout</button>
            </>
          ) : (
            <Link to="/auth" className="btn-primary !py-1.5 text-sm">Login</Link>
          )}
        </div>
      </div>
      {/* Mobile: iOS-style bottom tab bar */}
      <nav className="tabbar md:hidden">
        <div className="tabbar-inner">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}>
              {({ isActive }) => (<><svg {...iconProps}>{t.icon}</svg>{t.label}{isActive && <span className="tab-dot" />}</>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </header>
  );
}
