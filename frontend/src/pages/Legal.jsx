import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

export const CONTACT_EMAIL = 'rishurajcusb@gmail.com';
export const MAKER = 'Rishu Raj';

export function PrivacyPolicy() {
  usePageMeta({ title: 'Privacy Policy', description: 'CampusConnect privacy policy: what data we collect and how it is used.' });
  return (
    <div className="card max-w-2xl mx-auto space-y-4 anim-fade-up">
      <h1 className="font-display font-bold text-2xl">Privacy Policy</h1>
      <p className="text-sm opacity-70">Last updated: October 2026 • CampusConnect (“we”, “our”) by {MAKER}</p>

      <section className="space-y-1 text-sm">
        <h2 className="font-bold">1. What we collect</h2>
        <p>Account info you give us: username, password (stored only as an irreversible hash — we never see it), and optional profile details (branch, semester, bio, photo). Content you create: posts, comments, likes, chat messages, DMs, PYQs/notes uploads, teacher ratings, exam dates.</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-bold">2. How content is stored</h2>
        <p>Text lives in our MongoDB database. Group chat messages auto-delete after 48 hours; DMs, posts and uploads stay until you (or an admin) delete them. Uploaded files are stored on Cloudinary under our account.</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-bold">3. What we never do</h2>
        <p>We never sell your data, show third-party ads, or share your content outside the app. Rater identities on teacher reviews are hidden from other users. Passwords cannot be read by anyone, including admins.</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-bold">4. Moderation</h2>
        <p>Posts, messages and reviews pass an automated English + Hindi abuse filter. Admins can remove content or suspend accounts that break community rules. Banned users are blocked from posting, chatting and messaging.</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-bold">5. Your control</h2>
        <p>You can delete your own posts, uploads and DMs anytime from inside the app. To delete your account entirely, contact us below and we’ll remove it.</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-bold">6. Contact</h2>
        <p>Questions, deletions, or abuse reports: <a className="text-brand-600 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      </section>

      <Link to="/" className="btn-ghost text-sm inline-block">← Back home</Link>
    </div>
  );
}
