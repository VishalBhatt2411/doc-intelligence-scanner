const { ProviderConfigError } = require('../providers/errors');

// Dynamic auth layer: every connector in the registry declares an `authType`
// instead of hand-building its own Authorization header. Adding a CRM whose
// API uses one of the schemes below needs zero new auth code - just a
// registry entry (see registry.js). Each strategy turns a caller-supplied
// `credentials` object into outbound request headers.

function requireFields(credentials, fields) {
  const missing = fields.filter((f) => !credentials || !credentials[f]);
  if (missing.length) {
    throw new ProviderConfigError(`Missing credential field(s): ${missing.join(', ')}`);
  }
}

// In-memory cache so repeated calls in the same process don't re-authenticate
// on every request for client-credentials-style (server-to-server) flows.
const tokenCache = new Map();

async function fetchClientCredentialsToken({ clientId, clientSecret, tokenUrl, scope }) {
  const cacheKey = `${tokenUrl}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      ...(scope ? { scope } : {})
    })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.access_token) {
    throw new ProviderConfigError('OAuth2 client-credentials token request failed.');
  }
  const ttlMs = (Number(body.expires_in) || 3600) * 1000;
  tokenCache.set(cacheKey, { token: body.access_token, expiresAt: Date.now() + ttlMs - 5000 });
  return body.access_token;
}

const strategies = {
  // Caller pastes a ready-made bearer token (Salesforce session/OAuth token,
  // HubSpot Private App token, etc.) - the same UX the app already used for
  // Salesforce, generalized to any vendor that accepts `Authorization: Bearer`.
  bearer: {
    fields: ['token'],
    headers(credentials) {
      requireFields(credentials, this.fields);
      return { Authorization: `Bearer ${credentials.token}` };
    }
  },

  // Vendors that expect the key under a non-standard header name
  // (e.g. Zoho's `Authorization: Zoho-oauthtoken <token>`, or a plain
  // `X-Api-Key` style header).
  apiKeyHeader: {
    fields: ['headerName', 'value'],
    headers(credentials) {
      requireFields(credentials, this.fields);
      return { [credentials.headerName]: credentials.value };
    }
  },

  // HTTP Basic auth (username/password or username/API-token pairs).
  basic: {
    fields: ['username', 'password'],
    headers(credentials) {
      requireFields(credentials, this.fields);
      const token = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }
  },

  // Full server-to-server OAuth2 - the service exchanges client id/secret for
  // a bearer token itself (and caches it) instead of the caller managing one.
  oauth2ClientCredentials: {
    fields: ['clientId', 'clientSecret', 'tokenUrl'],
    async headers(credentials) {
      requireFields(credentials, this.fields);
      const token = await fetchClientCredentialsToken(credentials);
      return { Authorization: `Bearer ${token}` };
    }
  }
};

async function resolveAuthHeaders(authType, credentials) {
  const strategy = strategies[authType];
  if (!strategy) throw new ProviderConfigError(`Unknown auth type "${authType}".`);
  return strategy.headers(credentials || {});
}

function credentialFieldsFor(authType) {
  const strategy = strategies[authType];
  return strategy ? strategy.fields : [];
}

module.exports = { resolveAuthHeaders, credentialFieldsFor, AUTH_TYPES: Object.keys(strategies) };
