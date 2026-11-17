const config = require('../config');
const gemini = require('./geminiProvider');
const openai = require('./openaiProvider');
const claude = require('./claudeProvider');

const PROVIDERS = { gemini, openai, claude };

// Swapping AI vendors is a one-line env var change (AI_PROVIDER), never a code
// change - the rest of the service only depends on the {documentType, fields,
// rawText, errorMessage} shape, matching how DocumentExtractionResult.cls
// decouples the Salesforce LWC from whichever vendor answered.
function getProvider(name) {
  const provider = PROVIDERS[(name || config.aiProvider || '').toLowerCase()];
  if (!provider) {
    throw new Error(`Unknown AI_PROVIDER "${name}". Supported: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

module.exports = { getProvider, PROVIDERS };
