# Connecting a CRM

All CRM connectors follow the same three-call pattern:
`GET /v1/connectors` (discover) → `POST /v1/connectors/:crmId/objects` (list
targets) → `POST /v1/connectors/:crmId/fields` (list a target's fields) →
`POST /v1/connectors/:crmId/create` (write the record). Every call after
discovery needs a `credentials` object shaped according to that connector's
`authType` (see `GET /v1/connectors`, or the table below).

## Salesforce

**Auth type:** `bearer` → credentials: `{ instanceUrl, token }`

1. **Get an access token + instance URL.**
   - Fastest for testing, if you have the Salesforce CLI authenticated against an org:
     ```bash
     sf org display --target-org your-org-alias --json
     ```
     Take `result.accessToken` → `token`, `result.instanceUrl` → `instanceUrl`.
   - For an unattended integration (no human present to refresh a session token), set up a Salesforce **Connected App** with the **OAuth 2.0 JWT Bearer flow** and exchange a signed JWT for a fresh access token before each call.
2. In the UI's **Salesforce** tab (or via the API), paste the instance URL and access token, click **Load objects** — this calls `POST /v1/connectors/salesforce/objects`, which lists Account/Contact/Lead/Opportunity/Case plus any accessible custom object.
3. Pick a target object — auto-loads its creatable fields (`POST /v1/connectors/salesforce/fields`).
4. Fill in the **Map to** column per extracted field, click **Create Record** (`POST /v1/connectors/salesforce/create`).

```bash
curl -X POST http://localhost:8787/v1/connectors/salesforce/create \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{
    "credentials": { "instanceUrl": "https://yourorg.my.salesforce.com", "token": "00D..." },
    "objectApiName": "Account",
    "fieldValues": { "Name": "Acme Corp" }
  }'
```

Allowed hosts: only `*.salesforce.com` / `*.force.com` (enforced both by the
generic route layer and inside `salesforceConnector.js` — see
[ARCHITECTURE.md](ARCHITECTURE.md)).

## HubSpot

**Auth type:** `bearer` → credentials: `{ token }`

1. In HubSpot: **Settings → Integrations → Private Apps → Create a private app.** Grant it `crm.objects.contacts.write` (and companies/deals/tickets/custom-object scopes as needed), then copy the generated access token (starts `pat-...`).
2. In the UI's **HubSpot** tab, paste the token, click **Load objects** — lists Contacts/Companies/Deals/Tickets plus any custom objects in that portal (`POST /v1/connectors/hubspot/objects`).
3. Pick an object — loads its writable properties (`POST /v1/connectors/hubspot/fields`).
4. Map fields, click **Create Record** (`POST /v1/connectors/hubspot/create`).

```bash
curl -X POST http://localhost:8787/v1/connectors/hubspot/create \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{
    "credentials": { "token": "pat-na1-..." },
    "objectApiName": "contacts",
    "fieldValues": { "email": "jane@example.com", "firstname": "Jane" }
  }'
```

Known gap: HubSpot's properties API doesn't expose a create-time "required"
flag the way Salesforce's describe call does, so `required` is always
reported `false` for HubSpot fields — see
[CHALLENGES_AND_ROADMAP.md](CHALLENGES_AND_ROADMAP.md).

## Any other CRM — via the generic Webhook connector (no code required)
If a CRM isn't registered yet, most CRMs/ERPs/automation platforms
(HubSpot workflows, Zapier "Catch Hook", Power Automate HTTP trigger, Zoho
Flow, Microsoft Dynamics Power Automate connector, or your own
`POST /intake` endpoint) accept an inbound JSON webhook — that already covers
"any system" without writing a connector:

1. In the target system, create/copy an inbound webhook URL.
2. In the UI's **Webhook** tab (or the API), set that as `targetUrl`. Add an `Authorization` value in the auth field if the target requires one.
3. Edit the **Map to** column per field if the target expects different key names.
4. Send. The service validates the URL (must be `https://`, must not point at a private/internal address) and forwards `{ "fieldValues": {...} }` as JSON.

```bash
curl -X POST http://localhost:8787/v1/connectors/webhook/submit \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"targetUrl":"https://hooks.example.com/intake","fieldValues":{"invoiceNumber":"INV-1001","totalAmount":"1250.00"}}'
```

## Any other CRM — with native object/field discovery
If you want the same "pick an object → auto-load its fields" experience
HubSpot and Salesforce get (instead of a flat JSON payload), register a real
connector — see
**[ADDING_A_NEW_CONNECTOR.md](ADDING_A_NEW_CONNECTOR.md)**.

## Calling this from Salesforce Apex (instead of calling an AI vendor directly)
1. Setup → Named Credentials → External Credentials: create one with a Custom Header parameter `x-api-key: <your API key>`.
2. Setup → Named Credentials → New, e.g. `Doc_Intelligence_Scanner`, URL = this service's base URL, linked to that External Credential.
3. Call `callout:Doc_Intelligence_Scanner/v1/extract` and deserialize the response — the field names match `DocumentExtractionResult.cls`'s shape, so existing Apex/LWC code that consumed that class needs minimal changes.
