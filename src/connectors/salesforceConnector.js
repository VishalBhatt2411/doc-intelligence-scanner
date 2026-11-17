const { ProviderCallError } = require('../providers/errors');

// A concrete example of a "real" connector (as opposed to the generic
// webhook one): talks to any Salesforce org's own REST API, doing the same
// three jobs DocumentScannerController.cls did inside Apex - list creatable
// objects, describe a target object's fields, and insert a record - but from
// outside the org over HTTPS. This is the template to copy when adding a
// connector for a different system (see registry.js / README "Adding a
// connector for another system"). Auth is resolved generically by the caller
// (routes/connectors.js, via authStrategies.js) and handed in as
// `authHeaders` - this module only knows Salesforce's REST API shape, not how
// the caller authenticated.

const API_VERSION = 'v61.0';
const ALLOWED_STANDARD_OBJECTS = new Set(['Account', 'Contact', 'Lead', 'Opportunity', 'Case']);

// Restrict to real Salesforce domains so this connector can't be turned into
// an open SSRF proxy by pointing "instanceUrl" at an arbitrary host. Enforced
// here as the authoritative, connector-specific check; the registry's
// hostAllowlist gives the generic route layer a second, defense-in-depth copy
// of the same rule.
const SALESFORCE_HOST_PATTERN = /\.(salesforce\.com|force\.com)$/i;

function assertSalesforceInstanceUrl(instanceUrl) {
  let parsed;
  try {
    parsed = new URL(instanceUrl);
  } catch {
    throw new Error('instanceUrl is not a valid URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('instanceUrl must use https.');
  }
  if (!SALESFORCE_HOST_PATTERN.test(parsed.hostname)) {
    throw new Error('instanceUrl must be a *.salesforce.com or *.force.com domain.');
  }
  return parsed.origin;
}

async function sfFetch({ credentials, authHeaders }, path, init) {
  const origin = assertSalesforceInstanceUrl(credentials.instanceUrl);
  const res = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(init && init.headers)
    }
  });
  return res;
}

async function listObjects({ credentials, authHeaders }) {
  const res = await sfFetch({ credentials, authHeaders }, `/services/data/${API_VERSION}/sobjects/`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    console.error('Salesforce describe-global error', res.status, body);
    throw new ProviderCallError(`Salesforce returned HTTP ${res.status} listing objects.`);
  }

  return (body.sobjects || [])
    .filter((o) => o.createable && !o.customSetting && (o.custom || ALLOWED_STANDARD_OBJECTS.has(o.name)))
    .map((o) => ({ label: o.label, value: o.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function describeFields({ credentials, authHeaders, objectApiName }) {
  const res = await sfFetch(
    { credentials, authHeaders },
    `/services/data/${API_VERSION}/sobjects/${encodeURIComponent(objectApiName)}/describe/`
  );
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    console.error('Salesforce describe-object error', res.status, body);
    throw new ProviderCallError(`Salesforce returned HTTP ${res.status} describing ${objectApiName}.`);
  }

  return (body.fields || [])
    .filter((f) => f.createable)
    .map((f) => ({
      label: f.label,
      value: f.name,
      required: !f.nillable && !f.defaultedOnCreate
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function createRecord({ credentials, authHeaders, objectApiName, fieldValues }) {
  const res = await sfFetch(
    { credentials, authHeaders },
    `/services/data/${API_VERSION}/sobjects/${encodeURIComponent(objectApiName)}/`,
    { method: 'POST', body: JSON.stringify(fieldValues || {}) }
  );
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    console.error('Salesforce create-record error', res.status, body);
    const message = Array.isArray(body) && body[0] && body[0].message ? body[0].message : `HTTP ${res.status}`;
    throw new ProviderCallError(`Salesforce rejected the record: ${message}`);
  }

  return { id: body.id };
}

module.exports = { listObjects, describeFields, createRecord, assertSalesforceInstanceUrl };
