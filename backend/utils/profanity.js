// Server-side abuse filter (English + Hindi/Hinglish). Block, don't censor.
//
// NOTE: we evaluated https://github.com/isrgrajan/profanity-hindi-words-list
// (MIT) for this, but that repo ships no word data (README + LICENSE only),
// so the Hindi/Hinglish list below is hand-curated for campus-chat language:
// Devanagari, romanized spellings, and the abbreviations students actually type
// (bsdk, mc, bc). Contributions welcome — add variants to the arrays.
const ENGLISH = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
  'asshole', 'bastard', 'slut', 'whore', 'cunt', 'dick', 'dickhead', 'pussy',
  'cock', 'nigger', 'nigga', 'fag', 'faggot', 'retard', 'rape', 'rapist',
  'boob', 'boobs',
  // frequent double-letter evasions (safe: \b blocks 'shiitake'-style words)
  'fuuck', 'shiit', 'bittch'
];

// Hinglish / romanized Hindi — how these actually get typed in chat,
// including the short forms (bsdk, mc, bc, bkl)
const HINDI_LATIN = [
  'chutiya', 'chutiye', 'chutiyaa', 'chutya', 'chut',
  'madarchod', 'behenchod', 'bhenchod', 'madar',
  'randi', 'randwa',
  'gandu', 'gaandu', 'gaand', 'gand', 'gandmara',
  'harami', 'haramzada',
  'kutta', 'kutte', 'kuttiya', 'kutti',
  'kamina', 'kamine',
  'saala', 'saali',
  'lund', 'lauda', 'loda', 'laude', 'lawde', 'lodu',
  'chodu', 'chod', 'chodna', 'chodu',
  'jhantu', 'jhaatu',
  'bhosdi', 'bhosdike', 'bhosdiwala', 'bhosda', 'bsdk', 'bhosdk',
  'tatti', 'tatte',
  'bhadwa', 'bhadwe', 'dalal', 'dallal',
  'suar', 'suwar',
  'nanga', 'nangi',
  'hijra', 'hijde', 'chhakka',
  'mc', 'bc', 'bkl'
];

// Devanagari-script equivalents
const HINDI_DEV = [
  'चूतिया', 'चूतिये', 'चूत',
  'मादरचोद', 'मादर', 'भेनचोद', 'बहनचोद',
  'रंडी', 'गांडू', 'गांड', 'गंदू',
  'हरामी', 'हरामज़ादा',
  'कुत्ता', 'कुत्ते', 'कुतिया',
  'कमीना', 'कमीने', 'साला', 'साली',
  'लंड', 'लौड़ा', 'चोद', 'चोदना',
  'भोसड़ी', 'भोसड़ीके', 'टट्टी',
  'भड़वा', 'भड़वे', 'दलाल',
  'सूअर', 'सुअर',
  'हिजड़ा', 'छक्का'
];

const ALL_LATIN = [...ENGLISH, ...HINDI_LATIN];

// One combined pattern (compiled once) instead of ~100 regex tests per message.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LATIN_RE = new RegExp(`\\b(${ALL_LATIN.map(esc).join('|')})\\b`, 'i');

// Catches common obfuscation: l0da, ch*tiya, f.u.c.k, and stretched
// letters (chutiyaaa, fuuck) before matching.
function normalize(str) {
  return str.toLowerCase()
    .replace(/[@]/g, 'a').replace(/\$/g, 's').replace(/0/g, 'o')
    .replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/(.)\1{2,}/g, '$1') // runs of 3+ letters → 1, so 'fuuuck'→'fuck', 'chutiyaaa'→'chutiya'
    // (only 3+ on purpose: real doubles like 'tatti' must keep matching)
    .replace(/[^a-z\u0900-\u097F\s]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b([a-z])\s+(?=[a-z]\b)/g, '$1'); // join spaced letters: 'f u c k' → 'fuck'
}

/**
 * Returns true if the text contains a flagged English or Hindi word.
 * @param {string} text
 * @returns {boolean}
 */
function containsAbuse(text) {
  if (!text || typeof text !== 'string') return false;
  if (LATIN_RE.test(normalize(text))) return true;
  for (const word of HINDI_DEV) {
    if (text.includes(word)) return true;
  }
  return false;
}

module.exports = { containsAbuse };
