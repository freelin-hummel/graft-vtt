(function installGraftConnectorRegistry(global) {
  'use strict';

  const connectors = new Map();
  const enabledOverrides = new Map();

  function requireConnectorId(connectorId) {
    if (typeof connectorId !== 'string' || connectorId.length === 0) {
      throw new TypeError('connectorId must be a non-empty string');
    }
  }

  function requireRegistered(connectorId) {
    requireConnectorId(connectorId);
    const connector = connectors.get(connectorId);
    if (!connector) throw new Error(`Unknown Graft connector: ${connectorId}`);
    return connector;
  }

  /**
   * Registers an inert connector descriptor. Registration must not start listeners,
   * timers, storage, transport, or network activity.
   * @param {{ id: string, metadata: object, defaultEnabled?: boolean, diagnostics?: Function }} connector
   * @returns {object}
   */
  function register(connector) {
    if (connector === null || typeof connector !== 'object' || Array.isArray(connector)) {
      throw new TypeError('connector must be an object');
    }
    requireConnectorId(connector.id);
    if (connectors.has(connector.id)) {
      throw new Error(`Graft connector already registered: ${connector.id}`);
    }
    if (
      connector.metadata === null ||
      typeof connector.metadata !== 'object' ||
      connector.metadata.connectorId !== connector.id
    ) {
      throw new TypeError('connector metadata must identify the same connectorId');
    }
    if (connector.diagnostics !== undefined && typeof connector.diagnostics !== 'function') {
      throw new TypeError('connector diagnostics must be a function');
    }
    connectors.set(connector.id, connector);
    return connector;
  }

  function get(connectorId) {
    requireConnectorId(connectorId);
    return connectors.get(connectorId);
  }

  function isEnabled(connectorId) {
    const connector = requireRegistered(connectorId);
    if (enabledOverrides.has(connectorId)) return enabledOverrides.get(connectorId);
    return connector.defaultEnabled === true;
  }

  /** Runtime kill switch; false immediately restores the inert legacy-only path. */
  function setEnabled(connectorId, enabled) {
    requireRegistered(connectorId);
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    enabledOverrides.set(connectorId, enabled);
    return enabled;
  }

  function list() {
    return Array.from(connectors.values(), (connector) =>
      Object.freeze({
        connectorId: connector.id,
        enabled: isEnabled(connector.id),
        metadata: connector.metadata,
      }),
    );
  }

  function diagnostics(connectorId) {
    const connector = requireRegistered(connectorId);
    const detail = connector.diagnostics ? connector.diagnostics() : undefined;
    return Object.freeze({
      connectorId,
      enabled: isEnabled(connectorId),
      metadata: connector.metadata,
      detail,
    });
  }

  const api = Object.freeze({ diagnostics, get, isEnabled, list, register, setEnabled });
  Object.defineProperty(global, 'GraftConnectorRegistry', {
    configurable: true,
    enumerable: false,
    value: api,
    writable: false,
  });
})(typeof window === 'undefined' ? globalThis : window);
