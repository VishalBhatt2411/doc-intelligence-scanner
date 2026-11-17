const test = require('node:test');
const assert = require('node:assert/strict');

const webhookConnector = require('../src/connectors/webhookConnector');

test('submit posts fieldValues as JSON to the target URL with auth header', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => 'ok' };
  };

  try {
    const result = await webhookConnector.submit({
      targetUrl: 'https://example.com/inbound-webhook',
      authHeader: 'Bearer abc123',
      fieldValues: { invoiceNumber: 'INV-1001' }
    });

    assert.equal(result.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.com/inbound-webhook');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer abc123');
    assert.deepEqual(JSON.parse(calls[0].init.body), { fieldValues: { invoiceNumber: 'INV-1001' } });
  } finally {
    global.fetch = originalFetch;
  }
});

test('submit throws a safe error when the destination responds with an error status', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });

  try {
    await assert.rejects(
      () => webhookConnector.submit({ targetUrl: 'https://example.com/hook', fieldValues: { a: '1' } }),
      /HTTP 500/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('submit rejects an unsafe target URL before ever calling fetch', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => '' };
  };

  try {
    await assert.rejects(() => webhookConnector.submit({ targetUrl: 'https://localhost/hook', fieldValues: {} }));
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});
