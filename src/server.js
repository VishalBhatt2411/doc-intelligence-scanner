const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { apiKeyAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const extractRoutes = require('./routes/extract');
const connectorRoutes = require('./routes/connectors');
const { DOCUMENT_TYPES } = require('./schemas/documentSchemas');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: `${Math.ceil(config.maxFileBytes / (1024 * 1024)) + 2}mb` }));

if (config.corsOrigins.length > 0) {
  app.use(cors({ origin: config.corsOrigins }));
}

app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// Health check is intentionally unauthenticated (for load balancers / uptime checks).
app.get('/v1/health', (req, res) => {
  res.json({ status: 'ok', provider: config.aiProvider });
});

app.get('/v1/document-types', apiKeyAuth, (req, res) => {
  res.json({ documentTypes: DOCUMENT_TYPES });
});

app.use('/v1', apiKeyAuth, extractRoutes);
app.use('/v1', apiKeyAuth, connectorRoutes);

// Built-in reference UI - a static single-page app that calls the /v1 API
// above. It asks the user for their own API key client-side (stored only in
// the browser's localStorage) rather than baking one into the served JS, so
// this bundle is safe to serve from the same origin as the API itself.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`doc-intelligence-scanner listening on :${config.port} (provider: ${config.aiProvider})`);
  if (config.apiKeys.size === 0) {
    console.warn('WARNING: no API_KEYS configured - every request will be rejected. Set API_KEYS in .env.');
  }
});
