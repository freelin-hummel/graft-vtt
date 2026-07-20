(function installGraftConnectorEnvelope(global) {
  'use strict';

  const PROTOCOL_VERSION = 1;
  const MAX_ENVELOPE_BYTES = 256 * 1024;
  const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
  const MESSAGE_SOURCES = new Set(['page', 'extension', 'web', 'server', 'connector']);
  const TRANSPORTS = new Set(['direct', 'extension']);
  const CAPABILITY_KEYS = ['characters', 'liveUpdates', 'rolls', 'statBlocks'];
  const METADATA_KEYS = [
    'capabilities',
    'connectorId',
    'connectorName',
    'connectorVersion',
    'supportedProtocolVersions',
    'systemId',
    'systemName',
    'transport',
    'vocabulary',
  ];
  const ENVELOPE_KEYS = [
    'campaignId',
    'characterId',
    'connectorId',
    'kind',
    'messageId',
    'payload',
    'protocolVersion',
    'sentAt',
    'source',
    'systemId',
  ];

  function fail(path, message) {
    throw new TypeError(`${path}: ${message}`);
  }

  function assertObject(value, path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail(path, 'must be an object');
    }
  }

  function assertClosed(value, allowedKeys, path) {
    assertObject(value, path);
    for (const key of Object.keys(value)) {
      if (!allowedKeys.includes(key)) fail(`${path}.${key}`, 'is not allowed');
    }
  }

  function assertIdentifier(value, path) {
    if (
      typeof value !== 'string' ||
      value.length < 1 ||
      value.length > 128 ||
      !IDENTIFIER_PATTERN.test(value)
    ) {
      fail(path, 'must be a protocol identifier');
    }
  }

  function assertShortText(value, path) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
      fail(path, 'must contain 1 to 256 characters');
    }
  }

  function isValidUtcTimestamp(value) {
    if (typeof value !== 'string') return false;
    var match = UTC_TIMESTAMP_PATTERN.exec(value);
    if (!match) return false;
    var dateParts = value.slice(0, 10).split('-').map(Number);
    var timeParts = value.slice(11, 19).split(':').map(Number);
    var year = dateParts[0];
    var month = dateParts[1];
    var day = dateParts[2];
    var hour = timeParts[0];
    var minute = timeParts[1];
    var second = timeParts[2];
    if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 60) return false;
    var leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= daysInMonth[month - 1];
  }

  function assertMetadata(metadata, path) {
    assertClosed(metadata, METADATA_KEYS, path);
    assertIdentifier(metadata.connectorId, `${path}.connectorId`);
    assertShortText(metadata.connectorName, `${path}.connectorName`);
    if (
      typeof metadata.connectorVersion !== 'string' ||
      metadata.connectorVersion.length < 1 ||
      metadata.connectorVersion.length > 64
    ) {
      fail(`${path}.connectorVersion`, 'must contain 1 to 64 characters');
    }
    assertIdentifier(metadata.systemId, `${path}.systemId`);
    assertShortText(metadata.systemName, `${path}.systemName`);
    if (
      !Array.isArray(metadata.supportedProtocolVersions) ||
      metadata.supportedProtocolVersions.length !== 1 ||
      metadata.supportedProtocolVersions[0] !== PROTOCOL_VERSION
    ) {
      fail(`${path}.supportedProtocolVersions`, 'must contain only protocol version 1');
    }

    assertClosed(metadata.capabilities, CAPABILITY_KEYS, `${path}.capabilities`);
    for (const key of CAPABILITY_KEYS) {
      if (typeof metadata.capabilities[key] !== 'boolean') {
        fail(`${path}.capabilities.${key}`, 'must be a boolean');
      }
    }

    assertClosed(
      metadata.vocabulary,
      ['attributes', 'conditionsLabel', 'rollTypesLabel'],
      `${path}.vocabulary`,
    );
    assertShortText(metadata.vocabulary.conditionsLabel, `${path}.vocabulary.conditionsLabel`);
    assertShortText(metadata.vocabulary.rollTypesLabel, `${path}.vocabulary.rollTypesLabel`);
    if (!Array.isArray(metadata.vocabulary.attributes) || metadata.vocabulary.attributes.length > 128) {
      fail(`${path}.vocabulary.attributes`, 'must be an array with at most 128 entries');
    }
    metadata.vocabulary.attributes.forEach((entry, index) => {
      const entryPath = `${path}.vocabulary.attributes[${index}]`;
      assertClosed(entry, ['key', 'label'], entryPath);
      assertIdentifier(entry.key, `${entryPath}.key`);
      assertShortText(entry.label, `${entryPath}.label`);
    });

    if (!TRANSPORTS.has(metadata.transport)) {
      fail(`${path}.transport`, 'must be direct or extension');
    }
    return metadata;
  }

  function assertHelloEnvelope(envelope) {
    assertClosed(envelope, ENVELOPE_KEYS, 'message');
    if (envelope.protocolVersion !== PROTOCOL_VERSION) {
      fail('message.protocolVersion', 'must equal 1');
    }
    if (typeof envelope.messageId !== 'string' || !UUID_PATTERN.test(envelope.messageId)) {
      fail('message.messageId', 'must be a UUID');
    }
    if (!isValidUtcTimestamp(envelope.sentAt)) {
      fail('message.sentAt', 'must be a valid ISO 8601 UTC timestamp ending in Z');
    }
    if (!MESSAGE_SOURCES.has(envelope.source)) fail('message.source', 'is not supported');
    assertIdentifier(envelope.systemId, 'message.systemId');
    assertIdentifier(envelope.connectorId, 'message.connectorId');
    if (envelope.campaignId !== undefined) assertIdentifier(envelope.campaignId, 'message.campaignId');
    if (envelope.characterId !== undefined) {
      assertIdentifier(envelope.characterId, 'message.characterId');
    }
    if (envelope.kind !== 'connector.hello') fail('message.kind', 'must equal connector.hello');
    assertClosed(envelope.payload, ['metadata'], 'message.payload');
    assertMetadata(envelope.payload.metadata, 'message.payload.metadata');
    if (envelope.connectorId !== envelope.payload.metadata.connectorId) {
      fail('message.connectorId', 'must match metadata.connectorId');
    }
    if (envelope.systemId !== envelope.payload.metadata.systemId) {
      fail('message.systemId', 'must match metadata.systemId');
    }

    const serialized = JSON.stringify(envelope);
    const byteLength = new TextEncoder().encode(serialized).byteLength;
    if (byteLength > MAX_ENVELOPE_BYTES) fail('message', 'exceeds the 256 KiB limit');
    return envelope;
  }

  function createHelloEnvelope(metadata, context) {
    const options = context || {};
    assertMetadata(metadata, 'metadata');
    const cryptoObject = global.crypto;
    if (!cryptoObject || typeof cryptoObject.randomUUID !== 'function') {
      throw new Error('crypto.randomUUID is required to create a connector envelope');
    }
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: options.messageId || cryptoObject.randomUUID(),
      sentAt: options.sentAt || new Date().toISOString(),
      source: options.source || 'connector',
      systemId: metadata.systemId,
      connectorId: metadata.connectorId,
      kind: 'connector.hello',
      payload: { metadata },
    };
    if (options.campaignId !== undefined) envelope.campaignId = options.campaignId;
    if (options.characterId !== undefined) envelope.characterId = options.characterId;
    return assertHelloEnvelope(envelope);
  }

  const api = Object.freeze({
    MAX_ENVELOPE_BYTES,
    PROTOCOL_VERSION,
    assertHelloEnvelope,
    assertMetadata,
    createHelloEnvelope,
  });
  Object.defineProperty(global, 'GraftConnectorEnvelope', {
    configurable: true,
    enumerable: false,
    value: api,
    writable: false,
  });
})(typeof window === 'undefined' ? globalThis : window);
