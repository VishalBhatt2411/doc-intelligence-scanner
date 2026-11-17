# Doc Intelligence Scanner

A standalone, CRM-agnostic document-intelligence service. Upload an invoice,
passport, contract, resume, or any scanned document; it extracts structured
fields with **Claude** (Anthropic); you review/edit and map the fields; then
push the result into **any CRM** — Salesforce, HubSpot, or a new one you
register — through one dynamic connector framework, no per-vendor code
required to add a target system.

It has **no dependency on Salesforce or any single CRM**. It's a plain
Node/Express backend with a built-in web UI, deployable anywhere (a VM,
Docker, Render, Railway, Fly.io, Cloud Run, ECS, Kubernetes), callable by
anything (browser UI, curl, Salesforce Apex, a Python script, an RPA bot).

```
 ┌──────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
 │  Browser UI  │────▶│   This service        │────▶│  Claude (default) /   │
 │  (public/)   │     │   /v1/extract          │     │  Gemini / OpenAI      │
 └──────────────┘     │   /v1/extract-text     │     └───────────────────────┘
        ▲             │                        │
        │             │   /v1/connectors       │────▶ any registered CRM
   any other client ──┘   /v1/connectors/:id/* │      (Salesforce, HubSpot, ...)
   (curl, Node, Python,   /v1/connectors/       │      or a generic Webhook
    Salesforce Apex,      webhook/submit        │      (Zapier, Make, Power
    RPA bot...)           GET /v1/connectors    │      Automate, custom endpoint)
                          └────────────────────────
```

## Why this exists

The original version of this idea lived entirely inside a Salesforce LWC +
Apex bundle, called Gemini directly, and could only ever create/attach a
record in the org it was installed in. This service replaces that with:

- **One AI provider swap, not a rewrite.** `AI_PROVIDER=claude` (default) —
  or `gemini` / `openai` — is a config change, not a code change.
- **A dynamic connector framework instead of a hardcoded integration.** The
  service exposes `GET /v1/connectors` describing which CRMs are registered
  and exactly what credentials each one needs (a Salesforce access token, a
  HubSpot Private App token, a future connector's OAuth client id/secret,
  etc.). Both the API routes and the built-in UI drive themselves off that
  list — adding a CRM is "write one small adapter file and add one registry
  entry," not "add a new route file and hand-write new UI markup."
- **No platform lock-in.** The service itself has zero Salesforce SDK/API
  dependency. Salesforce is just one connector among several.

## What's included

```
doc-intelligence-scanner/
├── public/                    the built-in UI (static files, no build step)
│   ├── index.html
│   ├── styles.css
│   └── app.js                 renders CRM tabs dynamically from GET /v1/connectors
├── src/
│   ├── server.js               Express app - wires auth, routes, static UI
│   ├── config.js                all configuration, read from .env
│   ├── routes/
│   │   ├── extract.js           POST /v1/extract, /v1/extract-text
│   │   └── connectors.js        GET /v1/connectors, /v1/connectors/:crmId/*, /v1/connectors/webhook/submit
│   ├── providers/                claude (default) | gemini | openai - pluggable AI vendor
│   ├── connectors/
│   │   ├── registry.js           the dynamic CRM registry - start here to add a CRM
│   │   ├── authStrategies.js     pluggable auth: bearer | apiKeyHeader | basic | oauth2ClientCredentials
│   │   ├── salesforceConnector.js
│   │   ├── hubspotConnector.js
│   │   ├── webhookConnector.js   universal fallback: POST to any HTTPS endpoint
│   │   └── urlSafety.js          SSRF guard for caller-supplied URLs
│   ├── middleware/                x-api-key auth, centralized error handling
│   ├── schemas/                   per-document-type field hints for the AI prompt
│   └── utils/                     prompt building, docx→text, response parsing
├── test/                     node:test suite (no live API keys required)
├── docs/
│   ├── ARCHITECTURE.md            how the pieces fit together, request flow
│   ├── CONNECTING_A_CRM.md        step-by-step: Salesforce, HubSpot, and generic steps for any CRM
│   ├── ADDING_A_NEW_CONNECTOR.md  how to register a brand-new CRM
│   ├── CHALLENGES_AND_ROADMAP.md  known integration challenges + planned enhancements
│   └── SECURITY.md                production hardening checklist
├── openapi.yaml                machine-readable API spec
├── Dockerfile / docker-compose.yml
├── .env.example
├── LICENSE
└── CHANGELOG.md
```

## Quick start

### 1. Prerequisites
- Node.js 18+ (20 recommended) and npm.
- An [Anthropic API key](https://console.anthropic.com/settings/keys) (default provider). Gemini/OpenAI keys are optional alternates.

### 2. Install and configure
```bash
npm install
cp .env.example .env
```
Edit `.env`:
- `API_KEYS` — generate one: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. Every caller (including the built-in UI) sends this back as `x-api-key`.
- `AI_PROVIDER=claude` (default) and `ANTHROPIC_API_KEY=...`.

### 3. Run it
```bash
npm start
```
```bash
curl http://localhost:8787/v1/health
# {"status":"ok","provider":"claude"}
```
Or with Docker: `docker compose up --build`.

### 4. Use the built-in UI
Open `http://localhost:8787/`, click **⚙ Settings**, paste your API key. Drag
a document in, review the extracted fields, then pick a destination tab:
**Download** (zero config), **Webhook** (any HTTPS endpoint), or any
registered CRM tab (**Salesforce**, **HubSpot**, ...) — those tabs and their
credential fields are generated automatically from the connector registry.

### 5. Connect it to a CRM
See **[docs/CONNECTING_A_CRM.md](docs/CONNECTING_A_CRM.md)** for the full
walkthrough (Salesforce and HubSpot today, plus the generic pattern that
applies to any CRM reachable over HTTPS). Short version:
1. In the UI or via the API, call `GET /v1/connectors` to see what's registered and what credentials it needs.
2. Get credentials for that system (a Salesforce access token, a HubSpot Private App token, etc.) — see the doc for exactly where to generate each one.
3. `POST /v1/connectors/{crmId}/objects` → pick a target object. `POST /v1/connectors/{crmId}/fields` → map extracted fields to it. `POST /v1/connectors/{crmId}/create` → create the record.

No CRM-specific connector yet? The **Webhook** connector (`POST /v1/connectors/webhook/submit`) pushes the mapped fields as JSON to any HTTPS endpoint, which covers most CRMs/ERPs/automation platforms (Zapier, Make, Power Automate, a CRM's own inbound-webhook trigger) with zero code.

### 6. Deploying to production
Any Node 18+ host works. Put a real TLS-terminating URL in front of it, inject
`API_KEYS`/provider keys as real secrets (not a committed `.env`), and read
**[docs/SECURITY.md](docs/SECURITY.md)** before pointing it at production data.

## Documentation map
| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Request flow, the dynamic connector framework, why the AI-provider and CRM layers are both pluggable |
| [docs/CONNECTING_A_CRM.md](docs/CONNECTING_A_CRM.md) | Step-by-step for Salesforce, HubSpot, and the generic Webhook path |
| [docs/ADDING_A_NEW_CONNECTOR.md](docs/ADDING_A_NEW_CONNECTOR.md) | How to register a new CRM (Zoho, Dynamics 365, Pipedrive, an internal ERP, ...) |
| [docs/CHALLENGES_AND_ROADMAP.md](docs/CHALLENGES_AND_ROADMAP.md) | Real integration challenges you'll hit per-CRM, and the enhancements needed to compete with market document-intelligence products |
| [docs/SECURITY.md](docs/SECURITY.md) | Production hardening checklist |
| [openapi.yaml](openapi.yaml) | Full machine-readable API reference |

## API reference (summary)
Every endpoint below requires `x-api-key: <one of your API_KEYS>` except `/v1/health`. Full request/response schemas: [openapi.yaml](openapi.yaml).

| Method & path | Purpose |
|---|---|
| `GET /v1/health` | Liveness + which AI provider is active |
| `GET /v1/document-types` | Supported document-type hints |
| `POST /v1/extract` | Extract fields from a PDF/image/DOCX (base64) |
| `POST /v1/extract-text` | Extract fields from pre-extracted plain text |
| `GET /v1/connectors` | List registered CRM connectors + their required credential fields |
| `POST /v1/connectors/:crmId/objects` | List creatable objects for that CRM |
| `POST /v1/connectors/:crmId/fields` | Describe creatable fields for one object |
| `POST /v1/connectors/:crmId/create` | Create a record |
| `POST /v1/connectors/webhook/submit` | Push field values as JSON to any HTTPS endpoint |

## License
See [LICENSE](LICENSE).
