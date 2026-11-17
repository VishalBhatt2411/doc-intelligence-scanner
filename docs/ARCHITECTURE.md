# Architecture

## Request flow

1. **Extraction.** A caller (the built-in UI, Salesforce Apex, a script) sends
   a document (base64 PDF/image/DOCX, or pre-extracted text) to
   `POST /v1/extract` or `/v1/extract-text`. `src/routes/extract.js` validates
   the request, resolves an AI provider (`src/providers/index.js`), and
   returns `{ documentType, rawText, fields: [{fieldName, fieldValue,
   confidence}], errorMessage }`.
2. **Review & map.** The caller (usually the UI) lets a human edit the
   extracted values and choose which target field each one maps to.
3. **Push to a destination.** The caller picks a destination: **Download**
   (client-side only, no server involvement), **Webhook** (any HTTPS
   endpoint), or a registered **CRM connector** (Salesforce, HubSpot, ...).

## Two independent pluggable layers

The service has two separate extension points that don't know about each
other — you can add an AI provider without touching connectors, and vice
versa.

### 1. AI provider layer (`src/providers/`)
`getProvider(name)` in `providers/index.js` picks among `claude` (default),
`gemini`, `openai` based on `AI_PROVIDER` in `.env` or a per-request
`provider` field. Every provider module implements the same contract — take a
document + a document-type hint, return the same `{documentType, rawText,
fields, errorMessage}` shape via `utils/parseExtractionResponse.js` — so
swapping vendors is a one-line env var change, never a code change in
`routes/extract.js` or downstream.

### 2. CRM connector layer (`src/connectors/`) — the dynamic part
This is the layer built specifically so the service isn't tied to any one
CRM. Three pieces:

**a. Auth strategies** (`authStrategies.js`) — reusable, declarative auth
handlers. Each one turns a caller-supplied `credentials` object into outbound
HTTP headers:

| Strategy | Credential fields | Use case |
|---|---|---|
| `bearer` | `token` | Salesforce session/OAuth token, HubSpot Private App token |
| `apiKeyHeader` | `headerName`, `value` | Vendors with a non-standard auth header (e.g. Zoho's `Authorization: Zoho-oauthtoken`) |
| `basic` | `username`, `password` | HTTP Basic auth / username+API-token pairs |
| `oauth2ClientCredentials` | `clientId`, `clientSecret`, `tokenUrl` | Full server-to-server OAuth2 — the service fetches and caches the token itself |

Adding a CRM whose API uses one of these schemes needs **zero new auth
code** — just a registry entry.

**b. The registry** (`registry.js`) — one object per CRM, metadata only:
`id`, `label`, `authType`, `credentialFields` (drives the UI's dynamic form),
`hostField` + `hostAllowlist` (SSRF guard for connectors that accept a
caller-supplied base URL, like Salesforce's `instanceUrl`), and `module` (the
connector implementation).

**c. Connector modules** (`salesforceConnector.js`, `hubspotConnector.js`,
...) — each exports the same three functions: `listObjects`,
`describeFields`, `createRecord`. They receive `{ credentials, authHeaders,
... }` — `authHeaders` is already resolved by the auth-strategy layer, so a
connector module only needs to know its vendor's REST API shape, never how
the caller authenticated.

**d. Generic routes** (`routes/connectors.js`) — instead of one route file
per CRM, three parametrized routes (`POST /v1/connectors/:crmId/objects` /
`/fields` / `/create`) resolve `:crmId` against the registry, resolve auth,
and delegate to that connector's module. `GET /v1/connectors` exposes the
registry itself so callers (including the built-in UI) can discover what's
available without hardcoding it.

The **Webhook connector** (`webhookConnector.js`) sits outside this registry
by design — it doesn't do object/field discovery, it just POSTs
`{fieldValues}` to any HTTPS URL, which is why it's the fallback that "covers
any system" even before a native connector exists for it.

## Why the UI has no hardcoded CRM markup
`public/app.js` fetches `GET /v1/connectors` once, then for each entry builds
a destination tab and a credential form from `credentialFields` — see
`buildCrmTabAndPanel()` / `wireCrmConnector()`. Register a new CRM on the
backend and its tab appears in the UI automatically; no HTML/JS changes
needed there either.

## Statelessness
The service holds no database and no session state. It's a pure
transform-and-forward pipeline: document in, extraction out; mapped fields +
credentials in, a create/push call out. Whoever calls it is responsible for
persisting the original file and the extraction result if that's needed for
audit — see [CHALLENGES_AND_ROADMAP.md](CHALLENGES_AND_ROADMAP.md) for what
that implies at scale.
