import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const apiScriptPath = 'dndbeyond/api.js';

/** @type {string} */
const FIXTURE_REQUEST_URL = 'https://encounter-service.dndbeyond.com/v1/encounters/sample-encounter-id';

/**
 * Returns a base context object mocking browser globals with call tracking.
 * @param {{addEventListener: number, fetch: number, setTimeout: number, webSocket: number, xmlHttpRequest: number, storage: number}} tracker
 * @return {!Object}
 */
function baseCtx(tracker) {
  return {
    TextEncoder,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    addEventListener: function () { tracker.addEventListener++; },
    fetch: function () { tracker.fetch++; return Promise.resolve(); },
    setTimeout: function () { tracker.setTimeout++; },
    WebSocket: function WebSocket() { tracker.webSocket++; },
    XMLHttpRequest: function XMLHttpRequest() { tracker.xmlHttpRequest++; },
    localStorage: {
      getItem: function () { tracker.storage++; return null; },
      setItem: function () { tracker.storage++; },
      removeItem: function () { tracker.storage++; },
      clear: function () { tracker.storage++; },
      key: function () { tracker.storage++; return null; },
      get length() { return 0; },
    },
    sessionStorage: {
      getItem: function () { tracker.storage++; return null; },
      setItem: function () { tracker.storage++; },
      removeItem: function () { tracker.storage++; },
      clear: function () { tracker.storage++; },
      key: function () { tracker.storage++; return null; },
      get length() { return 0; },
    },
  };
}

/**
 * Loads the api.js script into a VM context with optional extra window properties.
 * @param {Object=} extraProps Additional window properties to assign
 * @return {Promise<{context: Object, sideEffects: Object}>}
 */
async function loadApi(extraProps) {
  const sideEffects = {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
    storage: 0,
  };
  const context = vm.createContext(Object.assign(baseCtx(sideEffects), extraProps || {}));
  context.window = context;
  const source = await readFile(new URL(apiScriptPath, root), 'utf8');
  vm.runInContext(source, context, { filename: apiScriptPath });
  return { context, sideEffects };
}

/* ------------------------------------------------------------------ */
/*  API surface                                                        */
/* ------------------------------------------------------------------ */

test('DndBeyondApi is frozen and exposes the expected five methods', async () => {
  const { context } = await loadApi();
  const api = context.DndBeyondApi;
  assert.ok(api);
  assert.ok(Object.isFrozen(api));
  assert.equal(typeof api.buildEncounterRequest, 'function');
  assert.equal(typeof api.normalizeEncounterResponse, 'function');
  assert.equal(typeof api.fetchEncounter, 'function');
  assert.equal(typeof api.recordCompatibilityCheck, 'function');
  assert.equal(typeof api.diagnostics, 'function');
});

test('DndBeyondApi is defined as non-enumerable on window', async () => {
  const { context } = await loadApi();
  const desc = Object.getOwnPropertyDescriptor(context, 'DndBeyondApi');
  assert.ok(desc);
  assert.equal(desc.enumerable, false);
  assert.equal(desc.writable, false);
  assert.equal(desc.configurable, true);
});

/* ------------------------------------------------------------------ */
/*  buildEncounterRequest                                              */
/* ------------------------------------------------------------------ */

test('buildEncounterRequest returns a frozen object with url for valid string id', async () => {
  const { context } = await loadApi();
  const result = context.DndBeyondApi.buildEncounterRequest('abc-123');
  assert.ok(result);
  assert.equal(typeof result, 'object');
  assert.ok(Object.isFrozen(result));
  assert.equal(result.url, 'https://encounter-service.dndbeyond.com/v1/encounters/abc-123');
});

test('buildEncounterRequest preserves exact legacy predicate and Error message for invalid types', async () => {
  const { context } = await loadApi();

  // null
  assert.throws(
    () => context.DndBeyondApi.buildEncounterRequest(null),
    { name: 'Error', message: 'Invalid id: null' },
  );

  // undefined
  assert.throws(
    () => context.DndBeyondApi.buildEncounterRequest(undefined),
    { name: 'Error', message: 'Invalid id: undefined' },
  );

  // number
  assert.throws(
    () => context.DndBeyondApi.buildEncounterRequest(42),
    { name: 'Error', message: 'Invalid id: 42' },
  );

  // boolean
  assert.throws(
    () => context.DndBeyondApi.buildEncounterRequest(true),
    { name: 'Error', message: 'Invalid id: true' },
  );

  // empty string (length 0 <= 1)
  assert.throws(
    () => context.DndBeyondApi.buildEncounterRequest(''),
    { name: 'Error', message: 'Invalid id: ' },
  );

  // single character (length 1 <= 1)
  assert.throws(
    () => context.DndBeyondApi.buildEncounterRequest('x'),
    { name: 'Error', message: 'Invalid id: x' },
  );

  // object
  assert.throws(
    () => context.DndBeyondApi.buildEncounterRequest({}),
    { name: 'Error', message: 'Invalid id: [object Object]' },
  );

  // array
  assert.throws(
    () => context.DndBeyondApi.buildEncounterRequest([]),
    { name: 'Error', message: 'Invalid id: ' },
  );
});

test('buildEncounterRequest accepts a valid two-character string', async () => {
  const { context } = await loadApi();
  const result = context.DndBeyondApi.buildEncounterRequest('ab');
  assert.equal(result.url, 'https://encounter-service.dndbeyond.com/v1/encounters/ab');
});

/* ------------------------------------------------------------------ */
/*  normalizeEncounterResponse                                         */
/* ------------------------------------------------------------------ */

test('normalizeEncounterResponse returns response.data preserving reference identity', async () => {
  const { context } = await loadApi();
  const dataObj = { id: 'test', value: 42 };
  const response = { data: dataObj, status: 200 };
  const result = context.DndBeyondApi.normalizeEncounterResponse(response);
  assert.equal(result, dataObj); // reference identity check
  assert.deepEqual(result, { id: 'test', value: 42 });
});

test('normalizeEncounterResponse returns undefined when response.data is missing', async () => {
  const { context } = await loadApi();
  const result = context.DndBeyondApi.normalizeEncounterResponse({});
  assert.equal(result, undefined);
});

test('normalizeEncounterResponse returns null when response.data is null', async () => {
  const { context } = await loadApi();
  const result = context.DndBeyondApi.normalizeEncounterResponse({ data: null });
  assert.equal(result, null);
});

/* ------------------------------------------------------------------ */
/*  fetchEncounter                                                     */
/* ------------------------------------------------------------------ */

test('fetchEncounter calls authenticatedFetch once with the correct URL and returns normalized data', async () => {
  const { context } = await loadApi();
  const dataObj = { id: 'enc-1', name: 'Goblin Ambush' };
  let callCount = 0;
  let capturedUrl = null;

  async function fakeFetch(url) {
    callCount++;
    capturedUrl = url;
    return { data: dataObj, status: 200 };
  }

  const result = await context.DndBeyondApi.fetchEncounter('enc-1', fakeFetch);
  assert.equal(callCount, 1);
  assert.equal(capturedUrl, 'https://encounter-service.dndbeyond.com/v1/encounters/enc-1');
  assert.equal(result, dataObj);
});

test('fetchEncounter preserves rejection identity (same error object propagates)', async () => {
  const { context } = await loadApi();
  const expectedError = new Error('Network failure');

  function fakeFetch(_url) {
    return Promise.reject(expectedError);
  }

  await assert.rejects(
    context.DndBeyondApi.fetchEncounter('enc-1', fakeFetch),
    (err) => err === expectedError,
  );
});

test('fetchEncounter throws on invalid id before calling authenticatedFetch', async () => {
  const { context } = await loadApi();
  let callCount = 0;

  function fakeFetch(_url) {
    callCount++;
    return Promise.resolve({ data: {} });
  }

  assert.throws(
    () => context.DndBeyondApi.fetchEncounter(null, fakeFetch),
    { name: 'Error', message: 'Invalid id: null' },
  );
  assert.equal(callCount, 0);
});

test('fetchEncounter passes the authenticatedFetch rejection type unmodified', async () => {
  const { context } = await loadApi();

  class CustomError extends Error {
    constructor() { super('custom'); this.custom = true; }
  }

  function fakeFetch(_url) {
    return Promise.reject(new CustomError());
  }

  await assert.rejects(
    context.DndBeyondApi.fetchEncounter('valid-id', fakeFetch),
    CustomError,
  );
});

/* ------------------------------------------------------------------ */
/*  recordCompatibilityCheck & diagnostics                             */
/* ------------------------------------------------------------------ */

test('diagnostics initial state is zero counts and frozen', async () => {
  const { context } = await loadApi();
  const diag = context.DndBeyondApi.diagnostics();
  assert.ok(Object.isFrozen(diag));
  assert.deepEqual(JSON.parse(JSON.stringify(diag)), {
    totalChecks: 0,
    requestMatches: 0,
    responseMatches: 0,
    mismatches: 0,
  });
});

test('recordCompatibilityCheck(true, true) increments only matches', async () => {
  const { context } = await loadApi();
  context.DndBeyondApi.recordCompatibilityCheck(true, true);
  const diag = context.DndBeyondApi.diagnostics();
  assert.deepEqual(JSON.parse(JSON.stringify(diag)), {
    totalChecks: 1,
    requestMatches: 1,
    responseMatches: 1,
    mismatches: 0,
  });
});

test('recordCompatibilityCheck(true, false) increments mismatches on response', async () => {
  const { context } = await loadApi();
  context.DndBeyondApi.recordCompatibilityCheck(true, false);
  const diag = context.DndBeyondApi.diagnostics();
  assert.deepEqual(JSON.parse(JSON.stringify(diag)), {
    totalChecks: 1,
    requestMatches: 1,
    responseMatches: 0,
    mismatches: 1,
  });
});

test('recordCompatibilityCheck(false, true) increments mismatches on request', async () => {
  const { context } = await loadApi();
  context.DndBeyondApi.recordCompatibilityCheck(false, true);
  const diag = context.DndBeyondApi.diagnostics();
  assert.deepEqual(JSON.parse(JSON.stringify(diag)), {
    totalChecks: 1,
    requestMatches: 0,
    responseMatches: 1,
    mismatches: 1,
  });
});

test('recordCompatibilityCheck(false, false) increments mismatches on both', async () => {
  const { context } = await loadApi();
  context.DndBeyondApi.recordCompatibilityCheck(false, false);
  const diag = context.DndBeyondApi.diagnostics();
  assert.deepEqual(JSON.parse(JSON.stringify(diag)), {
    totalChecks: 1,
    requestMatches: 0,
    responseMatches: 0,
    mismatches: 1,
  });
});

test('multiple recordCompatibilityCheck calls accumulate correctly', async () => {
  const { context } = await loadApi();
  context.DndBeyondApi.recordCompatibilityCheck(true, true);
  context.DndBeyondApi.recordCompatibilityCheck(true, false);
  context.DndBeyondApi.recordCompatibilityCheck(false, true);
  context.DndBeyondApi.recordCompatibilityCheck(false, false);
  const diag = context.DndBeyondApi.diagnostics();
  assert.deepEqual(JSON.parse(JSON.stringify(diag)), {
    totalChecks: 4,
    requestMatches: 2,
    responseMatches: 2,
    mismatches: 3,
  });
});

test('diagnostics returns a new frozen object each call (no retained reference)', async () => {
  const { context } = await loadApi();
  const diag1 = context.DndBeyondApi.diagnostics();
  context.DndBeyondApi.recordCompatibilityCheck(true, true);
  const diag2 = context.DndBeyondApi.diagnostics();
  assert.notEqual(diag1, diag2); // different object
  assert.deepEqual(JSON.parse(JSON.stringify(diag1)), {
    totalChecks: 0,
    requestMatches: 0,
    responseMatches: 0,
    mismatches: 0,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(diag2)), {
    totalChecks: 1,
    requestMatches: 1,
    responseMatches: 1,
    mismatches: 0,
  });
});

test('diagnostics never contains IDs, URLs, bodies, tokens, or character/campaign fields', async () => {
  const { context } = await loadApi();
  context.DndBeyondApi.recordCompatibilityCheck(true, false);
  const diag = context.DndBeyondApi.diagnostics();
  const keys = Object.keys(diag);
  const forbidden = ['id', 'url', 'body', 'token', 'character', 'campaign', 'encounterId', 'data'];
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    for (const term of forbidden) {
      assert.ok(!lowerKey.includes(term), `diagnostics key "${key}" contains forbidden term "${term}"`);
    }
  }
});

/* ------------------------------------------------------------------ */
/*  Fixture integration                                                */
/* ------------------------------------------------------------------ */

test('fixture: buildEncounterRequest with fixture id produces correct URL', async () => {
  const { context } = await loadApi();
  const requestFixture = JSON.parse(
    await readFile(new URL('fixtures/fetch-encounter.request.json', import.meta.url), 'utf8'),
  );
  const result = context.DndBeyondApi.buildEncounterRequest(requestFixture.id);
  assert.equal(result.url, requestFixture.url);
});

test('fixture: normalizeEncounterResponse with fixture response returns expected data', async () => {
  const { context } = await loadApi();
  const responseFixture = JSON.parse(
    await readFile(new URL('fixtures/fetch-encounter.response.json', import.meta.url), 'utf8'),
  );
  const result = context.DndBeyondApi.normalizeEncounterResponse(responseFixture);
  assert.deepEqual(result, responseFixture.data);
});

test('fixture: fetchEncounter integration with fixture data', async () => {
  const { context } = await loadApi();
  const requestFixture = JSON.parse(
    await readFile(new URL('fixtures/fetch-encounter.request.json', import.meta.url), 'utf8'),
  );
  const responseFixture = JSON.parse(
    await readFile(new URL('fixtures/fetch-encounter.response.json', import.meta.url), 'utf8'),
  );

  let callCount = 0;
  let capturedUrl = null;

  async function fakeFetch(url) {
    callCount++;
    capturedUrl = url;
    return responseFixture;
  }

  const result = await context.DndBeyondApi.fetchEncounter(requestFixture.id, fakeFetch);
  assert.equal(callCount, 1);
  assert.equal(capturedUrl, requestFixture.url);
  assert.deepEqual(result, responseFixture.data);
});

/* ------------------------------------------------------------------ */
/*  Side-effect isolation                                              */
/* ------------------------------------------------------------------ */

test('loading api.js produces zero side effects', async () => {
  const { context, sideEffects } = await loadApi();
  assert.deepEqual(sideEffects, {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
    storage: 0,
  });
});

test('all API methods produce zero side effects', async () => {
  const { context, sideEffects } = await loadApi();

  // buildEncounterRequest
  context.DndBeyondApi.buildEncounterRequest('test-id');
  assert.deepEqual(sideEffects, {
    addEventListener: 0, fetch: 0, setTimeout: 0, webSocket: 0, xmlHttpRequest: 0, storage: 0,
  });

  // normalizeEncounterResponse
  context.DndBeyondApi.normalizeEncounterResponse({ data: {} });
  assert.deepEqual(sideEffects, {
    addEventListener: 0, fetch: 0, setTimeout: 0, webSocket: 0, xmlHttpRequest: 0, storage: 0,
  });

  // recordCompatibilityCheck
  context.DndBeyondApi.recordCompatibilityCheck(true, true);
  assert.deepEqual(sideEffects, {
    addEventListener: 0, fetch: 0, setTimeout: 0, webSocket: 0, xmlHttpRequest: 0, storage: 0,
  });

  // diagnostics
  context.DndBeyondApi.diagnostics();
  assert.deepEqual(sideEffects, {
    addEventListener: 0, fetch: 0, setTimeout: 0, webSocket: 0, xmlHttpRequest: 0, storage: 0,
  });

  // fetchEncounter with no-op authenticatedFetch
  await context.DndBeyondApi.fetchEncounter('test-id', async function (_url) {
    // The tracker counts calls to window.fetch, but our fake receives no calls to window globals.
    return { data: {} };
  });
  assert.deepEqual(sideEffects, {
    addEventListener: 0, fetch: 0, setTimeout: 0, webSocket: 0, xmlHttpRequest: 0, storage: 0,
  });
});
