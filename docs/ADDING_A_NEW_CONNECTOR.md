# Adding a new CRM connector

`src/connectors/hubspotConnector.js` is the template to copy — it proves the
pattern works for a second, structurally different CRM API, not just
Salesforce. Steps:

### 1. Pick an auth strategy
Check `src/connectors/authStrategies.js` — if the target CRM's auth fits
`bearer`, `apiKeyHeader`, `basic`, or `oauth2ClientCredentials`, you need zero
new auth code. If it needs a full OAuth2 authorization-code + refresh-token
flow (most public "Connect app" integrations, needed if you'll support many
different customers' accounts rather than one you administer), that's a
larger addition — see "OAuth2 authorization-code flow" below.

### 2. Write the connector module
Create `src/connectors/<system>Connector.js` exporting three functions with
this exact shape (matching `hubspotConnector.js`):

```js
async function listObjects({ credentials, authHeaders }) { /* -> [{label, value}] */ }
async function describeFields({ credentials, authHeaders, objectApiName }) { /* -> [{label, value, required}] */ }
async function createRecord({ credentials, authHeaders, objectApiName, fieldValues }) { /* -> { id } */ }
module.exports = { listObjects, describeFields, createRecord };
```
Keep it as plain `fetch` calls — no dependency on the rest of the app. Wrap
upstream HTTP failures in `ProviderCallError` (from `src/providers/errors.js`)
so they get the same generic-to-caller/detailed-in-server-logs treatment as
every other connector (see `src/middleware/errorHandler.js`) — never leak a
raw upstream error body straight back to the caller.

### 3. Register it
Add one entry to `src/connectors/registry.js`:
```js
{
  id: 'zoho',
  label: 'Zoho CRM',
  authType: 'apiKeyHeader',                 // or bearer / basic / oauth2ClientCredentials
  credentialFields: [
    { name: 'headerName', label: 'Header name', placeholder: 'Authorization' },
    { name: 'value', label: 'Header value', secret: true, placeholder: 'Zoho-oauthtoken 1000.xxx' }
  ],
  hostField: null,                          // or the credential name holding a caller-supplied base URL
  hostAllowlist: /\.zohoapis\.com$/i,        // required if hostField is set - prevents SSRF
  module: require('./zohoConnector')
}
```
- If the CRM's API always lives at one fixed host (like HubSpot's
  `api.hubapi.com`), set `hostField: null` and hardcode the base URL inside
  the connector module.
- If customers each have their own instance URL (like Salesforce), set
  `hostField` to the credential name holding it, and `hostAllowlist` to a
  regex matching only that vendor's real domain(s) — this is mandatory, not
  optional, because a caller-supplied URL that's fetched server-side is an
  SSRF vector by construction (see [SECURITY.md](SECURITY.md)).

That's the entire integration. `routes/connectors.js` and `public/app.js`
both already drive themselves off this registry — no route file, no UI
markup to write.

### 4. Test it
Add cases to `test/connectors.test.js` mirroring the existing Salesforce/
HubSpot ones: a host-allowlist rejection test (if `hostField` is set) and a
`registry.get('yourid')` sanity check. Full HTTP-call coverage needs a live
sandbox account or a mocked `fetch` (see `test/webhookConnector.test.js` for
the mocking pattern used elsewhere in this repo).

### 5. Verify end-to-end
```bash
npm start
curl -H "x-api-key: $API_KEY" http://localhost:8787/v1/connectors   # confirm it's listed
```
Then open the UI — the new CRM's tab and credential form should appear
automatically.

## OAuth2 authorization-code flow (for public, multi-tenant connectors)
The `bearer`/`basic`/`apiKeyHeader`/`oauth2ClientCredentials` strategies all
assume the caller already has a usable credential in hand (a pasted token, a
service-account secret). A connector meant to be installed by many different
customers into their own CRM accounts (the way a real HubSpot or Salesforce
AppExchange listing works) instead needs:
- An app registered with the CRM vendor (client id/secret, redirect URI).
- A `/connect/:crmId/start` route that redirects the browser to the vendor's
  authorization URL.
- A `/connect/:crmId/callback` route that exchanges the returned code for an
  access + refresh token pair, and **persists** them somewhere (this service
  is currently stateless by design — this is the one case where you'd need a
  datastore).
- A new `oauth2AuthorizationCode` auth strategy that looks up the stored
  refresh token for the calling tenant and exchanges it for a fresh access
  token per request.

This is real, scoped work — not a registry one-liner — which is why it's
called out as a roadmap item in
[CHALLENGES_AND_ROADMAP.md](CHALLENGES_AND_ROADMAP.md) rather than shipped
by default.
