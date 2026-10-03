// Server-side abuse filter (English + Hindi/Hinglish). Block, don't censor.
const ENGLISH = ['fuck','fucking','fucker','motherfucker','shit','bullshit','bitch','asshole','bastard','slut','whore','cunt','dick','dickhead','pussy','cock','nigger','nigga','fag','faggot','retard','rape','rapist'];
const HINDI_LATIN = ['chutiya','chutiye','madarchod','behenchod','bhenchod','randi','randwa','gandu','gaandu','gaand','harami','haramzada','kutta','kutte','kamina','kamine','saala','saali','lund','lauda','loda','chodu','chod','jhantu','bhosdi','bhosdike','bhosdiwala','tatti'];
const HINDI_DEV = ['चूतिया','चूतिये','मादरचोद','भेनचोद','बहनचोद','रंडी','गांडू','गंदू','हरामी','हरामज़ादा','कुत्ता','कुत्ते','कमीना','कमीने','साला','साली','लंड','लौड़ा','चोद','भोसड़ी','भोसड़ीके','टट्टी'];
const ALL_LATIN = [...ENGLISH, ...HINDI_LATIN];

function normalize(str) {
  return str.toLowerCase()
    .replace(/[@]/g,'a').replace(/\$/g,'s').replace(/0/g,'o')
    .replace(/[1!]/g,'i').replace(/3/g,'e').replace(/4/g,'a')
    .replace(/[^a-z\u0900-\u097F\s]/g,' ').replace(/\s+/g,' ').trim();
}
function containsAbuse(text) {
  if (!text) return false;
  const n = normalize(text);
  for (const w of ALL_LATIN) {
    if (new RegExp(`\\b${w}\\b`,'i').test(n)) return true;
  }
  for (const w of HINDI_DEV) if (text.includes(w)) return true;
  return false;
}
module.exports = { containsAbuse };
