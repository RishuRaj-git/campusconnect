import { useEffect } from 'react';

// Scroll reveal: adds `.in` to every `.reveal` element as it enters the viewport.
// A MutationObserver catches lists rendered after data loads (posts, PYQs, chat…)
// so they animate in too. Pure DOM — no deps, no re-renders.
export default function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

    const scan = () => document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
    scan();

    const mo = new MutationObserver(() => {
      // batch mutations into one scan per frame
      clearTimeout(mo._t);
      mo._t = setTimeout(scan, 60);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => { clearTimeout(mo._t); mo.disconnect(); io.disconnect(); };
  }, []);
}
