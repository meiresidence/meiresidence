// Guards the static location knowledge (knowledge/location.md) and its wiring.
// "Where is it / what's around it" must be answerable with NO Google Maps key.
import fs from 'node:fs';

const kb = fs.readFileSync(new URL('../knowledge/location.md', import.meta.url), 'utf8');
const idx = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

const must = [
  ['coordinates', '41.221879, 19.5127497'],
  ['maps pin', 'maps.app.goo.gl/snznLJWiGkdEPpEC6'],
  ['beach distance', '~280 m'],
  ['Kavaje', 'Kavaje'],
  ['Durres drive', '~20 min drive'],
  ['airport', '~40 min'],
  ['Tirana', '~45 min'],
  ['no-invention rule', 'never invent'],
];
const wiring = [
  ['loader', "knowledge/location.md"],
  ['prompt variable', 'LOCATION'],
  ['prompt section', "LOCATION & WHAT'S AROUND — AUTHORITATIVE"],
];

let bad = 0;
for (const [label, needle] of must) {
  const ok = kb.toLowerCase().includes(needle.toLowerCase());
  console.log(`${ok ? 'ok  ' : 'FAIL'}  location.md carries ${label}`);
  if (!ok) bad++;
}
for (const [label, needle] of wiring) {
  const ok = idx.includes(needle);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  index.js has ${label}`);
  if (!ok) bad++;
}

if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1); }
console.log('\nall location checks passed');
