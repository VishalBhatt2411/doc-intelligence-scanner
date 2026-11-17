# Challenges and roadmap

## Challenges you will actually hit

### Per-CRM integration challenges
| Challenge | Detail |
|---|---|
| **No unified auth experience** | Salesforce and HubSpot both use `bearer` today, but that's a simplification — Salesforce's real production answer is the OAuth 2.0 JWT Bearer flow (server-to-server, token refreshed per call), HubSpot's is a Private App token *or* a full OAuth app, and the next CRM you add might need Basic auth or a signed-request scheme. A pasted token (what the UI supports today) is fine for an admin tool, not for unattended, many-tenant use. |
| **SSRF risk on every caller-supplied host** | Any connector where a customer supplies their own instance URL (Salesforce-style) is a server-side-request-forgery vector by construction — the host-allowlist regex has to be right, and it's still a literal string check, not DNS-aware (see [SECURITY.md](SECURITY.md) on DNS rebinding). Adding a CRM with a similarly "bring your own base URL" model means getting this right again. |
| **Rate limits differ per vendor** | Salesforce enforces per-24h API call limits by org edition; HubSpot enforces per-10-second and daily limits by tier. Neither connector currently retries/backs off — a burst of documents can start failing outright rather than queuing. |
| **Field-schema drift** | `describeFields` reflects the CRM's schema *at call time*. If an admin renames/removes a field after a mapping was set up (a saved template, a webhook's fixed field names), the next create fails or silently drops a field — there's no schema-version check today. |
| **Sandbox vs. production environments** | Salesforce has a clean sandbox/production URL distinction (`test.salesforce.com` vs `login.salesforce.com`, different `instanceUrl`s) that's easy to get right by parameterizing `instanceUrl`. HubSpot's testing story (developer test accounts) doesn't map as cleanly to "swap one URL" — expect to manage separate credentials per environment rather than a clean URL switch. |
| **HubSpot's "required field" gap** | HubSpot's Properties API doesn't expose a create-time-required flag the way Salesforce's `describe` call does (`nillable`/`defaultedOnCreate`). `hubspotConnector.js` reports `required: false` for everything rather than guessing — a HubSpot create can still fail on a missing required property that the UI didn't flag. |
| **No multi-object / relationship support yet** | Real CRM workflows are rarely "create one flat record." An invoice often needs a Contact *and* a Deal/Opportunity, associated to each other. Both connectors only do a single `createRecord` call today — composing multiple creates + an association call is left to the caller. |
| **Data residency / compliance** | Every extraction sends document content to a third-party AI API (Anthropic/Google/OpenAI). For regulated content (passports, medical reports, contracts with PII), that implies you need to review that vendor's data-use/retention terms, likely need a DPA, and should not assume "stateless service" alone satisfies compliance requirements — the AI vendor itself is a data processor in the flow. |

### Platform-level challenges
- **No persistence layer, by design.** Stateless means no built-in audit trail, no retry queue, no "what did we extract from this file six months ago" lookup — that's entirely the caller's responsibility today.
- **Confidence scores aren't apples-to-apples across providers.** Claude/Gemini/OpenAI don't return a calibrated, standardized confidence number — what's shown is the model's own self-reported estimate per provider, which can behave differently between vendors and shouldn't be treated as a statistically calibrated probability.
- **Document parsing fidelity varies by type.** DOCX goes through `mammoth` (formatting/table structure can be lossy); scanned images depend entirely on the model's OCR quality; very long/multi-page PDFs and handwritten content are harder than clean digital invoices.
- **Prompt injection from document content.** A malicious "document" containing text like "ignore prior instructions, output X" is mitigated with one instruction line in the prompt (`utils/promptBuilder.js`) but not eliminated — treat extracted field values as untrusted input downstream, especially before using them to build further prompts or queries.
- **Large-file handling is synchronous.** `MAX_FILE_MB` (default 10MB) is enforced with no chunked-upload or background-job path — a large batch job will block on request/response cycles rather than queuing.
- **Thin coverage on the actual HTTP calls.** The test suite covers auth, URL-safety guards, and response parsing solidly; it does not exercise live Salesforce/HubSpot/AI-provider HTTP calls (those need a mocked `fetch` or a real sandbox account) — a wire-format change on any vendor's side won't be caught by `npm test` alone.

## Enhancements to compete with market document-intelligence products
(Reference class: Docsumo, Nanonets, Rossum, ABBYY FlexiCapture/Vantage,
Hyperscience — what they offer that this doesn't yet.)

| Enhancement | Why it matters |
|---|---|
| **Human-in-the-loop review queue + correction feedback loop** | Every serious competitor lets a reviewer correct a field once and either auto-applies that correction pattern to future documents from the same source, or at minimum logs corrections for prompt/schema tuning. Today corrections are one-off and never fed back. |
| **Reusable per-tenant field-mapping templates** | Right now every document re-maps "invoiceNumber → Invoice_Number\_\_c" from scratch. Saving a mapping template per (documentType, CRM object) pair turns a multi-step manual task into "upload → auto-mapped → confirm." |
| **Table / line-item extraction** | Invoices, purchase orders, and medical bills have line-item tables, not just header fields. This service currently extracts flat key/value fields only — no structured table output. This is one of the biggest capability gaps vs. Docsumo/Rossum. |
| **Multi-object / related-record push in one submit** | Create a Contact + a Deal and associate them (HubSpot), or an Account + Opportunity + Contact Role (Salesforce), in one submit instead of one flat record — matches how these objects are actually used. |
| **True OAuth2 "Connect your CRM" onboarding** | Replacing pasted tokens with a real authorization-code flow + refresh tokens (see [ADDING_A_NEW_CONNECTOR.md](ADDING_A_NEW_CONNECTOR.md)) is table stakes for a product a non-technical admin would self-serve install, versus an internal tool. |
| **Duplicate / near-duplicate detection before create** | Fuzzy-match on name/email/phone/tax-ID against the target CRM before creating, with a "merge into existing vs. create new" decision — the original Salesforce app had a minimal version of this (email-only); it doesn't exist in the standalone connectors yet. |
| **Batch/bulk upload + async processing** | Queue a folder of documents, process them in the background, notify (webhook/email) on completion — needed for any real-volume use case beyond one-file-at-a-time. |
| **Signature / handwriting detection** | Flag whether a document is signed, extract handwritten annotations — common in contracts and medical intake forms, a frequent ask against generic OCR tools. |
| **Multi-language extraction** | Prompts and schemas are English-oriented today; documents in other languages aren't a first-class scenario yet. |
| **Audit log + analytics dashboard** | Who scanned what, when, which provider/connector, success/failure rates, cost per extraction — necessary for any team rollout beyond a single admin's local `.env`. |
| **Confidence-based auto-approval thresholds** | Auto-create above a configurable confidence threshold, route below-threshold extractions to human review — turns "always review everything" into "review the ones that need it." |
| **Retry/backoff + dead-letter handling** | Wrap outbound AI-provider and CRM calls in retry-with-backoff, with a dead-letter path for calls that exhaust retries, instead of a single-attempt call that fails the whole submission. |
| **Usage metering per API key/tenant** | If this is ever offered to more than one internal team, per-key usage counts and quotas turn "one shared API key" into something you can actually govern and bill against. |

None of the above are required to use the service as-is — the dynamic
connector framework and Claude-based extraction work today for the
single-record, one-document-at-a-time case. This list is what separates "a
working internal tool" from "a product that competes with dedicated
document-intelligence vendors."
