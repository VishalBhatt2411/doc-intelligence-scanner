const test = require('node:test');
const assert = require('node:assert/strict');

const { assertSafeDestinationUrl } = require('../src/connectors/urlSafety');
const { assertSalesforceInstanceUrl } = require('../src/connectors/salesforceConnector');
const { resolveAuthHeaders, credentialFieldsFor } = require('../src/connectors/authStrategies');
const registry = require('../src/connectors/registry');

test('urlSafety rejects non-https URLs', () => {
  assert.throws(() => assertSafeDestinationUrl('http://example.com/hook'), /https/);
});

test('urlSafety rejects loopback/private hosts', () => {
  assert.throws(() => assertSafeDestinationUrl('https://127.0.0.1/hook'), /private\/loopback/);
  assert.throws(() => assertSafeDestinationUrl('https://localhost/hook'), /private\/loopback/);
  assert.throws(() => assertSafeDestinationUrl('https://192.168.1.5/hook'), /private\/loopback/);
  assert.throws(() => assertSafeDestinationUrl('https://10.0.0.5/hook'), /private\/loopback/);
});

test('urlSafety accepts a normal public https URL', () => {
  const url = assertSafeDestinationUrl('https://example.com/inbound-webhook');
  assert.equal(url.hostname, 'example.com');
});

test('urlSafety rejects garbage input', () => {
  assert.throws(() => assertSafeDestinationUrl('not a url'), /valid URL/);
});

test('salesforce connector only accepts salesforce/force.com domains', () => {
  assert.throws(() => assertSalesforceInstanceUrl('https://evil.example.com'), /salesforce\.com or \*\.force\.com/);
  assert.throws(() => assertSalesforceInstanceUrl('http://myorg.my.salesforce.com'), /https/);
});

test('salesforce connector accepts a real-looking instance URL', () => {
  const origin = assertSalesforceInstanceUrl('https://myorg.my.salesforce.com');
  assert.equal(origin, 'https://myorg.my.salesforce.com');
});

// ---- Dynamic auth strategies -----------------------------------------------

test('bearer auth strategy builds an Authorization header', async () => {
  const headers = await resolveAuthHeaders('bearer', { token: 'abc123' });
  assert.deepEqual(headers, { Authorization: 'Bearer abc123' });
});

test('bearer auth strategy rejects missing token', async () => {
  await assert.rejects(() => resolveAuthHeaders('bearer', {}), /Missing credential field\(s\): token/);
});

test('apiKeyHeader auth strategy builds a custom header', async () => {
  const headers = await resolveAuthHeaders('apiKeyHeader', { headerName: 'X-Api-Key', value: 'k-1' });
  assert.deepEqual(headers, { 'X-Api-Key': 'k-1' });
});

test('basic auth strategy base64-encodes username:password', async () => {
  const headers = await resolveAuthHeaders('basic', { username: 'u', password: 'p' });
  assert.equal(headers.Authorization, `Basic ${Buffer.from('u:p').toString('base64')}`);
});

test('resolveAuthHeaders rejects an unknown auth type', async () => {
  await assert.rejects(() => resolveAuthHeaders('carrier-pigeon', {}), /Unknown auth type/);
});

test('credentialFieldsFor returns the required fields for a known strategy', () => {
  assert.deepEqual(credentialFieldsFor('bearer'), ['token']);
  assert.deepEqual(credentialFieldsFor('nope'), []);
});

// ---- Connector registry -----------------------------------------------------

test('registry lists salesforce and hubspot with their credential fields, no secrets leaked as required-value hints', () => {
  const connectors = registry.list();
  const ids = connectors.map((c) => c.id);
  assert.ok(ids.includes('salesforce'));
  assert.ok(ids.includes('hubspot'));

  const hubspot = connectors.find((c) => c.id === 'hubspot');
  assert.equal(hubspot.authType, 'bearer');
  assert.deepEqual(hubspot.credentialFields.map((f) => f.name), ['token']);
});

test('registry.get resolves a connector module with listObjects/describeFields/createRecord', () => {
  const hubspot = registry.get('hubspot');
  assert.ok(hubspot);
  assert.equal(typeof hubspot.module.listObjects, 'function');
  assert.equal(typeof hubspot.module.describeFields, 'function');
  assert.equal(typeof hubspot.module.createRecord, 'function');
  assert.equal(hubspot.hostField, null);
});

test('registry.get returns undefined for an unknown connector id', () => {
  assert.equal(registry.get('does-not-exist'), undefined);
});
