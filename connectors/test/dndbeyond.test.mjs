import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const scriptFiles = [
  'ConnectorEnvelope.js',
  'ConnectorRegistry.js',
  'dndbeyond/DndBeyondConnector.js',
];
const FIXED_UUID = '00000000-0000-4000-8000-000000000001';

/**
 * Returns a base context object mocking browser globals with call tracking.
 * @param {Object} tracker
 * @return {!Object}
 */
function baseCtx(tracker) {
  return {
    TextEncoder,
    crypto: { randomUUID: () => FIXED_UUID },
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
 * Loads the three runtime scripts into a VM context with optional window properties.
 * @param {Object=} extraProps Additional window properties
 * @return {Promise<{context: Object, sideEffects: Object}>}
 */
async function loadRuntime(extraProps) {
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
  for (const file of scriptFiles) {
    vm.runInContext(await readFile(new URL(file, root), 'utf8'), context, {
      filename: file,
    });
  }
  return { context, sideEffects };
}

/* ------------------------------------------------------------------ */
/*  Registration & default state                                       */
/* ------------------------------------------------------------------ */

test('dndbeyond connector is auto-registered and default-disabled', async () => {
  const { context } = await loadRuntime();
  const connector = context.GraftConnectorRegistry.get('dndbeyond');
  assert.ok(connector);
  assert.equal(connector.id, 'dndbeyond');
  assert.equal(context.GraftConnectorRegistry.isEnabled('dndbeyond'), false);
});

test('attempting to register a second dndbeyond connector throws', async () => {
  const { context } = await loadRuntime();
  const dup = {
    id: 'dndbeyond',
    metadata: context.DndBeyondConnector.metadata,
    defaultEnabled: false,
  };
  assert.throws(
    () => context.GraftConnectorRegistry.register(dup),
    /already registered/,
  );
});

/* ------------------------------------------------------------------ */
/*  Metadata validation                                                */
/* ------------------------------------------------------------------ */

test('connector metadata is frozen and validates through assertMetadata', async () => {
  const { context } = await loadRuntime();
  const meta = context.DndBeyondConnector.metadata;
  assert.ok(Object.isFrozen(meta));
  assert.ok(Object.isFrozen(meta.capabilities));
  // must not throw
  context.GraftConnectorEnvelope.assertMetadata(meta, 'metadata');
});

test('connector metadata reports all capabilities false', async () => {
  const { context } = await loadRuntime();
  const meta = context.DndBeyondConnector.metadata;
  assert.equal(meta.capabilities.characters, false);
  assert.equal(meta.capabilities.liveUpdates, false);
  assert.equal(meta.capabilities.rolls, false);
  assert.equal(meta.capabilities.statBlocks, false);
});

/* ------------------------------------------------------------------ */
/*  Hello envelope                                                     */
/* ------------------------------------------------------------------ */

test('createHelloEnvelope returns a valid hello envelope', async () => {
  const { context } = await loadRuntime();
  const envelope = context.DndBeyondConnector.createHelloEnvelope();
  assert.equal(envelope.kind, 'connector.hello');
  assert.equal(envelope.protocolVersion, 1);
  assert.equal(envelope.connectorId, 'dndbeyond');
  assert.equal(envelope.systemId, 'dnd5e');
  assert.equal(envelope.payload.metadata.connectorId, 'dndbeyond');
  // Full frozen validation via assertHelloEnvelope
  assert.equal(
    context.GraftConnectorEnvelope.assertHelloEnvelope(envelope),
    envelope,
  );
});

test('createHelloEnvelope accepts campaign and character context', async () => {
  const { context } = await loadRuntime();
  const envelope = context.DndBeyondConnector.createHelloEnvelope({
    campaignId: 'camp-abc-123',
    characterId: 'char-xyz-789',
  });
  assert.equal(envelope.campaignId, 'camp-abc-123');
  assert.equal(envelope.characterId, 'char-xyz-789');
  context.GraftConnectorEnvelope.assertHelloEnvelope(envelope);
});

test('connector installation fails immediately if GraftConnectorEnvelope is absent', async () => {
  const sideEffects = {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
    storage: 0,
  };
  const context = vm.createContext(
    Object.assign(baseCtx(sideEffects), { TextEncoder }),
  );
  context.window = context;
  // Only load the connector — not the envelope or registry.
  const source = await readFile(
    new URL('../dndbeyond/DndBeyondConnector.js', import.meta.url),
    'utf8',
  );
  assert.throws(
    () => vm.runInContext(source, context, { filename: 'DndBeyondConnector.js' }),
    /GraftConnectorEnvelope is not loaded/,
  );
});

/* ------------------------------------------------------------------ */
/*  Diagnostics — happy path                                           */
/* ------------------------------------------------------------------ */

test('diagnostics reads campaign, player, DM, and MB readiness', async () => {
  const { context } = await loadRuntime({
    gameId: 'camp-42',
    PLAYER_ID: 'player-99',
    PLAYER_NAME: 'Alice',
    DM: false,
    MB: { ready: true },
  });
  const diag = JSON.parse(JSON.stringify(context.DndBeyondConnector.diagnostics()));
  assert.deepEqual(diag, {
    campaignId: 'camp-42',
    character: { id: 'player-99', name: 'Alice' },
    role: 'player',
    messageBrokerAvailable: true,
  });
});

test('diagnostics DM true is reflected', async () => {
  const { context } = await loadRuntime({
    DM: true,
  });
  const diag = context.DndBeyondConnector.diagnostics();
  assert.equal(diag.role, 'dm');
});

/* ------------------------------------------------------------------ */
/*  Diagnostics — edge cases / invalid values                          */
/* ------------------------------------------------------------------ */

test('diagnostics omits invalid identifiers instead of coercing', async () => {
  const { context } = await loadRuntime({
    gameId: 'not valid!$#',   // contains invalid chars
    PLAYER_ID: '',            // empty string
    PLAYER_NAME: 'Bob',
    DM: true,
  });
  const diag = context.DndBeyondConnector.diagnostics();
  assert.equal(diag.campaignId, undefined);
  assert.equal(diag.character.id, undefined);
  assert.equal(diag.character.name, 'Bob');
  assert.equal(diag.role, 'dm');
});

test('diagnostics reports legacy MessageBroker availability even before startup', async () => {
  const { context } = await loadRuntime();
  const diag = JSON.parse(JSON.stringify(context.DndBeyondConnector.diagnostics()));
  assert.deepEqual(diag, { messageBrokerAvailable: false });
});

test('diagnostics omits DM when it is not a boolean', async () => {
  const { context } = await loadRuntime({
    DM: 'yes',
  });
  const diag = context.DndBeyondConnector.diagnostics();
  assert.equal(diag.role, undefined);
});

test('diagnostics reports MessageBroker unavailable when MB is absent', async () => {
  const { context } = await loadRuntime({
    gameId: 'camp-1',
  });
  const diag = context.DndBeyondConnector.diagnostics();
  assert.equal(diag.messageBrokerAvailable, false);
  assert.equal(diag.campaignId, 'camp-1');
});

test('diagnostics reports MessageBroker available without retaining it', async () => {
  const { context } = await loadRuntime({
    MB: { foo: 'bar' },
  });
  const diag = context.DndBeyondConnector.diagnostics();
  assert.equal(diag.messageBrokerAvailable, true);
  assert.equal('MB' in diag, false);
});

test('diagnostics omits player state when names and identifiers are empty', async () => {
  const { context } = await loadRuntime({
    PLAYER_NAME: '',
  });
  const diag = context.DndBeyondConnector.diagnostics();
  assert.equal(diag.character, undefined);
});

/* ------------------------------------------------------------------ */
/*  Registry-level diagnostics wrapper                                 */
/* ------------------------------------------------------------------ */

test('registry diagnostics returns connector detail', async () => {
  const { context } = await loadRuntime({
    gameId: 'camp-x',
    PLAYER_NAME: 'Dana',
  });
  const regDiag = context.GraftConnectorRegistry.diagnostics('dndbeyond');
  assert.equal(regDiag.connectorId, 'dndbeyond');
  assert.equal(regDiag.enabled, false);
  assert.ok(regDiag.metadata);
  assert.equal(regDiag.detail.campaignId, 'camp-x');
  assert.equal(regDiag.detail.character.name, 'Dana');
});

/* ------------------------------------------------------------------ */
/*  Side-effect isolation — zero network, timers, listeners, storage   */
/* ------------------------------------------------------------------ */

test('zero side effects during load, diagnostics, enabling, and hello creation', async () => {
  const { context, sideEffects } = await loadRuntime({
    gameId: 'camp-1',
    PLAYER_ID: 'player-1',
    PLAYER_NAME: 'Charlie',
    DM: true,
    MB: { ready: false },
  });

  // After load — all zeros
  assert.deepEqual(sideEffects, {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
    storage: 0,
  });

  const connector = context.DndBeyondConnector;

  // diagnostics
  connector.diagnostics();
  assert.deepEqual(sideEffects, {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
    storage: 0,
  });

  // enabling
  context.GraftConnectorRegistry.setEnabled('dndbeyond', true);
  assert.equal(context.GraftConnectorRegistry.isEnabled('dndbeyond'), true);
  assert.deepEqual(sideEffects, {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
    storage: 0,
  });

  // hello creation
  connector.createHelloEnvelope();
  assert.deepEqual(sideEffects, {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
    storage: 0,
  });

  // disable again for clean state
  context.GraftConnectorRegistry.setEnabled('dndbeyond', false);
  assert.deepEqual(sideEffects, {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
    storage: 0,
  });
});
