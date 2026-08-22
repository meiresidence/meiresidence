// "What's near Mei Residence?" — real answers from the Google Places API.
//
// Flow (2026-08-22, requested by Eglent):
//   client on WhatsApp: "Ku ka markete afer Mei Residence?"
//     -> GHL webhook -> index.js -> Claude decides a place lookup is needed
//     -> Claude calls the find_places tool
//     -> this module queries Google Places around Mei's coordinates
//     -> returns name / distance / address / open-now / hours / maps link
//     -> Claude writes the reply in the CLIENT'S language
//     -> GHL sends it back on WhatsApp
//
// The agent must NEVER invent a nearby shop, restaurant or distance. If this
// module is not configured (no GOOGLE_MAPS_API_KEY) the tool is not offered to
// the model at all, so the model falls back to the honest "I'll check with the
// team" path instead of hallucinating a supermarket.

// Mei Residence, Qerret (Golem), Durres — from the project's own Google Maps
// pin: https://maps.app.goo.gl/snznLJWiGkdEPpEC6
export const MEI_COORDS = { latitude: 41.221879, longitude: 19.5127497 };

const API = 'https://places.googleapis.com/v1/places';

// Two field masks, on purpose. Google bills the whole request at the highest
// SKU any requested field belongs to, and opening hours + ratings are the
// Enterprise tier: asking for them turns every lookup from Pro (5,000 free
// calls a month) into Enterprise (1,000 free). Name, address, location, type
// and the maps link answer "ku ka markete afer?" perfectly well on their own,
// so the expensive fields are only requested when the client actually asked
// about opening times — see include_hours in the tool schema.
const FIELDS_BASE = [
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryTypeDisplayName',
  'places.googleMapsUri',
];
const FIELDS_HOURS = [
  'places.currentOpeningHours.openNow',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.rating',
  'places.userRatingCount',
];
const fieldMask = (withHours) =>
  (withHours ? [...FIELDS_BASE, ...FIELDS_HOURS] : FIELDS_BASE).join(',');

// Buyer-facing categories -> Google Places types. Anything not listed here is
// answered with a free-text search instead, so the model is never blocked.
export const CATEGORY_TYPES = {
  supermarket: ['supermarket', 'grocery_store', 'convenience_store'],
  pharmacy: ['pharmacy', 'drugstore'],
  restaurant: ['restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  bar: ['bar'],
  bakery: ['bakery'],
  atm: ['atm'],
  bank: ['bank'],
  hospital: ['hospital'],
  doctor: ['doctor', 'medical_lab'],
  dentist: ['dentist'],
  school: ['school', 'primary_school', 'secondary_school'],
  gym: ['gym', 'fitness_center'],
  gas_station: ['gas_station'],
  parking: ['parking'],
  bus_station: ['bus_station'],
  hotel: ['hotel'],
  beach: ['beach'],
  park: ['park'],
  shopping: ['shopping_mall', 'department_store'],
};

export const isConfigured = () => !!process.env.GOOGLE_MAPS_API_KEY;

// ---- distance -------------------------------------------------------------
export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

// Rough walking time at 5 km/h — presented as "about", never as a promise.
const walkMinutes = (meters) => Math.max(1, Math.round(meters / 83));

// ---- tiny cache (place data barely moves; this keeps the API bill flat) ----
const cache = new Map();
const TTL_MS = 6 * 60 * 60 * 1000;
const cacheGet = (k) => {
  const hit = cache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { cache.delete(k); return null; }
  return hit.value;
};
const cacheSet = (k, value) => cache.set(k, { at: Date.now(), value });

async function post(path, body, languageCode, withHours) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': fieldMask(withHours),
    },
    body: JSON.stringify({ languageCode: languageCode || 'sq', ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    console.error('[places]', path, res.status, String(msg).slice(0, 200));
    throw new Error(`Places API: ${msg}`);
  }
  return data;
}

function shape(place) {
  const loc = place.location || {};
  const meters = loc.latitude ? haversineMeters(MEI_COORDS, loc) : null;
  return {
    name: place.displayName?.text || 'Unknown',
    kind: place.primaryTypeDisplayName?.text || null,
    address: place.formattedAddress || null,
    distance_m: meters,
    distance_text: meters == null ? null
      : meters < 1000 ? `${meters} m (~${walkMinutes(meters)} min walk)`
      : `${(meters / 1000).toFixed(1)} km`,
    open_now: place.currentOpeningHours?.openNow ?? null,
    hours: place.regularOpeningHours?.weekdayDescriptions?.slice(0, 7) || null,
    rating: place.rating ?? null,
    reviews: place.userRatingCount ?? null,
    maps_url: place.googleMapsUri || null,
  };
}

/**
 * Find real places near Mei Residence.
 * @param {object} o
 * @param {string} [o.category] one of CATEGORY_TYPES
 * @param {string} [o.query]    free text ("veterinar", "car rental")
 * @param {number} [o.radius_m] default 3000, max 15000
 * @param {number} [o.limit]    default 4, max 8
 * @param {string} [o.language] BCP-47 ('sq','en','de','pl','cs','it')
 */
export async function findPlaces({ category, query, radius_m, limit, language, include_hours } = {}) {
  if (!isConfigured()) throw new Error('GOOGLE_MAPS_API_KEY is not set');
  const radius = Math.min(Math.max(parseInt(radius_m, 10) || 3000, 200), 15000);
  const max = Math.min(Math.max(parseInt(limit, 10) || 4, 1), 8);
  const lang = language || 'sq';
  const hours = !!include_hours;
  const key = `${category || ''}|${query || ''}|${radius}|${max}|${lang}|${hours ? 'h' : ''}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const types = CATEGORY_TYPES[String(category || '').toLowerCase()];
  let data;
  if (types) {
    data = await post(':searchNearby', {
      includedTypes: types,
      maxResultCount: max,             // searchNearby: 1-20, no pagination
      rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: MEI_COORDS, radius } },
    }, lang, hours);
  } else {
    data = await post(':searchText', {
      textQuery: query || category || 'supermarket',
      pageSize: max,                   // searchText: maxResultCount is deprecated
      locationBias: { circle: { center: MEI_COORDS, radius } },
    }, lang, hours);
  }

  const results = (data.places || []).map(shape)
    .sort((a, b) => (a.distance_m ?? 1e9) - (b.distance_m ?? 1e9))
    .slice(0, max);
  const value = {
    origin: 'Mei Residence, Qerret, Durres',
    searched: types ? `category:${category}` : `text:${query || category}`,
    radius_m: radius,
    count: results.length,
    results,
  };
  cacheSet(key, value);
  return value;
}

export const PLACES_TOOL = {
  name: 'find_places',
  description:
    'Look up REAL places near Mei Residence (Qerret, Durres) with live Google Maps data: supermarkets, pharmacies, restaurants, cafes, bars, ATMs, banks, hospitals, doctors, schools, gyms, petrol stations, bus stops, beaches, shops. Call this EVERY time a client asks what is nearby, how far something is, where they can shop/eat/park/find a pharmacy, or what the area around the residence has. NEVER answer such a question from your own memory and NEVER invent a business name, a distance or an opening time — if this tool is unavailable, say you will check with the team instead. Returns name, straight-line distance from the residence, address, whether it is open now, opening hours and a Google Maps link.',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Preferred: one of ' + Object.keys(CATEGORY_TYPES).join(', '),
      },
      query: {
        type: 'string',
        description: 'Free text, only when no category fits (e.g. "car rental", "veterinar"). Write it in English or Albanian.',
      },
      radius_m: { type: 'number', description: 'Search radius in metres (default 3000, max 15000).' },
      limit: { type: 'number', description: 'How many places to return (default 4, max 8).' },
      language: { type: 'string', description: "The CLIENT'S language code so names and hours come back localised: sq, en, de, pl, cs, it." },
      include_hours: { type: 'boolean', description: 'Set true ONLY when the client asked about opening times, whether somewhere is open now, or ratings. It costs more, so leave it out for a plain "what is nearby" question.' },
    },
    required: [],
  },
};
