// Per-contact conversation memory with lightweight JSON persistence.
// NOTE: on ephemeral hosts (e.g. Railway free tier) the ./data file may reset on
// redeploy. That is fine for a WhatsApp assistant. For durable storage across
// redeploys, mount a volume or swap this for Redis/Postgres later.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'conversations.json');

/** @type {Map<string, {
 *   name: string, history: {role:string, content:any}[],
 *   lastInbound: number, lastOutbound: number,
 *   handedOff: boolean, followUpCount: number, meta: object
 * }>} */
const store = new Map();

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      for (const [k, v] of Object.entries(raw)) store.set(k, v);
      console.log(`[memory] loaded ${store.size} conversations`);
    }
  } catch (e) {
    console.error('[memory] load failed', e.message);
  }
}
load();

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(store), null, 2));
    } catch (e) {
      console.error('[memory] save failed', e.message);
    }
  }, 1500);
}

export function getConversation(phone, name = '') {
  if (!store.has(phone)) {
    store.set(phone, {
      name,
      history: [],
      lastInbound: 0,
      lastOutbound: 0,
      handedOff: false,
      followUpCount: 0,
      meta: {},
    });
  }
  const c = store.get(phone);
  if (name && !c.name) c.name = name;
  return c;
}

export function recordInbound(phone, name, content) {
  const c = getConversation(phone, name);
  c.history.push({ role: 'user', content });
  c.lastInbound = Date.now();
  trim(c);
  saveSoon();
  return c;
}

export function recordOutbound(phone, content) {
  const c = getConversation(phone);
  c.history.push({ role: 'assistant', content });
  c.lastOutbound = Date.now();
  trim(c);
  saveSoon();
  return c;
}

// Append raw turns (used for the tool-use loop) without touching timestamps.
export function appendTurns(phone, turns) {
  const c = getConversation(phone);
  c.history.push(...turns);
  trim(c);
  saveSoon();
  return c;
}

export function markHandedOff(phone) {
  const c = getConversation(phone);
  c.handedOff = true;
  saveSoon();
}

export function updateMeta(phone, patch) {
  const c = getConversation(phone);
  c.meta = { ...c.meta, ...patch };
  saveSoon();
}

export function allConversations() {
  return [...store.entries()];
}

function trim(c) {
  const max = config.historyWindow;
  if (c.history.length > max) c.history = c.history.slice(-max);
}
