const test = require('node:test');
const assert = require('node:assert/strict');
const { parseExtractionResponse } = require('../src/utils/parseExtractionResponse');
const { stripCodeFences } = require('../src/utils/stripCodeFences');

test('parses a clean JSON model response', () => {
  const raw = JSON.stringify({
    documentType: 'Invoice',
    fields: [{ fieldName: 'invoiceNumber', fieldValue: 'INV-1001', confidence: 0.98 }],
    rawText: 'Invoice INV-1001'
  });
  const result = parseExtractionResponse(raw);
  assert.equal(result.documentType, 'Invoice');
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].fieldName, 'invoiceNumber');
  assert.equal(result.errorMessage, null);
});

test('strips markdown code fences before parsing', () => {
  const fenced = '```json\n{"documentType":"Contract","fields":[],"rawText":""}\n```';
  const result = parseExtractionResponse(fenced);
  assert.equal(result.documentType, 'Contract');
});

test('returns a safe error result on invalid JSON instead of throwing', () => {
  const result = parseExtractionResponse('not json at all');
  assert.equal(result.fields.length, 0);
  assert.ok(result.errorMessage);
});

test('stripCodeFences is a no-op on plain JSON', () => {
  const s = '{"a":1}';
  assert.equal(stripCodeFences(s), s);
});
