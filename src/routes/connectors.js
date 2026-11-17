const express = require('express');
const webhookConnector = require('../connectors/webhookConnector');
const registry = require('../connectors/registry');
const { resolveAuthHeaders } = require('../connectors/authStrategies');
const { ProviderCallError, ProviderConfigError } = require('../providers/errors');

const router = express.Router();

// Input/config validation errors (bad URL, missing credential field, unknown
// connector id, etc.) are the caller's fault -> 400. Upstream failures
// (ProviderCallError et al) are handed to the shared error handler -> 502/503,
// same convention as /extract.
function isCallerError(err) {
  return !(err instanceof ProviderCallError) && !(err instanceof ProviderConfigError);
}

// Generic SSRF guard for any connector whose credentials carry a
// caller-supplied base URL (e.g. Salesforce's instanceUrl). Connectors that
// always call one fixed host (hostField: null) skip this - there's nothing
// caller-supplied to validate.
function assertAllowedHost(connector, credentials) {
  if (!connector.hostField) return;
  const raw = credentials && credentials[connector.hostField];
  if (!raw) throw new Error(`credentials.${connector.hostField} is required.`);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`credentials.${connector.hostField} is not a valid URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`credentials.${connector.hostField} must use https.`);
  }
  if (!connector.hostAllowlist.test(parsed.hostname)) {
    throw new Error(`credentials.${connector.hostField} host "${parsed.hostname}" is not allowed for the "${connector.id}" connector.`);
  }
}

async function resolveConnector(crmId, credentials) {
  const connector = registry.get(crmId);
  if (!connector) throw new Error(`Unknown CRM connector "${crmId}".`);
  assertAllowedHost(connector, credentials);
  const authHeaders = await resolveAuthHeaders(connector.authType, credentials);
  return { connector, authHeaders };
}

// ---- Registry introspection - lets the UI (or any other caller) discover
// which CRMs are available and what credentials each one needs, instead of
// that being hardcoded client-side per vendor. ----

router.get('/connectors', (req, res) => {
  res.json({ connectors: registry.list() });
});

// ---- Generic per-CRM routes - one set of handlers for every connector in
// the registry, instead of one route file per vendor. ----

router.post('/connectors/:crmId/objects', async (req, res, next) => {
  try {
    const { credentials } = req.body || {};
    const { connector, authHeaders } = await resolveConnector(req.params.crmId, credentials);
    const objects = await connector.module.listObjects({ credentials: credentials || {}, authHeaders });
    return res.json({ objects });
  } catch (err) {
    if (isCallerError(err)) return res.status(400).json({ error: err.message });
    return next(err);
  }
});

router.post('/connectors/:crmId/fields', async (req, res, next) => {
  try {
    const { credentials, objectApiName } = req.body || {};
    if (!objectApiName) {
      return res.status(400).json({ error: 'objectApiName is required.' });
    }
    const { connector, authHeaders } = await resolveConnector(req.params.crmId, credentials);
    const fields = await connector.module.describeFields({ credentials: credentials || {}, authHeaders, objectApiName });
    return res.json({ fields });
  } catch (err) {
    if (isCallerError(err)) return res.status(400).json({ error: err.message });
    return next(err);
  }
});

router.post('/connectors/:crmId/create', async (req, res, next) => {
  try {
    const { credentials, objectApiName, fieldValues } = req.body || {};
    if (!objectApiName || !fieldValues) {
      return res.status(400).json({ error: 'objectApiName and fieldValues are required.' });
    }
    const { connector, authHeaders } = await resolveConnector(req.params.crmId, credentials);
    const result = await connector.module.createRecord({ credentials: credentials || {}, authHeaders, objectApiName, fieldValues });
    return res.json(result);
  } catch (err) {
    if (isCallerError(err)) return res.status(400).json({ error: err.message });
    return next(err);
  }
});

// ---- Generic webhook connector - works with any system that accepts an
// inbound HTTP call. Not part of the CRM registry (it has no object/field
// discovery), so it keeps its own fixed route. ----

router.post('/connectors/webhook/submit', async (req, res, next) => {
  try {
    const { targetUrl, authHeader, fieldValues, extra } = req.body || {};
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'targetUrl (string) is required.' });
    }
    if (!fieldValues || typeof fieldValues !== 'object') {
      return res.status(400).json({ error: 'fieldValues (object) is required.' });
    }

    const result = await webhookConnector.submit({ targetUrl, authHeader, fieldValues, extra });
    return res.json(result);
  } catch (err) {
    if (isCallerError(err)) return res.status(400).json({ error: err.message });
    return next(err);
  }
});

module.exports = router;
