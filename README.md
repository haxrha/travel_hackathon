# WAYPORT

An agentic travel platform: AI agents plan trips, react to disruptions in real time,
and — via [Stripe](https://stripe.com) — charge the booking when the traveler confirms.

Built for Checkout.

## What it does

- **Travel Graph.** Every trip is a graph of nodes (flights, hotels, restaurants,
  activities, transit) and edges (walking time, transfers, dependencies) persisted in
  Postgres via Prisma — the UI never owns trip logic, the graph does.
- **Deterministic decision engine.** An LLM extracts intent and constraints; a symbolic
  engine (`src/lib/decision/engine.ts`) checks hard constraints (budget, walking
  distance, sleep, overlap) and scores itineraries. The model explains the result, it
  doesn't decide budget or timing on its own.
- **Multi-agent orchestration.** An orchestrator routes work across specialized agents
  — planner, guardian, flights, hotels, local, financial, price monitor, voice, change
  — each logging every decision to an audit trail (`AgentAction`) with a rollback flag.
- **Risk-tiered autonomy.** Every agent action carries a risk level 0–5 (read-only →
  recommend → prepare → financial spend → external comms → fully autonomous). A policy
  engine (`src/lib/policy.ts`) gates what executes silently vs. what needs your
  approval, based on autonomy thresholds you set.
- **Reactive replanning.** A replanning loop consumes a trip event stream (flight
  delays, weather, cancellations, price drops) and re-invokes the orchestrator to
  repair the plan. A sandbox/eval harness runs 10 scripted disruption scenarios and
  reports the % of constraints still satisfied after each repair.
- **Cross-trip traveler memory via Backboard.** Each user gets one Backboard
  assistant. Every trip is a new thread. Planning turns use memory mode `Auto`,
  so an offhand preference ("aisle seats", "vegetarian", "no red-eyes", "$150/night")
  is stored on the assistant and retrieved on the next trip without passing the
  old thread. The planner and financial agent apply those facts. Without
  `BACKBOARD_API_KEY`, the same facts stay on the traveler profile and the UI
  labels them as local.
- **Agentic commerce via Stripe.** Confirming a booking creates a PaymentIntent.
  Test keys (`sk_test_`) confirm with Stripe's test card. Live keys open Checkout
  unless `STRIPE_PAYMENT_METHOD_ID` is set, and `POST /api/stripe/webhook` marks
  the Travel Graph paid. The Python stack (`agents/rain_agent.py`,
  `agents/utils/stripe_tools.py`) charges through the same keys.
- **Everything else.** Live in-trip companion with voice (ElevenLabs), group/enterprise
  trip coordination, a financial agent tracking budget vs. actual, a travel document
  wallet, and a decision-graph visualization that makes agent reasoning inspectable.

## Demo mode

If Clerk isn't configured, the app runs unauthenticated with mock travel data — no
keys required to look around. Flight fares are simulated and badged as such in the UI
unless Amadeus credentials are set.

## Getting started

```bash
./run.sh setup   # install deps + generate Prisma client, creates .env.local
./run.sh         # start the dev server on :3000
```

`run.sh` also supports `db` (push the Prisma schema — needs `DATABASE_URL`), `build`,
and `start`. Fill in `.env.local` (copied from `.env.example`) with:

| Purpose | Vars |
|---|---|
| Auth (optional — omit for demo mode) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Database (optional — omit for demo mode) | `DATABASE_URL`, `DIRECT_URL` |
| Trip planning LLM | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Flights | `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` |
| Hotels | `STAY22_API_KEY` |
| Search (agent research) | `TAVILY_API_KEY` |
| Voice | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` |
| Maps | `MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` |
| Traveler memory | `BACKBOARD_API_KEY` (optional `BACKBOARD_ASSISTANT_ID`) |
| Payments | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |

`.env.example` ships with working Tavily/Stay22 sandbox keys for local demoing —
rotate them before this repo goes anywhere public. Leave Stripe and Backboard blank
until you add deployment keys; bookings stay simulated and memory stays local.

Key routes once running:

- `/` — landing
- `/app` — main product
- `/app/concierge` — chat-driven trip planning
- `/app/sandbox` — disruption eval harness

## Python agent stack

`agents/` holds a standalone [pydantic-ai](https://ai.pydantic.dev) multi-agent stack
that researches flights/hotels via Tavily and books/pays via Stripe
(`agents/rain_agent.py`). It shares `STRIPE_SECRET_KEY` with the Next.js app, which
falls back to `agents/.env` when the var is missing from `.env.local`.

```bash
cd agents
uv sync
cp .env.example .env   # fill in STRIPE_SECRET_KEY, TAVILY_API_KEY, Gemini creds
uv run python rain_agent.py
```

## Tech stack

Next.js 16 (App Router) · React 19 · Prisma 7 + Postgres/pgvector · Clerk · Tailwind
CSS 4 · Mapbox GL · Vercel AI SDK (Gemini) · Stripe (payments) · Backboard (memory) · pydantic-ai (Python
agent runtime).

## Project structure

```
src/app/                 Routes — (marketing) + (app) route groups, API handlers
src/lib/agents/          Orchestrator + specialized agents (planner, guardian, ...)
src/lib/decision/        Symbolic constraint engine, risk scoring, solver
src/lib/graph/           Travel Graph service, world state, recompute
src/lib/policy.ts        Risk-tiered autonomy / approval gating
src/lib/replan/          Event-driven replanning loop
src/lib/backboard/       Backboard memory client + cross-trip fact store
src/lib/stripe/          Stripe PaymentIntent, Checkout, and webhook verification
src/lib/tools/           External providers — flights, hotels, weather, FX, voice
src/lib/eval/            Disruption sandbox / eval harness
src/components/app/      Product UI
prisma/schema.prisma     Travel Graph schema (source of truth for trip state)
agents/                  Python pydantic-ai multi-agent stack (Stripe booking agent)
```

## Known gaps

- Stripe live charges need a Checkout return or `STRIPE_PAYMENT_METHOD_ID`. Test
  keys confirm in-process with `pm_card_visa`.
- Backboard assistant ids are stored on the traveler profile (Postgres when
  `DATABASE_URL` is set, otherwise process memory). Set `BACKBOARD_ASSISTANT_ID`
  to pin one assistant across restarts without a database.
