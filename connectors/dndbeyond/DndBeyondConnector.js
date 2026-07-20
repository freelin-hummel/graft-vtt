/**
 * D&D Beyond Connector — Phase 2 scaffold.
 * @fileoverview Plain browser IIFE; no imports, build, or dependencies.
 * Installs DndBeyondConnector on globalThis and auto-registers with
 * GraftConnectorRegistry when present. All capabilities false for this
 * no-op phase.
 */
(function installDndBeyondConnector(global) {
  'use strict';

  var win = global;
  var envelopeApi = global.GraftConnectorEnvelope;
  var registry = global.GraftConnectorRegistry;
  if (!envelopeApi) throw new Error('GraftConnectorEnvelope is not loaded');
  if (!registry) throw new Error('GraftConnectorRegistry is not loaded');

  /** @const {!RegExp} */
  var IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

  /** @const {!Object} */
  var metadata = Object.freeze({
    connectorId: 'dndbeyond',
    connectorName: 'D&D Beyond',
    connectorVersion: '0.1.0',
    systemId: 'dnd5e',
    systemName: 'Dungeons & Dragons 5e',
    supportedProtocolVersions: Object.freeze([1]),
    capabilities: Object.freeze({
      characters: false,
      liveUpdates: false,
      rolls: false,
      statBlocks: false,
    }),
    vocabulary: Object.freeze({
      attributes: Object.freeze([]),
      conditionsLabel: 'Conditions',
      rollTypesLabel: 'Roll Types',
    }),
    transport: 'extension',
  });

  /**
   * Validates a protocol identifier per Graft rules.
   * @param {*} value
   * @return {boolean}
   */
  function isValidIdentifier(value) {
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 128 &&
      IDENTIFIER_RE.test(value)
    );
  }

  /**
   * Returns a clean diagnostic snapshot reading only current window state.
   * Never retains raw objects, transmits, mutates globals, reads storage,
   * installs listeners/timers, or calls network.
   * @return {!Object<string, *>}
   */
  function diagnostics() {
    var snapshot = {};
    var character = {};

    var gameId = win.gameId;
    if (isValidIdentifier(gameId)) snapshot.campaignId = gameId;

    var playerId = win.PLAYER_ID;
    if (isValidIdentifier(playerId)) character.id = playerId;

    var playerName = win.PLAYER_NAME;
    if (
      typeof playerName === 'string' &&
      playerName.length > 0 &&
      playerName.length <= 256 &&
      !/[<>]/.test(playerName)
    ) {
      character.name = playerName;
    }
    if (Object.keys(character).length > 0) snapshot.character = Object.freeze(character);

    if (typeof win.DM === 'boolean') snapshot.role = win.DM ? 'dm' : 'player';
    snapshot.messageBrokerAvailable = win.MB !== undefined && win.MB !== null;

    return Object.freeze(snapshot);
  }

  /**
   * Creates a protocol-v1 connector.hello envelope using the frozen metadata.
   * @param {Object=} context Optional campaignId, characterId, messageId, sentAt, source
   * @return {!Object}
   */
  function createHelloEnvelope(context) {
    return envelopeApi.createHelloEnvelope(metadata, context);
  }

  /** @const {!Object} */
  var connector = Object.freeze({
    id: 'dndbeyond',
    metadata: metadata,
    defaultEnabled: false,
    diagnostics: diagnostics,
    createHelloEnvelope: createHelloEnvelope,
  });

  envelopeApi.assertMetadata(metadata, 'metadata');
  registry.register(connector);

  Object.defineProperty(global, 'DndBeyondConnector', {
    configurable: true,
    enumerable: false,
    value: connector,
    writable: false,
  });
})(typeof window === 'undefined' ? globalThis : window);
