// "Ku ka markete afer Mei Residence?" — the nearby-places lookup.
//
// The flow Eglent asked for: client asks on WhatsApp -> the backend recognises a
// place question -> Google Places is queried around the residence's coordinates
// -> name, distance, address and hours come back -> Claude writes the reply ->
// WhatsApp sends it. This test covers the middle of that chain with a stubbed
// Google response: no API key, no network, no cost.
import assert from 'assert';

process.env.GOOGLE_MAPS_API_KEY = 'test-key';
const { findPlaces, MEI_COORDS, haversineMeters, PLACES_TOOL, isConfigured } =
  await import('../src/places.js');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failures++;
};

// Mei's real pin: https://maps.app.goo.gl/snznLJWiGkdEPpEC6
check('coordinates are the residence, not a guess at Durres',
  Math.abs(MEI_COORDS.latitude - 41.221879) < 1e-6 && Math.abs(MEI_COORDS.longitude - 19.5127497) < 1e-6);
check('distance maths is sane (the beach is ~280 m away)',
  Math.abs(haversineMeters(MEI_COORDS, { latitude: 41.2196, longitude: 19.5113 }) - 280) < 40);
check('the tool is only configured when a key exists', isConfigured() === true);
check('the tool description forbids inventing places',
  /NEVER invent a business name, a distance or an opening time/.test(PLACES_TOOL.description));

// --- stub Google -----------------------------------------------------------
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), body: JSON.parse(opts.body), key: opts.headers['X-Goog-Api-Key'], mask: opts.headers['X-Goog-FieldMask'] });
  return {
    ok: true,
    json: async () => ({ places: [
      { displayName: { text: 'Market Qerret' }, formattedAddress: 'Rruga e Plazhit, Qerret',
        location: { latitude: 41.2205, longitude: 19.5140 },
        primaryTypeDisplayName: { text: 'Supermarket' },
        currentOpeningHours: { openNow: true },
        regularOpeningHours: { weekdayDescriptions: ['E hene: 07:00–22:00'] },
        rating: 4.3, userRatingCount: 88,
        googleMapsUri: 'https://maps.google.com/?cid=1' },
      { displayName: { text: 'Conad Golem' }, formattedAddress: 'Golem, Durres',
        location: { latitude: 41.2300, longitude: 19.5200 },
        rating: 4.1, googleMapsUri: 'https://maps.google.com/?cid=2' },
    ] }),
  };
};

const res = await findPlaces({ category: 'supermarket', language: 'sq', limit: 3, include_hours: true });
check('queries the nearby-search endpoint for a known category',
  calls[0].url.endsWith('places:searchNearby'), calls[0].url);
check('searches around the residence, ranked by distance',
  calls[0].body.locationRestriction.circle.center.latitude === MEI_COORDS.latitude &&
  calls[0].body.rankPreference === 'DISTANCE');
check("asks Google in the client's language", calls[0].body.languageCode === 'sq');
check('sends the API key as a header, never in the URL',
  calls[0].key === 'test-key' && !calls[0].url.includes('test-key'));
check('returns the closest first, with a human distance',
  res.results[0].name === 'Market Qerret' && /m \(~\d+ min walk\)/.test(res.results[0].distance_text),
  JSON.stringify(res.results[0]));
check('carries open-now, hours and a maps link through',
  res.results[0].open_now === true && !!res.results[0].hours && !!res.results[0].maps_url);
check('missing hours on a place is null, never invented',
  res.results[1].open_now === null && res.results[1].hours === null);

check('opening hours are only requested when asked for (Enterprise SKU)',
  calls[0].mask.includes('currentOpeningHours'));

const before = calls.length;
await findPlaces({ category: 'supermarket', language: 'sq', limit: 3, include_hours: true });
check('identical lookups are cached, so the API bill stays flat', calls.length === before);

await findPlaces({ query: 'car rental', language: 'en' });
const textCall = calls[calls.length - 1];
check('falls back to text search for anything with no category',
  textCall.url.endsWith('places:searchText') && textCall.body.textQuery === 'car rental');
check('text search uses pageSize, not the deprecated maxResultCount',
  textCall.body.pageSize > 0 && textCall.body.maxResultCount === undefined);
check('a plain "what is nearby" question stays on the cheaper field mask',
  !textCall.mask.includes('OpeningHours') && !textCall.mask.includes('rating'));

const wide = await findPlaces({ category: 'pharmacy', radius_m: 99999 });
check('radius is clamped to a sane maximum', wide.radius_m === 15000);

// --- failure path ----------------------------------------------------------
globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: { message: 'REQUEST_DENIED' } }) });
let threw = false;
try { await findPlaces({ category: 'bank' }); } catch { threw = true; }
check('a Google error throws so the agent can say it will check, not guess', threw);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
