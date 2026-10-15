// Reusable fluid wordmark: letters rise out of blur one by one with a light
// sweep — Apple-keynote style. size: 'hero' (landing) or 'intro' (splash).
export default function FluidWord({ word = 'CampusConnect', size = 'hero', delay = 0, className = '' }) {
  return (
    <span className={`fluid-word fluid-${size} ${className}`} aria-label={word}>
      {word.split('').map((ch, i) => (
        <span key={i} className="intro-letter" style={{ animationDelay: `${delay + i * 0.045}s` }}>{ch}</span>
      ))}
      <span className="intro-sheen" style={{ animationDelay: `${delay + 0.4}s` }} aria-hidden />
    </span>
  );
}
