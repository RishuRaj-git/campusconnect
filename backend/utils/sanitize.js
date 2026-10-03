// Input sanitizers — user input must never reach a RegExp or a Mongo
// operator position unescaped/uncoerced (ReDoS + NoSQL injection).
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Force a plain string: blocks NoSQL operator injection where JSON bodies
// like {"username": {"$ne": null}} would otherwise become query operators.
function toStr(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

module.exports = { escapeRegExp, toStr };
