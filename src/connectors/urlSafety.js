const config = require('../config');

// Since this service accepts a destination URL from the caller and then makes
// a server-side request to it (the whole point of "push data into any
// system"), that's an SSRF vector by construction. This is a basic guard, not
// a complete one - it blocks the obvious cases (private/loopback IPs, non-https)
// by hostname/IP literal inspection. It does NOT resolve DNS, so it will not
// catch DNS-rebinding attacks (a public hostname that later resolves to a
// private IP). Put a real network-level egress allow-list in front of this in
// production - see README "Production hardening checklist".
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/,
  /^\[::1\]$/
];

function assertSafeDestinationUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('targetUrl is not a valid URL.');
  }

  if (parsed.protocol !== 'https:' && !(config.webhook.allowInsecure && parsed.protocol === 'http:')) {
    throw new Error('targetUrl must use https.');
  }

  if (PRIVATE_HOST_PATTERNS.some((re) => re.test(parsed.hostname))) {
    throw new Error('targetUrl points at a private/loopback address, which is not allowed.');
  }

  if (config.webhook.allowedHosts.length > 0 && !config.webhook.allowedHosts.includes(parsed.hostname)) {
    throw new Error(`targetUrl host "${parsed.hostname}" is not in WEBHOOK_ALLOWED_HOSTS.`);
  }

  return parsed;
}

module.exports = { assertSafeDestinationUrl };
