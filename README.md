# Geopolitica

One site to see the ripple effects of events across the globe and what you should be ready for.

Two products share one research pipeline. New to it? The enterprise edition opens with a **Get started** journey (`/get-started`): six steps from what the product does, through one report and the change radar, to a sample company and your own supplier list, with progress remembered in the browser.

- **Dossiers** (`/dossiers`): each major event as a layered, interactive page. A 30-second card with a ripple map, a 5-minute brief with the same signposts every time (what happened, why it matters, who wins and loses, what's next), deep-dive modules (timeline, root causes, markets, stakeholders, industries, daily life, scenarios, countermeasures, analogues, what to watch) and an evidence layer with every source, a confidence label per claim and a change log. Readers predict before they read and recap after.
- **Company impact reports** (`/enterprise`): a company shares its supply-chain footprint (suppliers, parts with HS codes, lanes, sites) and the impact engine matches it against a calendar of dated changes (regulations, tariffs, strikes, unrest, chokepoints, energy shocks). Each department gets a brief: what changes, when, your exposure, cost if unprepared, next action, owner.
- **Change radar** (`/changes`): the public calendar both products run on.

Alongside them, **Atlas** (`apps/atlas`) is a personal edition for one reader: a world map of events with the connections drawn between them; click an event for an interactive report on what it is and how it ripples to the rest of the world, plus a wire of matched headlines. No engine, no accounts. See `apps/atlas/README.md`.

## Layout

```
apps/web      Next.js 16 + TypeScript + Tailwind. Dossier content lives in src/content/dossiers/*.json.
apps/engine   Python 3.11+ FastAPI impact engine: models, change calendar, exposure matching, brief generation.
apps/atlas    Next.js personal edition: event graph, world map, per-event reports, RSS wire, draft-a-report script.
docs/         api-contract.md is the contract between the two. Keep it and both sides in sync.
```

## Run it locally

Requirements: Node 22+, Python 3.11+.

```bash
npm install              # root tooling
npm run setup            # installs web deps and the engine venv
cp .env.example .env     # defaults work for local
npm run dev              # web on http://localhost:3000, engine on http://localhost:8000
```

Atlas on its own: `npm run dev:atlas` (then `cd apps/atlas && npm run wire` to pull headlines).

Or with Docker: `docker compose up --build`.

Tests: `npm test` runs the engine's pytest suite. `npm run build` type-checks and builds the web app.

Lanes (enterprise `/lanes`): pick a lane by sea, road, air or rail and compare every standard route
between the two places once today's events are counted. The route library is
`apps/atlas/src/content/lanes.ts`; the hourly pipeline step `npm run lanetags` asks Claude which
route points each event disrupts (`lane-tags.json`, published as `/lanes.json`); scoring is
`laneRisk.ts`. Tests: `cd apps/atlas && npm run test:lanes`.

## Where to open it

| Edition | Link | How it gets there |
| --- | --- | --- |
| Personal (Atlas) | https://neel8636.github.io/Geopolitica/ | GitHub Pages. `.github/workflows/atlas-pages.yml` builds the static site on every push to `apps/atlas` and once a day (pulling fresh headlines first). |
| Enterprise (web + engine) | https://geopolitica-1rja.onrender.com | Render web service `geopolitica`, built from the root `Dockerfile` (web app and engine in one container). Deploys on every push to `main` through the deploy-hook workflow. |

Enterprise deploys: the service is a Render web service on the public repo URL, so Render receives no GitHub webhooks; `.github/workflows/render-deploy.yml` calls the service's deploy hook on every push to `main` instead (store the hook URL as the `RENDER_DEPLOY_HOOK` repository secret). `render.yaml` remains as a blueprint for recreating the service elsewhere. The free plan sleeps after 15 minutes idle, so the first open after a pause takes about a minute.

Any other host works too: the root `Dockerfile` is a single container (web on `$PORT`, engine on 8000 inside it), or run the two apps separately with `apps/web/Dockerfile` and `apps/engine/Dockerfile` and point the web at the engine with `ENGINE_URL`. The engine is only ever called server-side through `/api/engine/*`.

## Generate a report from the app

Open any event (`/events/<id>`) in the enterprise edition and press **Generate report** (or **Regenerate** when one exists). The server drafts the layered report from the event's sources and the latest matched headlines and shows it in place. The Atlas offers the same button and calls the enterprise server.

Server environment (Render → the service → Environment):

| Variable | Required | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes, for generation | The Claude API key the server drafts with. |
| `GITHUB_TOKEN` | no | A fine-grained token with *Contents: read and write* on this repo. When set, each generated report is committed to `apps/atlas/src/content/dossiers`, so it becomes permanent in both editions on the next deploy. Without it, a report lives on the server until its next deploy. |
| `REPORT_PASSCODE` | no | If set, the button asks for this passcode. Use it because every generation costs API usage and the enterprise site is public. |
| `REPORT_CORS_ORIGIN` | no | Origin allowed to call the endpoint from the browser; default `https://neel8636.github.io` (the Atlas). |
| `REPORT_MODEL` | no | Model id, default `claude-sonnet-5-5`. |

## Add a dossier

1. Copy `apps/web/src/content/dossiers/france-unrest-2026.json`, change the slug and fill every layer. The TypeScript types in `src/content/types.ts` are the template.
2. Register it in `src/content/dossiers.ts`.
3. Add the event to `apps/engine/geopolitica_engine/data/changes.json` with `dossier_slug` set, so company reports link to it.

## Add a change to the calendar

Edit `apps/engine/geopolitica_engine/data/changes.json`. Every change needs a type, dates or a window, countries, HS prefixes or chokepoints where relevant, severity 1-5, confidence, the departments that act, 1-4 actions, and at least one source with the date it was accessed. The engine validates the file on start.

## Principles

- Every number links to its source; sources are tiered and headline figures use tiers one and two only.
- Facts and judgement stay apart; probabilities and predictions are labelled as judgement and graded when they resolve.
- No feeds, no outrage, no autoplay. Readers choose their depth.
- Company data is used for the one request and not stored. Decision support, not advice.

## Status

Version 0.1: one published dossier (France, October 2026), 12 calendar entries, engine with deterministic scoring and rule-based briefs. Before customers pay: authentication, stored footprints with watchlists and alerts, a verified and continuously updated change database, a human editorial pass on every dossier, and a public forecast scorecard.
