import { useEffect } from 'react';

// Dynamic <title> + meta description per page (SPAs otherwise show one
// title to Google for every route). Pass noindex for private pages
// (/admin, /dms, /auth) so member-only areas never enter the index.
const BASE = 'CampusConnect';

export function usePageMeta({ title, description, noindex = false } = {}) {
  useEffect(() => {
    if (title) document.title = `${title} | ${BASE}`;
    if (description) {
      let el = document.querySelector('meta[name="description"]');
      if (el) el.setAttribute('content', description);
    }
    let robots = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.setAttribute('name', 'robots');
        document.head.appendChild(robots);
      }
      robots.setAttribute('content', 'noindex, nofollow');
    } else if (robots) {
      robots.setAttribute('content', 'index, follow');
    }
  }, [title, description, noindex]);
}
