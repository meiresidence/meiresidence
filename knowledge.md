# Mei Residence — Knowledge Base (bot brain)

> Source of truth for the AI agent. Prices are INDICATIVE and each unit is tagged
> FREE / SOLD / RESERVED from the latest price list, but status changes fast — always
> confirm the current price and availability with the sales team before quoting.
> Never invent a number or term that isn't here. On returns: quote ONE figure only —
> the default is the 6% guaranteed annual return. Never quote two return figures in the
> same conversation, and never use ~8% / 8–10% at all.
> Use emojis very sparingly — at most one per message, and usually none. Do not open or decorate messages with emojis, and never use more than one in a single reply. Keep the tone warm through wording, not symbols.

## HARD RULES — these override everything else below

- **Parking posts / garage spots are NOT for sale.** They are not part of what Mei
  Residence sells. There is **no price** for a parking post — never quote one, never
  imply one exists, never say "around X" or "confirm the price with the team".
  If a client asks to buy a parking post or asks its price, say plainly that parking
  posts are not being sold, then hand the conversation to Eglent for anything further.
  (The building does have underground parking as a shared amenity — that is a facility,
  not a product for sale. Do not turn that into an offer.)

## What Mei Residence is
- Premium branded seaside residence — **Ramada Residences® by Wyndham**, in partnership
  with **Wyndham Hotels & Resorts** (world's largest hospitality company).
- Location: **Qerret, Durrës, on the Albanian Adriatic coast** — golden-sand beach and
  pine forest. **~280 m from the beach**, ~45 min from Tirana / ~40 min from Tirana
  International Airport. Exact location: https://maps.app.goo.gl/snznLJWiGkdEPpEC6
- **Architect: Roberto Felicetti** (robertofelicetti.it) — modern architecture, smooth
  lines and rounded shapes, high functionality.
- **Sold ONLY as an investment** (professionally managed short-term rentals). It is
  **NOT for personal use** and not a home to live in — always position it as an investment
  that generates rental income. If a client asks about buying it to live in / for personal
  use, clarify politely that the owners get **10 days free in high season + 2–3 weeks off-season.**
- Websites: meiresidence.com / mei.al / projekte.al · Instagram: @mei_residence.

## Sales team — route leads to the right manager
## Contact — the ONLY number the bot gives out
- **Eglent Bici** — Sales Manager: **+355 67 204 9400**
  This is the single number shared with clients, in every language and market.
- Email: **info@meiresidence.com**. Typically replies within ~1 hour.

### Internal routing (never shown to clients)
Used only in escalate_to_agent, never written in a reply:
Visard Koleci · Ania Pawlak (Poland) · Martin Chalupský (Czech Republic).
Polish leads → Ania; Czech leads → Martin; all others → Eglent.

## Developers / investment partners
Best Invest shpk — led by Eglent Bici (project lead/owner).
Agna Group — one of Albania's largest, most respected companies.
Lika Group — Switzerland-based, known for quality.

## Construction quality & materials (EU standards)
REHAU ARTEVO triple-glazed windows (thermal + acoustic insulation).
Full REHAU plumbing system.
KNAUF Diamond internal partitions with 10 cm rock wool (acoustic
insulation between apartments).
FIBRAN external facade (kapotë) with 8 cm rock wool (energy efficiency +
fire safety).

## Amenities — 500+ m² of premium shared spaces
- **Semi-Olympic outdoor pool**, modern **gym/fitness**, **kids' playground**,
  **concierge**, **restaurant & bar** (gourmet, local flavors), landscaped green areas.
- **24/7 security/surveillance**, high-speed/unlimited **Wi-Fi**, underground parking,
  elevators, A/C in every apartment, solar-heated hot water, video intercom, controlled access.
  500+ m² of premium shared/common areas.

## Investment & rental program (managed by Ramada® by Wyndham)
- Professional management + rental program; Wyndham handles marketing, bookings, cleaning,
  maintenance — fully hands-off passive income for the owner.
- **RETURN — ONE NUMBER ONLY. NEVER TWO.** There are two SEPARATE, MUTUALLY EXCLUSIVE
  programs. The investor chooses ONE. They are never combined, never added together,
  never mentioned in the same message.
  - **DEFAULT — say this and only this: 6% guaranteed annual return.**
    ("6% kthim vjetor i garantuar" / "6% guaranteed annual return.")
    This is the ONLY return figure the bot volunteers.
  - **Alternative — 65% of net rental income.** Mention this ONLY if the client
    explicitly asks about a revenue-share / percentage-of-rent model, or explicitly
    asks whether there is another option. Then explain it is an *alternative* to the
    6% — the investor picks one or the other, not both.
- **NEVER say "up to ~8%", "8–10%", or any other return percentage.** 6% and 65% are the
  only two figures that exist, and only one appears per conversation.
- Area appreciation: company cites property values rising (marketing claim) — do not
  attach a percentage to it.
- **RETIRED (24 Aug 2026): the ~0.6 EUR/m² monthly administration fee no longer
  applies.** Never quote it. The owner's only yearly cost is the annual property tax
  — see knowledge/contract-questions.md.
- Do NOT invent exact guarantee conditions and do NOT add disclaimers about a specialist
  confirming — engage warmly; only if asked for the precise legal terms, offer to connect
  them with the team.

## Payment
- **Flexible installment payments and financing options are available.** Exact terms
  (deposit %, schedule, financing) are arranged with the sales team — hand off for a
  personalized plan.

## Timeline
- Construction start **Q4 2024**; completion **Q4 2026** (ready by end of 2026);
  official opening **June 2027**.

## Apartment types & price ranges (EUR)
- **1+1:** free from ~93,200 (93,200–118,000) · **2+1:** free from ~129,000 (129,000–280,000) ·
  **3+1:** 224,000 · **Duplex:** free from ~111,300 (111,300–169,200).
- Ranges above cover **available** units only.
- Price depends on typology, floor and view (sea-view costs more).

## Still confirm with the team
- Conditions that could void the 6% and the remedy if it is not paid; whether any
  management fee exists beyond the yearly property tax; one-off taxes and fees at
  signing (notary, kadastra, transfer, VAT); current sold/available status per unit.
- Settled 24 Aug 2026 (see knowledge/contract-questions.md): seller is Mei Residence
  SHPK; three contracts, with the 6% inside the management contract, shared after the
  5% reservation; ownership passes when the Property Certificate is registered in the
  buyer's name; 6% is net from Mei and paid yearly; owner pays only the annual
  property tax; late instalments carry 0.1% per day.
## Tone & objection-handling phrasing (Eglent's verified style — add to voice guide):
Price-per-m² question → reframe: "Ne nuk shesim m2, por apartamente të branduar
nga Ramada Residences by Wyndham."
Generic "what do you sell" → "Ne nuk shesim apartament, por pronë të branduar nga
brandi më i madh në botë, të menaxhuar 365 ditë të vitit — ku ti edhe e përdor,
edhe fiton para çdo vit."
"Cheaper nearby" objection → "Janë 30% më lirë, por varet çfarë blen" + stress
brand, management, and build-quality difference.
## Inventory — apartments (indicative prices, EUR)
Prices are INDICATIVE; each unit is tagged **FREE / SOLD / RESERVED** from the latest
price list, but status changes fast — confirm current price and availability with the
sales team. Buyer names in the source sheet are confidential and never shown. Unit codes: A/B + floor + number;
type after the slash. Each unit has up to TWO links:
- `tour:` — the apartment's **FLOOR PLAN**, on app.screencast.com. THIS IS THE PLAN
  a buyer asks for when they say "planimetri", "plan", "layout" — it is not an
  optional extra and it is not a marketing video. It goes FIRST.
- `3d:` — an **interactive 3D plan** (dollhouse flythrough of the floor plan) at
  mei-tour.netlify.app
- `view:` — **sea** or **no sea** (see the sea-view rule below)

**When a client asks for a plan/planimetri, the layout, a video, photos or a
virtual tour of a unit, send the unit's `tour:` link — the FLOOR PLAN — FIRST,
then its `3d:` link.** Both together is right; the plan alone is acceptable;
**the 3D link on its own is NEVER acceptable** (rule from Eglent, 30 Aug 2026).
The 3D is an illustrative model of the typology — the plan is the apartment, and
that is what a buyer reads first. If a unit line has a `3d:` link but no
`tour:` link, send the 3D and say Eglent sends that unit's detailed floor plan;
never present the 3D as if it were the plan. If a unit line has only one of the two, send the one it has;
if it has neither, offer the general 3D catalogue https://mei-tour.netlify.app
and say the team can send the detailed floor-plan PDF on request. Note for the
3D plan: it is an illustrative model of the typology (the page says so) — real
3D views are being prepared.

### Sea view — how to answer "a ka pamje nga deti?" / "does it have sea view?"
Every unit line carries `view: sea` or `view: no sea`. Answer from that tag — never guess.

The building has five facades. **Only one facade has no sea view: the long front
that faces the road and the car park** (the B124–B131 / B224–B231 / B324–B331 /
B424–B431 stacks, the A120–A123 / A220–A223 / A320–A323 / A420–A423 stacks, and the
ground-floor A011–A015 / B016–B022 duplexes). Every other facade — the two inner
faces over the pool and restaurant, the playground end, and the open end — looks
toward the sea.

Say it honestly and positively:
- `view: sea` → "Po, ky apartament ka pamje nga deti." Mei Residence is ~280 m from
  the beach, so it is a sea view over the pine trees and the pool, not a
  first-line-of-the-beach panorama. Do not promise a full open sea panorama.
- `view: no sea` → say plainly that this one faces the inner road/parking side, then
  immediately offer the closest sea-view alternative of the same type and similar
  price from the list. Never present a road-side unit as sea view.
- Corner units A119 / A219 / A319 / A419 wrap around: they sit on the road front but
  their other face is the sea-facing end — describe them as "pamje anësore nga deti"
  (side sea view) and let the client see the 3D plan.
- If a client asks which floor is best for the view, higher is better (0–4); floor 4
  is the top floor.
- Sea view is NOT shown on meiresidence.com — a client cannot check it themselves, so
  if they want certainty on a specific unit, offer to have Eglent confirm it.


Totals: 152 apartments — **63 available, 53 sold, 2 reserved, 34 not-released / price-on-request**.
- 1+1: **37 available**, 93,200–118,000 EUR (44 sold, 1 reserved, 21 not-released/TBC)
- 2+1: **16 available**, 129,000–280,000 EUR (2 sold, 7 not-released)
- 3+1: **1 available**, 224,000 EUR (1 sold)
- Duplex: **9 available**, 111,300–169,200 EUR (6 sold, 1 reserved, 6 not-released/TBC)
- Parking posts: **NOT FOR SALE** — no price, not offered (see HARD RULES at the top)

Per-unit (unit | total m2 | price EUR | tour: FLOOR PLAN (screencast) | 3d: interactive 3D plan):

**KATI PËRDHE**
- APARTAMENT B001/Duplex — 93.3 m2 — RESERVED | 3d: https://mei-tour.netlify.app/b001/ | view: sea
- APARTAMENT B002/Duplex — 100.9 m2 — 163,500 EUR — FREE | tour: https://app.screencast.com/E8bM8jxHz6Qkk | 3d: https://mei-tour.netlify.app/b002/ | view: sea
- APARTAMENT B003/Duplex — 100.9 m2 — 161,300 EUR — SOLD | 3d: https://mei-tour.netlify.app/b003/ | view: sea
- APARTAMENT B004/Duplex — 100.9 m2 — 168,600 EUR — FREE | tour: https://app.screencast.com/IYVE3a4zc0RNj | 3d: https://mei-tour.netlify.app/b004/ | view: sea
- APARTAMENT B005/Duplex — 100.9 m2 — 169,200 EUR — FREE | tour: https://app.screencast.com/QfmVJku8WSDqa | 3d: https://mei-tour.netlify.app/b005/ | view: sea
- APARTAMENT B006/Duplex — 104.6 m2 — 168,000 EUR — FREE | tour: https://app.screencast.com/0B5749yWfSLIP | 3d: https://mei-tour.netlify.app/b006/ | view: sea
- APARTAMENT A007/Duplex — 102.3 m2 — 167,900 EUR — FREE | tour: https://app.screencast.com/0B5749yWfSLIP | 3d: https://mei-tour.netlify.app/a007/ | view: sea
- APARTAMENT A008/Duplex — 93.4 m2 — price on request | 3d: https://mei-tour.netlify.app/a008/ | view: sea
- APARTAMENT A009/Duplex — 96.4 m2 — price on request | 3d: https://mei-tour.netlify.app/a009/ | view: sea
- APARTAMENT A010/Duplex — 95.9 m2 — SOLD | 3d: https://mei-tour.netlify.app/a010/ | view: sea
- APARTAMENT A011/Duplex — 72.6 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a011/ | view: no sea
- APARTAMENT A012/Duplex — 74.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a012/ | view: no sea
- APARTAMENT A013/Duplex — 110.2 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a013/ | view: no sea
- APARTAMENT A014/Duplex — 79.1 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a014/ | view: no sea
- APARTAMENT A015/Duplex — 79.1 m2 — 117,200 EUR — SOLD | 3d: https://mei-tour.netlify.app/a015/ | view: no sea
- APARTAMENT B016/Duplex — 79.1 m2 — 120,000 EUR — FREE | tour: https://app.screencast.com/G4odvVr0Q3vxj | 3d: https://mei-tour.netlify.app/b016/ | view: no sea
- APARTAMENT B017/Duplex — 76.3 m2 — 109,500 EUR — SOLD | 3d: https://mei-tour.netlify.app/b017/ | view: no sea
- APARTAMENT B018/Duplex — 76.3 m2 — 109,500 EUR — SOLD | 3d: https://mei-tour.netlify.app/b018/ | view: no sea
- APARTAMENT B019/Duplex — 76.3 m2 — 111,300 EUR — FREE | tour: https://app.screencast.com/MPzwEy4BM3EpB | 3d: https://mei-tour.netlify.app/b019/ | view: no sea
- APARTAMENT B020/Duplex — 76.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b020/ | view: no sea
- APARTAMENT B021/Duplex — 79.1 m2 — 120,000 EUR — FREE | tour: https://app.screencast.com/IBdRkdUyyFkVd | 3d: https://mei-tour.netlify.app/b021/ | view: no sea
- APARTAMENT B022/Duplex — 98.4 m2 — 140,500 EUR — FREE | tour: https://app.screencast.com/IBdRkdUyyFkVd | 3d: https://mei-tour.netlify.app/b022/ | view: no sea

**KATI PARË**
- APARTAMENT B101/1+1 — 50.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b101/ | view: sea
- APARTAMENT NR.2/1+1/BA — 86.6 m2 — SOLD
- APARTAMENT B103/2+1 — 111.5 m2 — 205,000 EUR — FREE | tour: https://app.screencast.com/Fr5RoMOcwpRi9 | 3d: https://mei-tour.netlify.app/b103/ | view: sea
- APARTAMENT B104/1+1 — 57.1 m2 — 93,200 EUR — FREE | tour: https://app.screencast.com/Nl1DPvTiXjUpC | view: sea
- APARTAMENT B104/2+1 — 80.3 m2 — 135,000 EUR — FREE | tour: https://app.screencast.com/WwjpMvyJricRT | 3d: https://mei-tour.netlify.app/b104/ | view: sea
- APARTAMENT NR.B105/1+1 — 54.4 m2 — SOLD | 3d: https://mei-tour.netlify.app/b105/ | view: sea
- APARTAMENT NR.B106/1+1 — 53.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b106/ | view: sea
- APARTAMENT NR.B107/1+1 — 53.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b107/ | view: sea
- APARTAMENT B108/1+1 — 56.5 m2 — 99,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/b108/ | view: sea
- APARTAMENT A109/2+1 — 139.4 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a109/ | view: sea
- APARTAMENT A110/1+1 — 52.7 m2 — 99,800 EUR — FREE | tour: https://app.screencast.com/3cdIkzlvSOM1e | 3d: https://mei-tour.netlify.app/a110/ | view: sea
- APARTAMENT A111/1+1 — 52.2 m2 — 95,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/a111/ | view: sea
- APARTAMENT A112/1+1 — 52.2 m2 — 95,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/a112/ | view: sea
- APARTAMENT A113/2+1 — 122.9 m2 — 216,000 EUR — FREE | tour: https://app.screencast.com/NSIbcrq5lhkXQ | 3d: https://mei-tour.netlify.app/a113/ | view: sea
- APARTAMENT A114/2+1 — 95.2 m2 — 171,000 EUR — FREE | tour: https://app.screencast.com/NSIbcrq5lhkXQ | 3d: https://mei-tour.netlify.app/a114/ | view: sea
- APARTAMENT A115/1+1 — 52.5 m2 — 91,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/a115/ | view: sea
- APARTAMENT A116/1+1 — 52.8 m2 — 96,000 EUR — FREE | tour: https://app.screencast.com/fdBigPRUVKxPX | 3d: https://mei-tour.netlify.app/a116/ | view: sea
- APARTAMENT A117/1+1 — 55.6 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a117/ | view: sea
- APARTAMENT A118/1+1/P — 114.4 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a118/ | view: sea
- APARTAMENT A119/2+1/P — 139.2 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a119/ | view: sea
- APARTAMENT A120/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a120/ | view: no sea
- APARTAMENT A121/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a121/ | view: no sea
- APARTAMENT A122/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a122/ | view: no sea
- APARTAMENT A123/1+1 — 62.4 m2 — 94,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/a123/ | view: no sea
- APARTAMENT B124/1+1 — 61.7 m2 — 98,000 EUR — FREE | tour: https://app.screencast.com/62fDXoFnUvjml | 3d: https://mei-tour.netlify.app/b124/ | view: no sea
- APARTAMENT NR B125/1+1 — 62.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b125/ | view: no sea
- APARTAMENT NR B126/1+1 — 60.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b126/ | view: no sea
- APARTAMENT NR B127/1+1 — 60.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b127/ | view: no sea
- APARTAMENT NR B128/1+1 — 60.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b128/ | view: no sea
- APARTAMENT B129/1+1 — 60.3 m2 — 89,600 EUR — SOLD | 3d: https://mei-tour.netlify.app/b129/ | view: no sea
- APARTAMENT B130/1+1 — 60.3 m2 — 89,600 EUR — SOLD | 3d: https://mei-tour.netlify.app/b130/ | view: no sea
- APARTAMENT B131/1+1 — 62.3 m2 — 93,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/b131/ | view: no sea

**KATI 2**
- APARTAMENT B201/1+1 — 50.6 m2 — 102,000 EUR — FREE | tour: https://app.screencast.com/gwDKLDiLg8qoN | 3d: https://mei-tour.netlify.app/b201/ | view: sea
- APARTAMENT B202/2+1 — 86.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b202/ | view: sea
- APARTAMENT B203/2+1 — 111.5 m2 — 215,300 EUR — FREE | tour: https://app.screencast.com/ek8OHxjcEExGi | 3d: https://mei-tour.netlify.app/b203/ | view: sea
- APARTAMENT B204/3+1 — 137.4 m2 — 224,000 EUR — FREE | view: sea
- APARTAMENT B204/1+1 — 57.1 m2 — 95,000 EUR — FREE | tour: https://app.screencast.com/epghkZH96WVxK | view: sea
- APARTAMENT B204/1/2+1 — 80.3 m2 — 129,000 EUR — FREE | tour: https://app.screencast.com/YPWsMQIOAaUJv | 3d: https://mei-tour.netlify.app/b204/ | view: sea
- APARTAMENT B205/1+1 — 54.4 m2 — 93,600 EUR — SOLD | 3d: https://mei-tour.netlify.app/b205/ | view: sea
- APARTAMENT B206/1+1 — 53.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b206/ | view: sea
- APARTAMENT B207/1+1 — 53.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b207/ | view: sea
- APARTAMENT B208/1+1 — 56.5 m2 — SOLD | 3d: https://mei-tour.netlify.app/b208/ | view: sea
- APARTAMENT A209/2+1 — 139.4 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a209/ | view: sea
- APARTAMENT A210/1+1 — 52.7 m2 — 99,200 EUR — RESERVED | 3d: https://mei-tour.netlify.app/a210/ | view: sea
- APARTAMENT A211/1+1 — 52.2 m2 — 103,500 EUR — FREE | tour: https://app.screencast.com/Kw74nXxm85Pgt | 3d: https://mei-tour.netlify.app/a211/ | view: sea
- APARTAMENT A212/1+1 — 52.2 m2 — 103,500 EUR — FREE | tour: https://app.screencast.com/M4w08lIJEVLgw | 3d: https://mei-tour.netlify.app/a212/ | view: sea
- APARTAMENT A213/2+1 — 122.9 m2 — 229,000 EUR — FREE | 3d: https://mei-tour.netlify.app/a213/ | view: sea
- APARTAMENT A214/2+1 — 95.2 m2 — 175,000 EUR — FREE | tour: https://app.screencast.com/Axddx2HhaMUDv | 3d: https://mei-tour.netlify.app/a214/ | view: sea
- APARTAMENT A215/1+1 — 52.5 m2 — 98,000 EUR — FREE | tour: https://app.screencast.com/hRJNNyxJCo0Ph | 3d: https://mei-tour.netlify.app/a215/ | view: sea
- APARTAMENT A216/1+1 — 52.8 m2 — 98,000 EUR — FREE | tour: https://app.screencast.com/hRJNNyxJCo0Ph | 3d: https://mei-tour.netlify.app/a216/ | view: sea
- APARTAMENT A217/1+1 — 55.6 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a217/ | view: sea
- APARTAMENT A218/2+1 — 114.4 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a218/ | view: sea
- APARTAMENT A219/2+1 — 139.2 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a219/ | view: sea
- APARTAMENT A220/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a220/ | view: no sea
- APARTAMENT A221/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a221/ | view: no sea
- APARTAMENT A222/1+1 — 60.3 m2 — 95,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/a222/ | view: no sea
- APARTAMENT A223/1+1 — 62.4 m2 — 104,000 EUR — FREE | tour: https://app.screencast.com/bDdzfLaURJ9J9 | 3d: https://mei-tour.netlify.app/a223/ | view: no sea
- APARTAMENT B224/1+1 — 61.7 m2 — 103,500 EUR — FREE | tour: https://app.screencast.com/yop7U5pl4jVx7 | 3d: https://mei-tour.netlify.app/b224/ | view: no sea
- APARTAMENT B225/1+1 — 62.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b225/ | view: no sea
- APARTAMENT B226/1+1 — 60.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b226/ | view: no sea
- APARTAMENT B227/1+1 — 60.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b227/ | view: no sea
- APARTAMENT B228/1+1 — 60.3 m2 — 103,200 EUR — FREE | tour: https://app.screencast.com/wX9i9nXEkIeU5 | 3d: https://mei-tour.netlify.app/b228/ | view: no sea
- APARTAMENT B229/1+1 — 60.3 m2 — price on request | 3d: https://mei-tour.netlify.app/b229/ | view: no sea
- APARTAMENT B230/1+1 — 60.3 m2 — 103,200 EUR — FREE | tour: https://app.screencast.com/KtNxaFgBhqUp5 | 3d: https://mei-tour.netlify.app/b230/ | view: no sea
- APARTAMENT B231/1+1 — 62.3 m2 — 104,000 EUR — FREE | tour: https://app.screencast.com/cPgezfZrM0WKt | 3d: https://mei-tour.netlify.app/b231/ | view: no sea

**KATI  3**
- APARTAMENT B301/1+1 — 50.6 m2 — 108,800 EUR — FREE | tour: https://app.screencast.com/iI9Ze1310NMb2 | 3d: https://mei-tour.netlify.app/b301/ | view: sea
- APARTAMENT B302/2+1 — 86.6 m2 — 178,000 EUR — FREE | tour: https://app.screencast.com/ZLKvUhKeUrUbf | 3d: https://mei-tour.netlify.app/b302/ | view: sea
- APARTAMENT B303/2+1 — 111.5 m2 — 216,000 EUR — FREE | tour: https://app.screencast.com/ZLKvUhKeUrUbf | 3d: https://mei-tour.netlify.app/b303/ | view: sea
- APARTAMENT B304/1+1 — 57.1 m2 — 102,000 EUR — FREE | view: sea
- APARTAMENT B304/1/2+1 — 80.3 m2 — 132,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/b304/ | view: sea
- APARTAMENT B305/1+1 — 54.4 m2 — SOLD | 3d: https://mei-tour.netlify.app/b305/ | view: sea
- APARTAMENT B306/1+1 — 53.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b306/ | view: sea
- APARTAMENT B307/1+1 — 53.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b307/ | view: sea
- APARTAMENT B308/1+1 — 56.5 m2 — SOLD | 3d: https://mei-tour.netlify.app/b308/ | view: sea
- APARTAMENT A309/2+1 — 139.4 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a309/ | view: sea
- APARTAMENT A310/1+1 — 52.7 m2 — SOLD | 3d: https://mei-tour.netlify.app/a310/ | view: sea
- APARTAMENT A311/1+1 — 52.2 m2 — SOLD | 3d: https://mei-tour.netlify.app/a311/ | view: sea
- APARTAMENT A312/1+1 — 52.2 m2 — SOLD | 3d: https://mei-tour.netlify.app/a312/ | view: sea
- APARTAMENT A313/2+1 — 122.9 m2 — 242,000 EUR — FREE | 3d: https://mei-tour.netlify.app/a313/ | view: sea
- APARTAMENT A314/2+1 — 95.2 m2 — 173,000 EUR — FREE | tour: https://app.screencast.com/fudk6XbuEhj5Q | 3d: https://mei-tour.netlify.app/a314/ | view: sea
- APARTAMENT A315/1+1 — 52.5 m2 — 95,700 EUR — SOLD | 3d: https://mei-tour.netlify.app/a315/ | view: sea
- APARTAMENT A316/1+1 — 52.8 m2 — 99,800 EUR — FREE | tour: https://app.screencast.com/RHwjMv2ROQwoT | 3d: https://mei-tour.netlify.app/a316/ | view: sea
- APARTAMENT A317/1+1 — 55.6 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a317/ | view: sea
- APARTAMENT A318/1+1 — 114.4 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a318/ | view: sea
- APARTAMENT A319/1+1 — 139.2 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a319/ | view: sea
- APARTAMENT A320/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a320/ | view: no sea
- APARTAMENT A321/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a321/ | view: no sea
- APARTAMENT A322/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a322/ | view: no sea
- APARTAMENT A323/1+1 — 62.4 m2 — 105,000 EUR — FREE | tour: https://app.screencast.com/PWkatCwC9kHkO | 3d: https://mei-tour.netlify.app/a323/ | view: no sea
- APARTAMENT B324/1+1 — 61.7 m2 — 105,200 EUR — FREE | tour: https://app.screencast.com/2AgYKOsOkYD4l | 3d: https://mei-tour.netlify.app/b324/ | view: no sea
- APARTAMENT B325/1+1 — 62.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b325/ | view: no sea
- APARTAMENT B326/1+1 — 60.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b326/ | view: no sea
- APARTAMENT B327/1+1 — 60.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b327/ | view: no sea
- APARTAMENT B328/1+1 — 60.3 m2 — SOLD | 3d: https://mei-tour.netlify.app/b328/ | view: no sea
- APARTAMENT B329/1+1 — 60.3 m2 — 105,200 EUR — SOLD | 3d: https://mei-tour.netlify.app/b329/ | view: no sea
- APARTAMENT B330/1+1 — 60.3 m2 — 105,200 EUR — SOLD | 3d: https://mei-tour.netlify.app/b330/ | view: no sea
- APARTAMENT B331/1+1 — 62.3 m2 — 107,000 EUR — FREE | tour: https://app.screencast.com/9GvEZn5urJGkE | 3d: https://mei-tour.netlify.app/b331/ | view: no sea

**KATI 4**
- APARTAMENT B401/1+1 — 50.6 m2 — 107,000 EUR — FREE | tour: https://app.screencast.com/CfmhrRFxBI9fS | 3d: https://mei-tour.netlify.app/b401/ | view: sea
- APARTAMENT B402/2+1 — 86.6 m2 — 196,500 EUR — FREE | tour: https://app.screencast.com/CfmhrRFxBI9fS | 3d: https://mei-tour.netlify.app/b402/ | view: sea
- APARTAMENT NR.B403/1+1 — 111.5 m2 — SOLD | 3d: https://mei-tour.netlify.app/b403/ | view: sea
- APARTAMENT B404/3+1 — 137.4 m2 — 280,000 EUR — SOLD | view: sea
- APARTAMENT B404/1+1 — 57.1 m2 — 117,000 EUR — FREE | tour: https://app.screencast.com/Pzj8UdMMzEDeo | view: sea
- APARTAMENT B404/1/2+1 — 80.3 m2 — 163,000 EUR — FREE | tour: https://app.screencast.com/Pzj8UdMMzEDeo | 3d: https://mei-tour.netlify.app/b404/ | view: sea
- APARTAMENT B405/1+1 — 54.4 m2 — SOLD | 3d: https://mei-tour.netlify.app/b405/ | view: sea
- APARTAMENT B406/1+1 — 53.6 m2 — 111,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/b406/ | view: sea
- APARTAMENT B407/1+1 — 53.6 m2 — SOLD | 3d: https://mei-tour.netlify.app/b407/ | view: sea
- APARTAMENT B408/1+1 — 56.5 m2 — 118,000 EUR — FREE | tour: https://app.screencast.com/4OykkOaY8Hyqu | 3d: https://mei-tour.netlify.app/b408/ | view: sea
- APARTAMENT A409/2+1 — 139.4 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a409/ | view: sea
- APARTAMENT A410/1+1 — 52.7 m2 — 109,800 EUR — FREE | tour: https://app.screencast.com/pupuMGr0kzQNg | 3d: https://mei-tour.netlify.app/a410/ | view: sea
- APARTAMENT A411/1+1 — 52.2 m2 — 105,000 EUR — FREE | tour: https://app.screencast.com/3OaudalOe1wHC | 3d: https://mei-tour.netlify.app/a411/ | view: sea
- APARTAMENT A412/1+1 — 52.2 m2 — 105,000 EUR — SOLD | 3d: https://mei-tour.netlify.app/a412/ | view: sea
- APARTAMENT A413/2+1 — 122.9 m2 — 280,000 EUR — FREE | 3d: https://mei-tour.netlify.app/a413/ | view: sea
- APARTAMENT A414/2+1 — 95.2 m2 — 199,000 EUR — FREE | tour: https://app.screencast.com/D3wlfjY6RRLpm | 3d: https://mei-tour.netlify.app/a414/ | view: sea
- APARTAMENT A415/1+1 — 52.5 m2 — 99,000 EUR — FREE | tour: https://app.screencast.com/lCGMFXHa4WR4x | 3d: https://mei-tour.netlify.app/a415/ | view: sea
- APARTAMENT A416/1+1 — 52.8 m2 — 99,800 EUR — FREE | tour: https://app.screencast.com/NG1aLM79fFvxa | 3d: https://mei-tour.netlify.app/a416/ | view: sea
- APARTAMENT A417/1+1 — 55.6 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a417/ | view: sea
- APARTAMENT A418/1+1 — 114.4 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a418/ | view: sea
- APARTAMENT A419/1+1 — 139.2 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a419/ | view: sea
- APARTAMENT A420/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a420/ | view: no sea
- APARTAMENT A421/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a421/ | view: no sea
- APARTAMENT A422/1+1 — 60.3 m2 — not yet released (price on request) | 3d: https://mei-tour.netlify.app/a422/ | view: no sea
- APARTAMENT A423/1+1 — 62.4 m2 — 115,000 EUR — FREE | tour: https://app.screencast.com/NG1aLM79fFvxa | 3d: https://mei-tour.netlify.app/a423/ | view: no sea
- APARTAMENT B424/1+1 — 61.7 m2 — 114,000 EUR — FREE | tour: https://app.screencast.com/lDBv0yfbnjBHD | 3d: https://mei-tour.netlify.app/b424/ | view: no sea
- APARTAMENT B425/1+1 — 62.3 m2 — 109,800 EUR — FREE | tour: https://app.screencast.com/xa7NmmtJ83rFh | 3d: https://mei-tour.netlify.app/b425/ | view: no sea
- APARTAMENT B426/1+1 — 60.3 m2 — 109,800 EUR — FREE | tour: https://app.screencast.com/xa7NmmtJ83rFh | 3d: https://mei-tour.netlify.app/b426/ | view: no sea
- APARTAMENT B427/1+1 — 60.3 m2 — 109,800 EUR — FREE | tour: https://app.screencast.com/wAWszzab47FuP | 3d: https://mei-tour.netlify.app/b427/ | view: no sea
- APARTAMENT B428/1+1 — 60.3 m2 — 109,800 EUR — FREE | tour: https://app.screencast.com/M4J8looA9x9w9 | 3d: https://mei-tour.netlify.app/b428/ | view: no sea
- APARTAMENT B429/1+1 — 60.3 m2 — 109,800 EUR — FREE | tour: https://app.screencast.com/s6uHQ5Fcadz4n | 3d: https://mei-tour.netlify.app/b429/ | view: no sea
- APARTAMENT B430/1+1 — 60.3 m2 — 109,800 EUR — FREE | tour: https://app.screencast.com/W2lkg3szI9LZt | 3d: https://mei-tour.netlify.app/b430/ | view: no sea
- APARTAMENT B431/1+1 — 62.3 m2 — 113,500 EUR — FREE | tour: https://app.screencast.com/W2lkg3szI9LZt | 3d: https://mei-tour.netlify.app/b431/ | view: no sea



# Mei Residence — Agent Learnings

_A living document. Updated automatically every morning from the previous day's GoHighLevel conversations. Any Claude session in this project should read this file before answering buyer questions or writing content._

**Privacy rule for this file:** never record client names, phone numbers, emails, or any personal identifier. Patterns only. No internal sales totals, no pipeline numbers.

**Two GHL sub-accounts.** *Mei Residence* (mostly +355 domestic, WhatsApp + Instagram) and *Mei Residence 2* (broadcast/follow-up campaigns, overwhelmingly German and Swiss diaspora). They behave differently — see §6.


---

## 0. Confirmed facts from the sales team
_(overrides older guidance where they conflict)_

- **ONE return figure per conversation, never two** (confirmed 2026-08-10). Two mutually exclusive programs; the investor picks one:
  - **(a) 6% guaranteed annual return, 5 years — the DEFAULT.** The only figure ever volunteered: *"6% kthim vjetor i garantuar."*
  - **(b) 65% of net rental income** — only if the client explicitly asks about a revenue-share model. An *alternative*, never an addition.
  - Never combine them. **The "up to ~8%" / "8–10%" figure is retired everywhere.** Applied to the agent repo (`index.js`, `knowledge.md`, `knowledge/system-prompt.md`).
  - **Still open:** the project's custom instructions in claude.ai still say "up to ~8% annual return, projected not guaranteed", and `knowledge/mei-residence-kb.md` in the synced repo still says "ROI up to ~8%" and lists **Studio/Garsoniere** as a typology and "~200 m from the sea". All need correcting at source or they keep reappearing.
- Reference figure for 6%: on the average listed price (~€130,000) ≈ €7,800/year; 1+1 (avg ~€103,000) ≈ €6,200/year; 2+1 (avg ~€191,000) ≈ €11,500/year. Wyndham runs marketing, bookings, cleaning, maintenance; the owner collects.
- **Timeline:** construction started Q4 2024, **completes Q4 2026, official opening June 2027.**
- **Typologies:** 1+1, 2+1, 3+1, Duplex. **No studios / garsoniere.**
- **Distance to the sea: ~280 m** (the repo KB's "200 m" is stale).
- **We are not an agency:** Mei Realty is the in-house sales team for Mei Residence (Best Invest shpk project, branded/managed by Ramada Residences by Wyndham).

## 1. Most frequent buyer questions

- **"A mund të marr më shumë informacion për këtë?"** — pasted from the Facebook ad headline *"6% kthim i garantuar në vit për 5 vite"*. Still the biggest inbound trigger. Reply: the program in 2–3 lines (Wyndham-managed → owner collects → **6% guaranteed**, one figure only), then ask **which typology**. Nearly every lead answers that.
- **"Po mi dërgo" / "dërgomi opsionet"** — by far the most common reply to a broadcast (~25 in a single send). They want a small hand-picked selection with m², price and a tour link — not the whole price list.
- **"Ku ndodhet objekti?" / "Ku janë ndërtesat, në Vlorë?"** — asked repeatedly by diaspora leads. Many do **not** know where the project is. Always name **Qerret, Durrës** early, and put it in every broadcast template.
- **"Po nëse në një të ardhme dua ta marr të jetoj vetë në apartament?"** — see the contradiction box above; defer to a specialist for now.
- **"6% të vlerës së investuar dmth?"** — buyers want to know what the 6% is calculated on. Confirm it is an annual return on the investment, and route to a specialist for the written terms (see §5).
- **"Për sa vjet bëhen kontratat? Mirëmbajtja kujt i përket?"** — contract duration + who covers maintenance. Answer the maintenance half concretely (Wyndham), defer only the contract term.
- **"Çka është nete?"** — buyers don't know the term: *"'Net' do të thotë e ardhura nga qiraja pasi zbriten shpenzimet e menaxhimit (pastrim, mirëmbajtje, marketing). Nga ajo shumë e mbetur, investitori merr 65%."*
- **"Sa kushton një 1+1?" / "Sa shkon m²?"** — give the range, note it depends on floor and sea view, confirm availability with the team, then ask which floor/view. 1+1 is the most requested typology.
- **"Kur përfundon ndërtimi?"** — Q4 2026 / June 2027 (§0).
- **Price-per-m² challenge** — the line that works: *"Ne nuk i shesim apartamentet me çmim për m², por si prona të plota, të branduara nga Ramada Residences by Wyndham. Çmimi përfshin cilësinë e ndërtimit, menaxhimin nga Wyndham dhe programin e qirasë — jo thjesht metrat katrorë."*
- **Floor numbering** confuses Albanian buyers: *Kati Përdhe* = ground floor, *Kati i Parë* = the floor above.

## 2. Objections & how they were handled

- **"So it's 6% AND 65% AND ~8%?"** → *"Jo, kështu nuk funksionon — janë dy programe të veçanta dhe zgjidhet vetëm njëri, jo të dyja së bashku, dhe nuk ka asnjë shifër tjetër si '~8%'."* Then offer to go deeper on one.
- **"Është shumë e shtrenjtë për mua" / budget below the 1+1 entry** — common in diaspora broadcasts. Don't discount and don't push; name the smallest 1+1 honestly and offer to flag them when something fits.
- **"Is everything you're telling me actually correct?"** → short empathy + written confirmation from a specialist before any decision.
- **"It's a big step / I want to see it in person"** → validate, offer a site visit, hand to a specialist.
- **"Too expensive"** (investment framing) → move to the income side, **6% guaranteed**, one figure only, then hand over for the payment plan.
- **"I bought elsewhere" / "I'm investing in Switzerland"** → thank them warmly and leave the door open. Several such leads still refer friends — one volunteered German contacts who were interested.

## 3. Phrasing that worked

- **Virtual tour links do the selling.** 2–3 concrete units with area, price and a tour link produce the strongest replies (*"Ato i pashë dhe më pëlqyen."*).
- Close every answer with **one question** ("Cili tip apartamenti — 1+1, 2+1 apo duplex?").
- *"280 metra nga deti"* and *"merre para se çmimet të rriten"* still carry re-engagement.
- Warm Albanian second person (*ti/ty*) matches how these leads write.
- **Leads who have walked the site come back warm on their own**, months later, unprompted. Treat any "kalova për vizitë" message as a hot re-engagement window.

## 4. What stalled conversations

- **Broadcast replies left unanswered.** A single follow-up send produced ~68 live inbound replies within two hours, with nobody responding. Reply volume is front-loaded — the first hour is where the intent is. A broadcast with no one staffed to answer burns the list.
- **Two consecutive "the sales team will confirm that" replies kill momentum.** A buyer deferred twice in a row (orientation, then floor plan) replied *"Ok gjithë të mirat"* and went quiet. If one answer must be deferred, answer the next one concretely.
- **Handing over a bare phone number with no context.** An Instagram lead got just the manager's number — no reason, no question. Route with one line of substance + the contact.
- Generic "how can I help you?" after a lead already asked something specific makes them repeat themselves.
- Long multi-paragraph WhatsApp answers get skimmed; 2–4 lines + one question wins.

## 5. Gaps — things buyers ask that we can't answer from the files

1. **Personal use / owner nights** — see the contradiction box at the top. Highest priority; it is being asked live and we have three conflicting sources.
2. **Is there a finished show apartment on site, and how are site visits booked?** A lead bringing a client for **two apartments** asked what could be walked through, on one fixed date. We had nothing. Highest-intent lead type we get.
3. **Contract duration** — how many years the rental/management contract runs, and what happens at the end. Asked repeatedly; nothing written anywhere.
4. **What the 6% is calculated on**, and what happens after year 5.
5. **Orientation / view per unit.** No orientation column in the price list. Recurring blocker.
6. **Floor-level site plans (planimetria e katit).** No shareable PDF.
7. **Payment/installment procedure.** An approved one-paragraph summary of the reservation steps would keep threads warm.
8. **Beach access** — asked whether access has been improved recently. No current answer.
9. **Price consistency.** Always read the current spreadsheet before naming a figure — never reuse a price seen in an earlier chat.

## 6. Language & audience notes

- **Mei Residence (account 1):** mostly Albanian, +355 domestic, WhatsApp + Instagram DMs. Instagram is mixed — expect collaboration/PR/agency pitches alongside buyers; don't sell to those, route to a human.
- **Mei Residence 2 (account 2):** broadcast/follow-up campaigns to **German (+49) and Swiss (+41) diaspora**, roughly equal shares, with a small Albanian, UK, Italian and Turkish tail. They write in Albanian (often Kosovo/Macedonia dialect — *"qysh mundem me këste me e pagu"*), a few in German or English. Expect German business auto-responders in the replies — those are not leads.
- Diaspora leads are in Albania in summer and re-engage in person. August is peak in-country season.
- Older buyers investing savings need a slower, reassuring tone and explicit "you'll get everything in writing before deciding."

---

## Copy rules for broadcasts & follow-up messages

- **Name the location — Qerret, Durrës — in every broadcast.** Three leads in one send asked where the project even is.
- Offer a small hand-picked selection, not the whole price list.
- Never reference the client's budget or any assumption about their finances.
- One idea + one question; curiosity gap over full explanation.
- Always close with the phone contact: +355 67 508 8808.
- Never leave a template placeholder unfilled — a message went out with `{emri}` visible.
- Don't send a broadcast unless someone is staffed to answer for the next two hours.

---
