const test = require('node:test');
const assert = require('node:assert/strict');

process.env.API_KEYS = 'test-key-123';
const { apiKeyAuth } = require('../src/middleware/auth');

function mockReqRes(headerValue) {
  const req = { get: (name) => (name.toLowerCase() === 'x-api-key' ? headerValue : undefined) };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return { req, res };
}

test('rejects requests with no api key', () => {
  const { req, res } = mockReqRes(undefined);
  let nextCalled = false;
  apiKeyAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('rejects requests with a wrong api key', () => {
  const { req, res } = mockReqRes('nope');
  let nextCalled = false;
  apiKeyAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('allows requests with the configured api key', () => {
  const { req, res } = mockReqRes('test-key-123');
  let nextCalled = false;
  apiKeyAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
