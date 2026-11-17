const { assertSafeDestinationUrl } = require('./urlSafety');
const { ProviderCallError } = require('../providers/errors');

// The universal connector: POSTs the mapped field values as JSON to any URL
// the caller configures. This is what makes the service pluggable into
// systems with no dedicated connector - most CRMs/ERPs/automation tools
// (Zapier, Make, Power Automate, a custom endpoint) accept an inbound
// webhook, so this one connector covers "any system" as a fallback even
// before a native connector like the Salesforce one exists for it.
async function submit({ targetUrl, authHeader, fieldValues, extra }) {
  const url = assertSafeDestinationUrl(targetUrl);

  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers.Authorization = authHeader;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fieldValues, ...(extra || {}) })
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('Webhook destination error', res.status, text);
    throw new ProviderCallError(`Destination returned HTTP ${res.status}.`);
  }

  return { status: res.status };
}

module.exports = { submit };
