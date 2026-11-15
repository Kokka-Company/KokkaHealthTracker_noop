# KokkaHealthTracker

An open-source dashboard that combines your **WHOOP** recovery data with your
**calendar** to give you a daily health outlook.

Most health apps tell you how recovered you are. Most calendars tell you how
busy you are. Neither tells you whether those two things are compatible today.
This does.

---

## The idea

The dashboard computes two numbers and then compares them:

| | |
|---|---|
| **Capacity** | What your body has to give today — WHOOP recovery, sleep performance, sleep debt. |
| **Demand** | What your calendar is going to take — meeting volume, back-to-back transitions, day span, focus fragmentation. |

The **outlook score** is capacity adjusted for demand. A 70% recovery on an open
day is a good day; the same 70% behind seven hours of back-to-back calls is not.
Alongside the score you get plain-language insights — sleep debt, red recovery,
no focus block, "heavy day, low reserves" — so it tells you what to actually do.

Either integration works on its own. Connect only WHOOP and you get a body-only
score; connect only the calendar and you get a day-shape score.

---

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** — one deployable,
  OAuth handled server-side so tokens never reach the browser
- **Tailwind CSS v4** for the UI
- **Prisma** + **SQLite** (swap the datasource for Postgres to deploy)
- **Zod** for lazy, fail-loud validation of server environment variables
- **AES-256-GCM** encryption for OAuth tokens at rest
- **`node:test`** (run through `tsx`) for the scoring, calendar and date logic

---

## Quick start

```bash
git clone https://github.com/Kokka-Company/KokkaHealthTracker.git
cd KokkaHealthTracker
npm install

cp .env.example .env
# generate the two secrets:
openssl rand -base64 32   # -> ENCRYPTION_KEY
openssl rand -base64 32   # -> SESSION_SECRET

npm run db:push           # create the SQLite database
npm run dev               # http://localhost:3000
```

The dashboard runs immediately and shows both integrations as
*"Needs credentials in .env"* until you register the apps below.

---

## Configuration

All configuration lives in `.env` — start from `.env.example`.

| Variable | Required | Default | What it's for |
|---|---|---|---|
| `APP_URL` | yes | `http://localhost:3000` | Base URL of this app. Must match the redirect URIs you register with each provider. Set an `https://` origin in production so the session cookie is marked secure. |
| `DATABASE_URL` | yes | `file:./dev.db` | Prisma datasource. Point at Postgres and change the provider in `prisma/schema.prisma` to deploy. |
| `ENCRYPTION_KEY` | yes | — | Base64 32-byte key used to encrypt OAuth tokens at rest. Rotating it invalidates every stored connection. |
| `SESSION_SECRET` | yes | — | Signs the session cookie. |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | optional | — | Enables the WHOOP card. Without them the integration shows as unconfigured. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | optional | — | Enables the calendar card. |
| `MICROSOFT_TENANT_ID` | optional | `common` | Your tenant GUID to lock sign-in to one org. |

The environment is validated lazily in `lib/env.ts`, so `next build` and the
"connect your accounts" screens still work before every provider is configured —
only the code paths that actually need a credential throw.

---

## Connecting WHOOP

1. Go to the [WHOOP Developer Dashboard](https://developer.whoop.com) and
   create an application.
2. Set the redirect URI to:
   ```
   http://localhost:3000/api/auth/whoop/callback
   ```
3. Request these scopes: `read:recovery`, `read:sleep`, `read:cycles`,
   `read:profile`, `offline`.
   > `offline` is the one that gets you a refresh token. Without it the
   > connection dies after an hour.
4. Put the client ID and secret in `.env`:
   ```
   WHOOP_CLIENT_ID="..."
   WHOOP_CLIENT_SECRET="..."
   ```
5. Restart the dev server and hit **Connect** on the WHOOP card.

This targets **WHOOP API v2** (v1 was retired in October 2025) at
`https://api.prod.whoop.com/developer/v2`. The endpoints live in
`lib/whoop/client.ts` if the API moves, and `openapi.json` at the repo root is a
vendored copy of WHOOP's own spec for reference.

---

## Connecting Microsoft 365 / Outlook Calendar

1. Go to the [Azure Portal](https://portal.azure.com) →
   **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Under **Redirect URI**, choose platform **Web** and enter:
   ```
   http://localhost:3000/api/auth/microsoft/callback
   ```
3. Under **API permissions**, grant the Microsoft Graph permissions in the
   table below.
4. Under **Certificates & secrets**, create a new client secret and copy the
   **value** (not the ID — it is only shown once).
5. Fill in `.env`:
   ```
   MICROSOFT_CLIENT_ID="..."       # Application (client) ID
   MICROSOFT_CLIENT_SECRET="..."   # the secret value
   MICROSOFT_TENANT_ID="common"    # or your tenant GUID to lock it to one org
   ```
6. Restart and hit **Connect** on the calendar card.

### API permissions

This app signs in **as you** — authorization code flow with PKCE — and reads
`/me/calendarView`. That means it needs *delegated* permissions. Application
(app-only) permissions are for the client-credentials flow and do **not**
authorize `/me` calls, no matter how much admin consent they carry.

The scopes actually requested at sign-in (`lib/calendar/microsoft.ts`):

| Permission | Type | Why |
|---|---|---|
| `openid`, `profile` | Delegated | Sign-in |
| `offline_access` | Delegated | Refresh token — without it the connection dies in about an hour |
| `User.Read` | Delegated | Read the signed-in user's profile |
| `Calendars.Read` | Delegated | Read the signed-in user's calendar |

For reference, the current registration in the **Kokka & Company** tenant is:

| Permission | Type | Admin consent |
|---|---|---|
| `User.Read` | Delegated | Granted |
| `Calendars.Read` | Application | Granted |
| `Calendars.Read.All` | Application | Granted |
| `Calendars.ReadBasic.All` | Application | Granted |
| `Chat.Read.All` | Application | Granted |
| `ChatMember.Read.All` | Application | Granted |
| `Mail.Read` | Application | Granted |
| `ProfilePhoto.Read.All` | Application | Granted |
| `Team.ReadBasic.All` | Application | Granted |
| `User-Mail.ReadWrite.All` | Application | Granted |
| `User.Read.All` | Application | Granted |

> **This registration will not complete the connect flow as-is.** Only
> `User.Read` is Delegated. `Calendars.Read` is registered as Application, which
> the delegated flow cannot use, and `offline_access` is not registered at all.
> Add **Delegated** `Calendars.Read` and `offline_access`, then grant admin
> consent. The Application-type entries can stay — this app never uses them.

Everything below `User.Read` in that list is a tenant-wide app-only grant
(`Mail.Read` and `Chat.Read.All` read *all* mailboxes and chats). None of it is
used by KokkaHealthTracker; it presumably belongs to another integration sharing
the registration. If that is not the case, consider a dedicated registration for
this app with only the four delegated scopes above.

---

## How the score works

The model lives in `lib/scoring.ts` and is deliberately small enough to read in
one sitting. All three numbers are 0–100.

**Capacity** is a weighted average of whichever WHOOP inputs are present:

| Input | Weight |
|---|---|
| Recovery score | 0.60 |
| Sleep performance | 0.25 |
| Sleep debt (actual ÷ WHOOP's calculated need) | 0.15 |

Recovery dominates because it is already WHOOP's own composite of HRV, resting
heart rate and sleep; the other two refine it. Missing inputs are dropped and
the remaining weights renormalised.

**Demand** is meeting volume plus the shape of the day, because six hours in one
block costs less than six hours shattered into fragments:

| Component | Contribution |
|---|---|
| Meeting volume | up to 70 (a 6-hour day of meetings is the ceiling) |
| Back-to-back transitions | 4 each, capped at 16 |
| No focus block ≥ 60 min with 2+ meetings | 8 |
| Day span over 7h / over 9h | 3 / 6 |

**Outlook** absorbs the first 30 points of demand for free, then erodes:

```
outlook = capacity − max(0, demand − 30) × 0.45
```

With only WHOOP connected the outlook is just capacity. With only the calendar
connected it is `100 − demand`, a rough day-shape score. The resulting number is
bucketed into a label — **Prime** (80+), **Strong** (65+), **Moderate** (50+),
**Strained** (35+), **Depleted** — and paired with insights generated from the
same inputs.

---

## Usage

Press **Sync now** on the dashboard to pull today's data. Each sync writes one
`DailySnapshot` row, so the page renders instantly and you stay well inside
both providers' rate limits.

A sync captures recovery score, resting heart rate, HRV, sleep performance,
sleep duration and need, respiratory rate, day strain, average heart rate and
calories from WHOOP; and the full event list, meeting count, meeting minutes and
first/last event times from your calendar. The derived outlook score and label
are stored on the same row.

To sync from a cron job, hit the JSON endpoint with the session cookie:

```bash
curl -b "kht_session=<cookie>" http://localhost:3000/api/sync
# optional: ?date=YYYY-MM-DD to backfill a specific day
```

### API routes

| Route | Method | What it does |
|---|---|---|
| `/api/auth/whoop` | GET | Starts the WHOOP OAuth flow |
| `/api/auth/whoop/callback` | GET | Exchanges the code, stores encrypted tokens |
| `/api/auth/microsoft` | GET | Starts the Microsoft Graph OAuth flow |
| `/api/auth/microsoft/callback` | GET | Exchanges the code, stores encrypted tokens |
| `/api/auth/disconnect` | POST | Revokes a stored connection (form field `provider`: `whoop` or `microsoft`) |
| `/api/sync` | GET | Pulls and scores a day; `?date=YYYY-MM-DD` to target one |

Access tokens are refreshed transparently on use, so a connection survives as
long as its refresh token does.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Serve the production build |
| `npm test` | Run the scoring, calendar and date tests |
| `npm run lint` | ESLint via `eslint-config-next` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Apply the Prisma schema to the database |
| `npm run db:studio` | Browse the database in Prisma Studio |

---

## Project layout

```
app/
  page.tsx                        the dashboard
  layout.tsx, globals.css         shell and Tailwind entry
  api/auth/whoop/…                WHOOP OAuth (start + callback)
  api/auth/microsoft/…            Microsoft Graph OAuth (start + callback)
  api/auth/disconnect/route.ts    drop a stored connection
  api/sync/route.ts               pull today's data
components/                       OutlookHeader, MetricCard, InsightList,
                                  CalendarTimeline, ConnectionBar
lib/
  scoring.ts                      capacity / demand / outlook  ← the core model
  sync.ts                         orchestrates a day's sync
  whoop/client.ts                 WHOOP API v2 client + token refresh
  whoop/types.ts                  WHOOP response shapes
  calendar/microsoft.ts           Microsoft Graph client
  calendar/summarize.ts           provider-neutral day-load metrics
  calendar/types.ts               CalendarEvent / CalendarDay
  tokens.ts                       store, load and disconnect provider accounts
  session.ts                      signed single-user session cookie
  oauth-state.ts                  CSRF state for the OAuth handshakes
  crypto.ts                       AES-256-GCM for tokens at rest
  env.ts                          lazily validated server environment
  db.ts                           Prisma client singleton
  date.ts                         timezone-aware day boundaries
  cn.ts                           class name helper
prisma/schema.prisma              User, ProviderAccount, DailySnapshot
tests/                            node:test suites — scoring, summarize, date
openapi.json                      vendored WHOOP API spec, for reference
```

---

## Notes on privacy

This is designed to be **self-hosted**. Your health data stays in your own
SQLite file and your OAuth tokens are encrypted with your own key. There is no
telemetry and nothing is sent anywhere except to WHOOP and Microsoft.

Because it assumes a single user, there is no password — a signed cookie ties
your browser to the one account. If you expose this beyond localhost, put it
behind a real authentication layer first, and set `APP_URL` to an `https://`
origin so the session cookie is marked secure.

---

## Roadmap

- Google Calendar and CalDAV sources (`lib/calendar/summarize.ts` is already
  provider-neutral — a new source only needs to normalise into `CalendarEvent[]`)
- Multi-day trends and history
- WHOOP workouts and strain targets
- Scheduled background sync
- Settings page for timezone and working hours

## License

MIT
