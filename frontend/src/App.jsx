import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import { AuthPage, Home, Discussions } from './pages/Core';
import { Chat, DMs, PYQ, Profile, Admin } from './pages/Features';
import { Teachers, TeacherDetail } from './pages/Teachers';
import { ExamsPage } from './pages/Exams';

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
          <Route path="/admin" element={<Admin />} />
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
        <footer className="text-center text-xs opacity-60 pb-28 md:pb-8">CampusConnect © 2026 — Where your campus talks.</footer>
      </BrowserRouter>
    </AuthProvider>
  );
}
