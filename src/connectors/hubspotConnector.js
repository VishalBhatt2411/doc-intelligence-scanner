const { ProviderCallError } = require('../providers/errors');

// Second concrete connector, proving the registry-driven framework is real
// and not Salesforce-specific: HubSpot's CRM v3 API. Same three operations as
// the Salesforce connector (list creatable objects, describe fields, create a
// record), same "auth is resolved by the caller and handed in as
// authHeaders" contract. Auth in the registry is `bearer` (a HubSpot Private
// App access token) - see registry.js for how to swap that for a full OAuth2
// authorization-code flow later without touching this file.

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// HubSpot's standard CRM objects always exist and are always creatable via
// the API; custom objects are discovered per-portal below.
const STANDARD_OBJECTS = [
  { label: 'Contact', value: 'contacts' },
  { label: 'Company', value: 'companies' },
  { label: 'Deal', value: 'deals' },
  { label: 'Ticket', value: 'tickets' }
];

async function hsFetch({ authHeaders }, path, init) {
  const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(init && init.headers)
    }
  });
  return res;
}

async function listObjects({ authHeaders }) {
  const res = await hsFetch({ authHeaders }, '/crm/v3/schemas');
  const body = await res.json().catch(() => null);

  let custom = [];
  if (res.ok && body && Array.isArray(body.results)) {
    custom = body.results.map((s) => ({
      label: (s.labels && s.labels.singular) || s.name,
      value: s.objectTypeId || s.name
    }));
  } else {
    // Custom-schema lookup is best-effort - a portal with no custom objects,
    // or a token scoped only to standard objects, still gets the standard list.
    console.error('HubSpot custom-schemas lookup failed (continuing with standard objects only)', res.status, body);
  }

  return [...STANDARD_OBJECTS, ...custom].sort((a, b) => a.label.localeCompare(b.label));
}

async function describeFields({ authHeaders, objectApiName }) {
  const res = await hsFetch({ authHeaders }, `/crm/v3/properties/${encodeURIComponent(objectApiName)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    console.error('HubSpot describe-properties error', res.status, body);
    throw new ProviderCallError(`HubSpot returned HTTP ${res.status} describing ${objectApiName}.`);
  }

  return (body.results || [])
    .filter((p) => !p.calculated && !p.hidden)
    .map((p) => ({
      label: p.label || p.name,
      value: p.name,
      // HubSpot's properties API doesn't expose a create-time "required"
      // flag the way Salesforce's describe does - left false rather than
      // guessing; see README "Known limitations".
      required: false
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function createRecord({ authHeaders, objectApiName, fieldValues }) {
  const res = await hsFetch({ authHeaders }, `/crm/v3/objects/${encodeURIComponent(objectApiName)}`, {
    method: 'POST',
    body: JSON.stringify({ properties: fieldValues || {} })
  });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    console.error('HubSpot create-record error', res.status, body);
    const message = body && body.message ? body.message : `HTTP ${res.status}`;
    throw new ProviderCallError(`HubSpot rejected the record: ${message}`);
  }

  return { id: body.id };
}

module.exports = { listObjects, describeFields, createRecord };
