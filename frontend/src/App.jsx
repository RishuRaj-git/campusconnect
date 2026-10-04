import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import { AuthPage, Home, Discussions } from './pages/Core';
import { Chat, DMs, PYQ, Profile, Admin } from './pages/Features';
import { Teachers, TeacherDetail } from './pages/Teachers';
import { ExamsPage } from './pages/Exams';
import { PrivacyPolicy, CONTACT_EMAIL, MAKER } from './pages/Legal';

function AnimatedRoutes() {
  const loc = useLocation();
  return (
    <main className="max-w-5xl mx-auto p-4 pb-24 md:pb-16">
      {/* key remounts on navigation → page-enter transition plays per page */}
      <div key={loc.pathname} className="page-enter">
        <Routes location={loc}>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/discussions" element={<Discussions />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/dms" element={<DMs />} />
          <Route path="/pyq" element={<PYQ />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/teachers/:id" element={<TeacherDetail />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
        </Routes>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
          <div className="orb orb-a" />
          <div className="orb orb-b" />
          <div className="orb orb-c" />
        </div>
        <Navbar />
        <AnimatedRoutes />
        <footer className="text-center text-xs opacity-80 pb-28 md:pb-8 space-y-1">
          <p>CampusConnect © 2026 — Where your campus talks.</p>
          <p>Made with ❤️ by <b>{MAKER}</b> • <a className="text-brand-600 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> • <Link className="text-brand-600 hover:underline" to="/privacy">Privacy Policy</Link></p>
        </footer>
      </BrowserRouter>
    </AuthProvider>
  );
}
