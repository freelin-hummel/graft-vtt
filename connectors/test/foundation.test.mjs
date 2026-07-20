import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const scriptFiles = ['ConnectorEnvelope.js', 'ConnectorRegistry.js'];
const fixedUuid = '00000000-0000-4000-8000-000000000001';

const metadata = Object.freeze({
  connectorId: 'dndbeyond',
  connectorName: 'D&D Beyond',
  connectorVersion: '0.1.0',
  systemId: 'dnd5e',
  systemName: 'Dungeons & Dragons 5e',
  supportedProtocolVersions: [1],
  capabilities: {
    characters: false,
    statBlocks: false,
    rolls: false,
    liveUpdates: false,
  },
  vocabulary: {
    conditionsLabel: 'Conditions',
    rollTypesLabel: 'Roll Types',
    attributes: [],
  },
  transport: 'extension',
});

async function loadFoundation() {
  const sideEffects = {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
  };
  const context = vm.createContext({
    TextEncoder,
    crypto: { randomUUID: () => fixedUuid },
    addEventListener: () => sideEffects.addEventListener++,
    fetch: () => sideEffects.fetch++,
    setTimeout: () => sideEffects.setTimeout++,
    WebSocket: function WebSocket() {
      sideEffects.webSocket++;
    },
    XMLHttpRequest: function XMLHttpRequest() {
      sideEffects.xmlHttpRequest++;
    },
  });
  context.window = context;
  for (const file of scriptFiles) {
    vm.runInContext(await readFile(new URL(file, root), 'utf8'), context, { filename: file });
  }
  return { context, sideEffects };
}

function registerFake(context, extra = {}) {
  return context.GraftConnectorRegistry.register({
    id: 'dndbeyond',
    metadata,
    defaultEnabled: false,
    diagnostics: () => ({ state: 'inert' }),
    ...extra,
  });
}

test('constructs and strictly validates protocol-v1 connector.hello metadata', async () => {
  const { context } = await loadFoundation();
  const envelope = context.GraftConnectorEnvelope.createHelloEnvelope(metadata, {
    campaignId: 'campaign-1',
    characterId: 'character-1',
    sentAt: '2026-07-20T18:00:00.000Z',
  });
  assert.equal(envelope.protocolVersion, 1);
  assert.equal(envelope.messageId, fixedUuid);
  assert.equal(envelope.kind, 'connector.hello');
  assert.equal(envelope.payload.metadata.connectorId, 'dndbeyond');
  assert.equal(context.GraftConnectorEnvelope.assertHelloEnvelope(envelope), envelope);

  const unknownField = { ...envelope, unexpected: true };
  assert.throws(
    () => context.GraftConnectorEnvelope.assertHelloEnvelope(unknownField),
    /message\.unexpected: is not allowed/,
  );
  const offsetTimestamp = { ...envelope, sentAt: '2026-07-20T19:00:00+01:00' };
  assert.throws(
    () => context.GraftConnectorEnvelope.assertHelloEnvelope(offsetTimestamp),
    /UTC timestamp ending in Z/,
  );
  const impossibleDate = { ...envelope, sentAt: '2023-02-29T00:00:00Z' };
  assert.throws(
    () => context.GraftConnectorEnvelope.assertHelloEnvelope(impossibleDate),
    /UTC timestamp ending in Z/,
  );
  const leapDay = { ...envelope, sentAt: '2024-02-29T23:59:60Z' };
  assert.equal(context.GraftConnectorEnvelope.assertHelloEnvelope(leapDay), leapDay);
  const mismatchedMetadata = {
    ...envelope,
    payload: { metadata: { ...metadata, connectorId: 'other' } },
  };
  assert.throws(
    () => context.GraftConnectorEnvelope.assertHelloEnvelope(mismatchedMetadata),
    /must match metadata\.connectorId/,
  );
});

test('registry is disabled by default and exposes an immediate runtime kill switch', async () => {
  const { context } = await loadFoundation();
  const connector = registerFake(context);
  assert.equal(context.GraftConnectorRegistry.get('dndbeyond'), connector);
  assert.equal(context.GraftConnectorRegistry.isEnabled('dndbeyond'), false);
  assert.equal(context.GraftConnectorRegistry.setEnabled('dndbeyond', true), true);
  assert.equal(context.GraftConnectorRegistry.isEnabled('dndbeyond'), true);
  assert.equal(context.GraftConnectorRegistry.setEnabled('dndbeyond', false), false);
  assert.equal(context.GraftConnectorRegistry.isEnabled('dndbeyond'), false);
  assert.throws(() => registerFake(context), /already registered/);
});

test('diagnostics are deterministic metadata snapshots without runtime activity', async () => {
  const { context, sideEffects } = await loadFoundation();
  registerFake(context);
  const list = context.GraftConnectorRegistry.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].connectorId, 'dndbeyond');
  assert.equal(list[0].enabled, false);

  const diagnostics = context.GraftConnectorRegistry.diagnostics('dndbeyond');
  assert.equal(diagnostics.connectorId, 'dndbeyond');
  assert.equal(diagnostics.enabled, false);
  assert.equal(diagnostics.detail.state, 'inert');
  assert.deepEqual(sideEffects, {
    addEventListener: 0,
    fetch: 0,
    setTimeout: 0,
    webSocket: 0,
    xmlHttpRequest: 0,
  });
});
