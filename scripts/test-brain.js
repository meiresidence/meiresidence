// Offline smoke test for the "brain" without WhatsApp.
// Usage: ANTHROPIC_API_KEY=... node scripts/test-brain.js "your message"
import { recordInbound } from '../src/memory.js';
import { generateReply } from '../src/claude.js';

const phone = 'test-000';
const msg = process.argv[2] || 'Sa kushton nje 1+1 me pamje nga deti?';
const conv = recordInbound(phone, 'Test User', msg);
const { text, escalated } = await generateReply(conv, phone);
console.log('\nCLIENT:', msg);
console.log('BOT   :', text);
console.log('escalated:', escalated);
process.exit(0);
