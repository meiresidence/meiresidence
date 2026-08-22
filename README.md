# Mei Residence — WhatsApp AI Agent (Claude → WhatsApp, direct)

A small always-on service that lets **Claude answer your Mei Residence WhatsApp
chats directly** — no GoHighLevel in the loop. It replies in the client's own
language, answers from your Mei Residence knowledge base, forwards hot leads to a
human agent's WhatsApp, and gently follows up on leads who go quiet.

```
Client texts your WhatsApp number
        │
        ▼
Meta WhatsApp Cloud API  ──(webhook)──►  THIS SERVICE (Node.js)
                                              │  builds prompt + history
                                              ▼
                                         Claude API (the "brain")
                                              │  reply / escalate
                                              ▼
Meta WhatsApp Cloud API  ◄──(send)──────  THIS SERVICE
        │
        ▼
Client gets the reply   +   hot leads forwarded to your agent's WhatsApp
```

You deploy this **once**. After that it runs 24/7 on its own.

---

## What you need (2 accounts)
1. **Anthropic API key** — powers Claude (the brain).
2. **Meta WhatsApp Business (Cloud API)** — a phone number + access token.

Everything else is in this folder.

---

## Step 1 — Get your Anthropic API key
1. Go to **console.anthropic.com** → sign in.
2. **Settings → API Keys → Create Key.** Copy it (starts with `sk-ant-...`).
3. Add some credit under **Billing** (a WhatsApp assistant is very cheap — see Costs).

## Step 2 — Set up WhatsApp (Meta Cloud API)
> Do this at **developers.facebook.com**. Meta occasionally changes menu names;
> the flow is the same.

1. Create a **Meta Business account** (business.facebook.com) if you don't have one.
2. In **developers.facebook.com → My Apps → Create App → "Business"**.
3. Add the **WhatsApp** product to the app.
4. In **WhatsApp → API Setup** you'll see:
   - a test **Phone number ID** (copy it → this is `WHATSAPP_PHONE_NUMBER_ID`),
   - a temporary token (fine for testing).
5. **Add your real business number** (the one clients should text) and verify it.
   You can also use the free test number first to try everything.
6. **Create a permanent token** (so it doesn't expire in 24h):
   - **business.facebook.com → Business Settings → Users → System users →
     Add** a system user (role: Admin).
   - **Assign assets** → assign your WhatsApp app / account with full control.
   - **Generate new token** → pick the app → select permissions
     `whatsapp_business_messaging` and `whatsapp_business_management` →
     **Generate**. Copy it → this is `WHATSAPP_TOKEN`.

## Step 3 — Configure the service
1. Copy `.env.example` to `.env`.
2. Fill in:
   - `ANTHROPIC_API_KEY` — from Step 1.
   - `WHATSAPP_TOKEN` — permanent token from Step 2.
   - `WHATSAPP_PHONE_NUMBER_ID` — from Step 2.
   - `WHATSAPP_VERIFY_TOKEN` — invent any string (e.g. `mei-residence-2026`). You'll
     paste the same value into Meta in Step 5.
   - `AGENT_WHATSAPP_NUMBER` — the human agent who should receive hot leads,
     in digits only with country code, e.g. `355672049400`.

## Step 4 — Deploy (Railway — recommended, easiest)
Railway gives you a public HTTPS URL that Meta can reach.

1. Put this folder in a **GitHub repo** (or use Railway's "Deploy from local").
2. Go to **railway.app → New Project → Deploy from GitHub repo** (pick this repo).
3. Railway auto-detects Node and runs `npm start`.
4. Open **Variables** and paste every line from your `.env`
   (Railway is where the real secrets live — do NOT commit `.env`).
5. Under **Settings → Networking → Generate Domain**. Copy the URL, e.g.
   `https://mei-whatsapp-agent-production.up.railway.app`.

> Alternatives: **Render.com** (same idea), or your **own VPS**
> (`docker build -t mei . && docker run -p 3000:3000 --env-file .env mei`,
> then put it behind HTTPS with Caddy/Nginx).

## Step 5 — Connect the webhook in Meta
1. In **developers.facebook.com → your app → WhatsApp → Configuration → Webhook**.
2. **Callback URL:** your deploy URL + `/webhook`
   (e.g. `https://...railway.app/webhook`).
3. **Verify token:** the exact `WHATSAPP_VERIFY_TOKEN` from your `.env`.
4. Click **Verify and Save** — it should succeed (you'll see `[webhook] verified`
   in your Railway logs).
5. Click **Manage** and **subscribe** to the **`messages`** field.

## Step 6 — Test it
- From another phone, send a WhatsApp to your business number: *"Pershendetje, sa
  kushton nje 1+1 me pamje nga deti?"*
- You should get a warm reply in Albanian within a few seconds.
- Try English too — it should switch languages automatically.
- Say *"Dua te flas me nje agjent"* ("I want to talk to an agent") — it should
  reply that a specialist will reach out AND forward the lead to your
  `AGENT_WHATSAPP_NUMBER`.

You can also test the brain locally without WhatsApp:
```
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run test:brain "Sa kushton nje 2+1?"
```

---

## Editing what the bot knows / how it talks
- **`knowledge/mei-residence-kb.md`** — the facts (prices, units, amenities…).
  Edit this and redeploy to change what the bot tells clients.
- **`knowledge/system-prompt.md`** — the persona, tone, rules, and when to hand off.
- ⚠️ The KB has several **[CONFIRM]** items (see below). Fill these in — the bot is
  built to refuse to guess, so unanswered items become "a specialist will confirm."

## Follow-ups and the 24-hour rule (important)
WhatsApp only lets you send **free-text** messages within **24 hours** of the
client's last message. After that, you may only send **pre-approved template
messages**.
- Inside 24h: the bot auto-sends a warm, personalized nudge to quiet leads.
- After 24h: you must create a template. In **WhatsApp Manager → Message Templates
  → Create**, make a short re-engagement template, get it approved, then set
  `FOLLOWUP_USE_TEMPLATE=true` and `FOLLOWUP_TEMPLATE_NAME=your_template` in your
  variables.
- Tune timing with `FOLLOWUP_DELAY_HOURS` and `FOLLOWUP_MAX_ATTEMPTS`.

## Costs (rough)
- **Claude:** a typical short WhatsApp exchange costs a fraction of a cent. Use
  `claude-haiku-4-5-20251001` (set `ANTHROPIC_MODEL`) to cut cost further.
- **WhatsApp:** Meta gives free service conversations; template/marketing messages
  are billed per Meta's rates for Albania.
- **Railway:** free/hobby tier is enough to start.

## Troubleshooting
- **Webhook won't verify:** the `WHATSAPP_VERIFY_TOKEN` in Meta must exactly match
  your env var; the URL must end in `/webhook` and be HTTPS.
- **No replies:** check Railway logs. `Missing env var` = a secret isn't set.
  `401` from Claude = bad `ANTHROPIC_API_KEY`. `190`/auth error from WhatsApp =
  expired token (use a permanent System User token, Step 2.6).
- **Replies but no handoff:** set `AGENT_WHATSAPP_NUMBER` (digits only).
- **State resets after redeploy:** expected on ephemeral hosts; attach a Railway
  volume at `/app/data` if you want conversation memory to persist across deploys.

---

## "What's near Mei Residence?" — Google Places (optional)

The agent can answer *"Ku ka markete afër Mei Residence?"*, *"a ka farmaci
afër?"*, *"ku mund të ha darkë?"* with real data instead of a guess:

```
client on WhatsApp  ->  GHL webhook  ->  index.js  ->  Claude decides it needs a place
                    ->  find_places tool  ->  Google Places API around the residence
                    ->  name / distance / address / open-now / hours
                    ->  Claude writes the reply in the client's language  ->  WhatsApp
```

To switch it on: Google Cloud console → enable **Places API (New)** → create an API
key → restrict it to that API → set `GOOGLE_MAPS_API_KEY` in Render. Nothing else
changes. Leave it empty and the tool is never offered to the model, so the agent
keeps answering location questions from the knowledge base alone — it can never
invent a shop, a distance or an opening time. Results are cached for 6 hours per
query, so a busy day is a handful of API calls. Opening hours and ratings sit in
Google's Enterprise pricing tier (1,000 free calls/month instead of 5,000), so the
agent only requests them when a client actually asks about opening times.

The residence's coordinates live in `src/places.js` (`MEI_COORDS`), taken from the
project's own Google Maps pin.

## Open questions — the answers that are still missing

The agent now gives a specific, named next step for each of these instead of "a
colleague will reply" (see `knowledge/contract-questions.md`), but every one of
them is a real buyer question that we would close faster with a written answer:

1. **The three documents** — sales contract, management contract, and the document
   that sets the 6%. Can they be sent to a serious buyer before signing, by whom,
   and at what stage?
2. **Which legal entity is the seller** named in the sales contract.
3. **When ownership passes legally** — at the notary signature, or at registration
   in the kadastra.
4. **Is the 6% gross or net**, and what (if anything) is deducted from it.
5. **What the owner pays each year** — utilities, property tax, common/admin fees.
   Does the old *~0.6 EUR/m² monthly administration fee* still apply? It is
   currently quarantined from client replies because it contradicts "the owner
   pays nothing else for at least 10 years."
6. **Is there a management fee** on top, in either program.
7. **What can void the 6% guarantee**, and what the remedy is if it is not paid.
8. **Late instalment** — what the contract says.
9. **Taxes and fees not included in the price** — notary, registration, transfer,
   VAT, infrastructure.
10. **Why the opening is June 2027** when construction completes Q4 2026 — the
    agent currently says "finished, then fitted out to Ramada standards, opens for
    the season". Confirm that is the line you want.
11. **Ramada / Wyndham after 2027** — contract length, renewal, and what happens to
    an owner if the brand ever leaves.
12. **Orientation / view per unit** — there is still no orientation column in the
    price list. It is asked constantly.
13. **The price list date** — what date should the agent quote as "last updated"?
14. **Personal use** — still worth settling in writing (owner nights are answered,
    but "can I live in it later" is not).
