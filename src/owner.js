// The owner channel (2026-09-09).
//
// Eglent and Mea teach the agent by messaging it on WhatsApp like anyone else.
// A message from one of their numbers is NOT a lead: it is never escalated,
// never tagged, never followed up, and never gets the investment closing line.
// It is read as an instruction for FUTURE conversations, saved as a standing
// rule, and applied to every client reply from the next message on.
//
// Identity is matched on the phone number, not the CRM contact id, because a
// number can end up on more than one contact record over time. The last nine
// digits are compared, so +355 67 204 9400, 0672049400 and 355672049400 all
// resolve to the same person. Contact ids are matched too when they are known,
// so an owner who writes from a channel with no phone (Instagram) still counts.
//
// OWNER_NUMBERS / OWNER_CONTACT_IDS override the defaults from Render without a
// deploy; OWNER_MODE=off disables the whole channel and makes both numbers
// ordinary contacts again.

const DEFAULT_OWNERS = [
  { name: 'Eglent', phone: '+355672049400', contactId: 'U8zP6NNBfCVVvK6LBWe3' },
  { name: 'Mea', phone: '+355685171265', contactId: '' },
];

/** Digits only, last nine — the Albanian national significant number. */
export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D+/g, '');
  if (!digits) return '';
  return digits.length > 9 ? digits.slice(-9) : digits;
}

// "+355672049400:Eglent,+355685171265:Mea" — name is optional.
function parseNumberList(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [phone, name] = entry.split(':').map((s) => (s || '').trim());
      return { name: name || 'Owner', phone, contactId: '' };
    })
    .filter((o) => normalizePhone(o.phone));
}

// "id1:Eglent,id2:Mea"
function parseIdList(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [contactId, name] = entry.split(':').map((s) => (s || '').trim());
      return { name: name || 'Owner', phone: '', contactId };
    })
    .filter((o) => o.contactId);
}

/** The configured owners: env if set, otherwise Eglent and Mea. */
export function owners(env = process.env) {
  const fromEnv = [...parseNumberList(env.OWNER_NUMBERS), ...parseIdList(env.OWNER_CONTACT_IDS)];
  return fromEnv.length ? fromEnv : DEFAULT_OWNERS;
}

/** OWNER_MODE=off turns the channel back into ordinary contacts. */
export const ownerModeEnabled = (env = process.env) => String(env.OWNER_MODE || '').toLowerCase() !== 'off';

/**
 * Who sent this, if it is one of ours. Returns { name, phone, contactId } or null.
 * Matching is by phone first (stable across contact records), then contact id.
 */
export function identifyOwner({ contactId = '', phone = '' } = {}, env = process.env) {
  if (!ownerModeEnabled(env)) return null;
  const list = owners(env);
  const wanted = normalizePhone(phone);
  if (wanted) {
    const byPhone = list.find((o) => o.phone && normalizePhone(o.phone) === wanted);
    if (byPhone) return byPhone;
  }
  if (contactId) {
    const byId = list.find((o) => o.contactId && o.contactId === contactId);
    if (byId) return byId;
  }
  return null;
}
