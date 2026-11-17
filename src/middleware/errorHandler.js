const { ProviderConfigError, ProviderCallError } = require('../providers/errors');

// Centralized error -> HTTP mapping. Deliberately never forwards raw upstream
// response bodies or stack traces to the caller (the original Apex service
// echoed `res.getBody()` straight into errorMessage on failure - see README
// "Issues Found" #3). Full detail still goes to the server log for debugging.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err instanceof ProviderConfigError) {
    return res.status(503).json({ error: 'AI provider is not configured on the server.' });
  }
  if (err instanceof ProviderCallError) {
    return res.status(502).json({ error: 'AI provider call failed. See server logs for details.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large.' });
  }

  return res.status(500).json({ error: 'Internal error.' });
}

module.exports = { errorHandler };
