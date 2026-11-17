const config = require('../config');
const { parseExtractionResponse } = require('../utils/parseExtractionResponse');
const { ProviderConfigError, ProviderCallError } = require('./errors');

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

async function extract({ prompt, base64Data, mimeType }) {
  if (!config.claude.apiKey) {
    throw new ProviderConfigError('ANTHROPIC_API_KEY is not set.');
  }

  const content = [{ type: 'text', text: prompt }];
  if (base64Data) {
    const isPdf = mimeType === 'application/pdf';
    content.push({
      type: isPdf ? 'document' : 'image',
      source: { type: 'base64', media_type: mimeType, data: base64Data }
    });
  }

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.claude.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.claude.model,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content }]
    })
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body) {
    console.error('Claude error', res.status, body);
    throw new ProviderCallError(`AI provider returned HTTP ${res.status}.`);
  }

  const modelText = (body.content || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (!modelText) {
    console.error('Claude returned no usable content', body);
    throw new ProviderCallError('AI provider returned no content.');
  }

  return parseExtractionResponse(modelText, null);
}

module.exports = { extract };
