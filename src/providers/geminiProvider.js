const config = require('../config');
const { parseExtractionResponse } = require('../utils/parseExtractionResponse');
const { ProviderConfigError, ProviderCallError } = require('./errors');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com';

// Mirrors DocumentExtractionService.callModel() for Gemini, but talks to the
// public Generative Language API directly with an API-key header instead of a
// Salesforce Named Credential.
async function extract({ prompt, base64Data, mimeType }) {
  if (!config.gemini.apiKey) {
    throw new ProviderConfigError('GEMINI_API_KEY is not set.');
  }

  const parts = [{ text: prompt }];
  if (base64Data) {
    parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
  }

  const requestBody = {
    contents: [{ parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  };

  const url = `${GEMINI_ENDPOINT}/v1beta/models/${config.gemini.model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.gemini.apiKey
    },
    body: JSON.stringify(requestBody)
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body) {
    // Do not forward the raw upstream body to callers - log it server-side only.
    console.error('Gemini error', res.status, body);
    throw new ProviderCallError(`AI provider returned HTTP ${res.status}.`);
  }

  const candidate = body.candidates && body.candidates[0];
  const responseParts = candidate && candidate.content && candidate.content.parts;
  if (!responseParts || !responseParts.length) {
    console.error('Gemini returned no usable parts', body);
    throw new ProviderCallError('AI provider returned no content.');
  }

  const modelText = responseParts
    .filter((p) => p && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');

  return parseExtractionResponse(modelText, null);
}

module.exports = { extract };
