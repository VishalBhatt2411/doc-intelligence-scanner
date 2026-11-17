# Security & production hardening checklist

This service handles document content (potentially PII — passports, medical
reports, contracts) and CRM credentials (access tokens). Before pointing it
at real data:

- [ ] **Secrets manager** for `API_KEYS` and AI-provider keys instead of a plain `.env` file on disk.
- [ ] **Per-caller API keys**, not one shared key — so you can tell which system sent what, and revoke one integration without rotating everyone's key.
- [ ] **Structured audit logging** of extraction/submit requests (who, what document type, timestamp, target CRM/object — not document content) for compliance.
- [ ] **Retry/backoff** around outbound AI-provider and CRM connector calls.
- [ ] **Malware/AV scanning** on uploaded bytes if documents can come from untrusted end users.
- [ ] **Real OAuth for unattended integrations** — a Salesforce Connected App with the JWT Bearer flow, or a proper OAuth2 authorization-code app for HubSpot, instead of a long-lived pasted token, for anything running without a human present. See [ADDING_A_NEW_CONNECTOR.md](ADDING_A_NEW_CONNECTOR.md).
- [ ] **A DNS-aware egress allow-list** in front of the Webhook/Salesforce/any host-allowlisted connector. The built-in `urlSafety.js` guard and the registry's per-connector `hostAllowlist` block obvious private/loopback literals and restrict to known vendor domains, but neither resolves DNS — a public hostname that later resolves to a private IP (DNS rebinding) is not caught by a literal string check.
- [ ] **TLS termination in front of the service** — the Dockerfile itself does not do TLS.
- [ ] **Data processing agreement / data-use review with your AI provider** before sending regulated document content (passports, medical records) — the AI vendor is a data processor in this flow; "this service is stateless" does not by itself satisfy a compliance requirement.
- [ ] **Rate limiting tuned to real load** — `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` ship with conservative defaults; tune per expected traffic.
- [ ] **CORS left disabled** (`CORS_ORIGINS` blank) unless a separately-hosted frontend genuinely needs browser-based cross-origin calls — server-to-server calls don't need it.

## Known limitations (not bugs — documented tradeoffs)
- **No built-in virus/malware scanning** of uploaded bytes.
- **No persistence layer** — stateless by design; storing the original file and result is left to whatever system you push into or download to.
- **The built-in UI's API key and CRM credentials live in browser `localStorage`/in-memory form fields**, entered by whoever opens the page — appropriate for an internal/admin tool used by trusted staff, not a public-facing form.
- **`urlSafety.js` and connector `hostAllowlist` checks are literal, not DNS-aware.**
- **OpenAI provider only accepts raster images, not PDFs**, via the Chat Completions API used here — use Claude or Gemini for PDF input if OpenAI is selected as the provider.

## Reporting a security issue
Treat this the same as any other vulnerability report for internal tooling:
notify the maintainer/team owning this deployment directly rather than
filing a public issue, especially if it involves a live credential or a
concrete SSRF/auth bypass.
