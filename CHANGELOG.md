# Changelog

## Unreleased
### Added
- Dynamic, registry-driven CRM connector framework (`src/connectors/registry.js`, `src/connectors/authStrategies.js`) — adding a CRM is now a registry entry + one adapter module, not a new route file and new hardcoded UI markup.
- HubSpot connector (`src/connectors/hubspotConnector.js`) — second concrete connector alongside Salesforce, using HubSpot's CRM v3 API.
- Pluggable auth strategies: `bearer`, `apiKeyHeader`, `basic`, `oauth2ClientCredentials`.
- `GET /v1/connectors` — registry introspection endpoint; the built-in UI now renders CRM destination tabs and credential forms from this instead of hardcoding Salesforce.
- `docs/` — architecture, CRM-connection walkthrough, new-connector guide, security checklist, and a challenges/roadmap doc.

### Changed
- Default AI provider is now **Claude** (`AI_PROVIDER=claude`); Gemini and OpenAI remain available via the same env var / per-request `provider` field.
- `src/connectors/salesforceConnector.js` refactored to accept resolved `authHeaders` instead of building its own `Authorization` header, so it fits the same connector-module contract as every other CRM.
- `src/routes/connectors.js` rewritten: the three Salesforce-specific route handlers became generic `POST /v1/connectors/:crmId/{objects,fields,create}` handlers that resolve against the registry. **Request body shape changed** — credentials now go under a `credentials` object (e.g. `{ credentials: { instanceUrl, token } }`) instead of flat top-level fields (`{ instanceUrl, accessToken }`).
- `public/app.js` / `public/index.html` — removed the hardcoded Salesforce tab; destination tabs for registered CRMs are now generated dynamically.
- `openapi.yaml` — documented the new `/v1/connectors/*` routes, added the missing DOCX `mimeType` enum value on `/v1/extract`, reordered the `provider` enum with `claude` first.

## 1.0.0
- Initial standalone extraction from the Salesforce `IntellegenceScanner` LWC/Apex app: Express backend, built-in UI, pluggable AI providers (Gemini default, OpenAI, Claude), Salesforce connector, generic Webhook connector.
