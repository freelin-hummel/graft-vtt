import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const repo = new URL('../../', import.meta.url);
const connectorRoot = new URL('../', import.meta.url);
const fixedUuid = '00000000-0000-4000-8000-000000000001';
const encounterId = 'encounter-42';
const expectedUrl = `https://encounter-service.dndbeyond.com/v1/encounters/${encounterId}`;

async function source(url) {
  return readFile(url, 'utf8');
}

async function createRuntime({ includeApi = true } = {}) {
  const debugCalls = [];
  const context = vm.createContext({
    TextEncoder,
    crypto: { randomUUID: () => fixedUuid },
    console: {
      debug: (...args) => debugCalls.push(args),
      error: () => {},
      log: () => {},
      warn: () => {},
    },
    fetch: () => {
      throw new Error('unexpected direct fetch');
    },
    find_game_id: () => 'campaign-1',
    is_encounters_page: () => false,
    localStorage: { getItem: () => null, setItem: () => {} },
    mydebounce: (callback) => callback,
    navigator: { userAgent: 'test' },
    noLogError: (error) => error,
    showError: () => {},
  });
  context.window = context;

  vm.runInContext(
    `${await source(new URL('DDBApi.js', repo))}\nwindow.__DDBApi = DDBApi;`,
    context,
    { filename: 'DDBApi.js' },
  );
  for (const file of ['ConnectorEnvelope.js', 'ConnectorRegistry.js']) {
    vm.runInContext(await source(new URL(file, connectorRoot)), context, { filename: file });
  }
  if (includeApi) {
    vm.runInContext(await source(new URL('dndbeyond/api.js', connectorRoot)), context, {
      filename: 'api.js',
    });
  }
  vm.runInContext(
    await source(new URL('dndbeyond/DndBeyondConnector.js', connectorRoot)),
    context,
    { filename: 'DndBeyondConnector.js' },
  );

  return { context, debugCalls };
}

function installTransport(context, implementation) {
  const urls = [];
  context.__DDBApi.fetchJsonWithToken = async (url) => {
    urls.push(url);
    return implementation(url);
  };
  return urls;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('adapter-off keeps the exact legacy URL, result reference, log, and zero diagnostics', async () => {
  const { context, debugCalls } = await createRuntime();
  const response = { data: { id: encounterId, name: 'Sanitized Encounter' } };
  const urls = installTransport(context, () => response);

  const result = await context.__DDBApi.fetchEncounter(encounterId);
  assert.equal(result, response.data);
  assert.deepEqual(urls, [expectedUrl]);
  assert.equal(debugCalls.length, 1);
  assert.equal(debugCalls[0][0], 'DDBApi.fetchEncounter response');
  assert.equal(debugCalls[0][1], response);
  assert.deepEqual(plain(context.DndBeyondApi.diagnostics()), {
    totalChecks: 0,
    requestMatches: 0,
    responseMatches: 0,
    mismatches: 0,
  });
});

test('adapter-on delegates once while preserving URL, result reference, and log', async () => {
  const { context, debugCalls } = await createRuntime();
  const response = { data: { id: encounterId, name: 'Sanitized Encounter' } };
  const urls = installTransport(context, () => response);
  context.GraftConnectorRegistry.setEnabled('dndbeyond', true);

  const result = await context.__DDBApi.fetchEncounter(encounterId);
  assert.equal(result, response.data);
  assert.deepEqual(urls, [expectedUrl]);
  assert.equal(debugCalls.length, 1);
  assert.equal(debugCalls[0][0], 'DDBApi.fetchEncounter response');
  assert.equal(debugCalls[0][1], response);
  assert.deepEqual(plain(context.DndBeyondApi.diagnostics()), {
    totalChecks: 1,
    requestMatches: 1,
    responseMatches: 1,
    mismatches: 0,
  });
});

test('adapter diagnostics expose counters through the connector without sensitive values', async () => {
  const { context } = await createRuntime();
  const response = { data: { id: encounterId, secret: 'must-not-be-retained' } };
  installTransport(context, () => response);
  context.GraftConnectorRegistry.setEnabled('dndbeyond', true);
  await context.__DDBApi.fetchEncounter(encounterId);

  const diagnostics = plain(context.GraftConnectorRegistry.diagnostics('dndbeyond'));
  assert.deepEqual(diagnostics.detail.apiDiagnostics, {
    totalChecks: 1,
    requestMatches: 1,
    responseMatches: 1,
    mismatches: 0,
  });
  const serialized = JSON.stringify(diagnostics.detail.apiDiagnostics);
  for (const forbidden of [encounterId, expectedUrl, 'must-not-be-retained', 'token']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('enabled and disabled paths preserve invalid-id errors before transport', async () => {
  for (const enabled of [false, true]) {
    const { context } = await createRuntime();
    let transportCalls = 0;
    installTransport(context, () => {
      transportCalls++;
      return { data: {} };
    });
    context.GraftConnectorRegistry.setEnabled('dndbeyond', enabled);
    await assert.rejects(context.__DDBApi.fetchEncounter('x'), {
      message: 'Invalid id: x',
    });
    assert.equal(transportCalls, 0);
  }
});

test('enabled and disabled paths preserve transport rejection identity', async () => {
  for (const enabled of [false, true]) {
    const { context } = await createRuntime();
    const expectedError = new Error(`transport-${enabled}`);
    const urls = installTransport(context, () => Promise.reject(expectedError));
    context.GraftConnectorRegistry.setEnabled('dndbeyond', enabled);
    await assert.rejects(
      context.__DDBApi.fetchEncounter(encounterId),
      (error) => error === expectedError,
    );
    assert.deepEqual(urls, [expectedUrl]);
  }
});

test('missing API boundary safely retains the legacy path even when connector is enabled', async () => {
  const { context } = await createRuntime({ includeApi: false });
  const response = { data: { id: encounterId } };
  const urls = installTransport(context, () => response);
  context.GraftConnectorRegistry.setEnabled('dndbeyond', true);

  const result = await context.__DDBApi.fetchEncounter(encounterId);
  assert.equal(result, response.data);
  assert.deepEqual(urls, [expectedUrl]);
});
