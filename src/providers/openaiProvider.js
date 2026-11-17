const config = require('../config');
const { parseExtractionResponse } = require('../utils/parseExtractionResponse');
const { ProviderConfigError, ProviderCallError } = require('./errors');

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Note: Chat Completions image_url only accepts raster images (png/jpeg/webp/gif).
// For PDF input with OpenAI, route through the Files + Responses API instead -
// this provider is intended for image-based documents.
async function extract({ prompt, base64Data, mimeType }) {
  if (!config.openai.apiKey) {
    throw new ProviderConfigError('OPENAI_API_KEY is not set.');
  }

  const content = [{ type: 'text', text: prompt }];
  if (base64Data) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType || 'application/octet-stream'};base64,${base64Data}` }
    });
  }

  const res = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }]
    })
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body) {
    console.error('OpenAI error', res.status, body);
    throw new ProviderCallError(`AI provider returned HTTP ${res.status}.`);
  }

  const modelText = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  if (!modelText) {
    console.error('OpenAI returned no usable content', body);
    throw new ProviderCallError('AI provider returned no content.');
  }

  return parseExtractionResponse(modelText, null);
}

module.exports = { extract };
