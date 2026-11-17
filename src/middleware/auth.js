const crypto = require('crypto');
const config = require('../config');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Every consuming system (Salesforce, another CRM, an internal script) must
// present one of the configured API keys. This is what makes the service safe
// to expose to "any system" - callers are identified/authorized at the edge
// instead of relying on network location alone.
function apiKeyAuth(req, res, next) {
  if (config.apiKeys.size === 0) {
    return res.status(500).json({ error: 'Service misconfigured: no API_KEYS set.' });
  }

  const presented = req.get('x-api-key');
  if (!presented) {
    return res.status(401).json({ error: 'Missing x-api-key header.' });
  }

  const isValid = [...config.apiKeys].some((key) => timingSafeEqual(presented, key));
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid API key.' });
  }

  next();
}

module.exports = { apiKeyAuth };
