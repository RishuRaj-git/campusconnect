// Seed demo content after first deploy:  npm run seed
// Requires MONGO_URI in backend/.env. Safe to re-run (skips if data exists).
require('dotenv').config();
const dns = require('dns');
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()));
const mongoose = require('mongoose');
const Discussion = require('../models/Discussion');

const SAMPLES = [
  { title: 'Welcome to CampusConnect 🎉', content: 'Introduce yourself! Which branch and year are you in?', author: 'campusbot' },
  { title: 'Best PYQs for End-Terms?', content: 'Drop links to the most useful previous-year papers you have found.', author: 'campusbot' },
  { title: 'Group study this weekend?', content: 'Anyone up for a library session on Saturday morning?', author: 'campusbot' }
];

(async () => {
  if (!process.env.MONGO_URI) { console.error('Missing MONGO_URI'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  const count = await Discussion.countDocuments();
  if (count > 0) { console.log(`Already seeded (${count} discussions). Nothing to do.`); process.exit(0); }
  await Discussion.insertMany(SAMPLES);
  console.log(`✅ Seeded ${SAMPLES.length} welcome discussions`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
