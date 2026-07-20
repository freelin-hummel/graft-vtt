# Graft connector compatibility seam

Phase 2 added an inert, plain-JavaScript connector registry to AboveVTT. Phase 3 moves the first authenticated read boundary—`DDBApi.fetchEncounter(id)` request construction and response normalization—behind that registry while preserving the old global method.

## Runtime scripts

`Load.js` injects these scripts, in order, after each page mode's legacy dependencies on VTT, character, gamelog, and campaign pages:

1. `ConnectorEnvelope.js` — focused protocol-v1 `connector.hello` construction and frozen assertions.
2. `ConnectorRegistry.js` — registration, diagnostics, and an in-memory kill switch.
3. `dndbeyond/api.js` — pure encounter request construction, response normalization, and privacy-safe parity counters.
4. `dndbeyond/DndBeyondConnector.js` — disabled-by-default metadata and read-only diagnostics.

The scripts use browser IIFEs and JSDoc. There is no module loader, package manager, or build step.

## Safety contract

- Existing AboveVTT globals, DDB APIs, `MessageBroker`, and `custom/myVTT/*` events remain authoritative.
- Loading, toggling, inspecting, and disabling the connector creates no listener, timer, storage, WebSocket, XHR, roll, chat, or update side effect.
- When disabled, `DDBApi.fetchEncounter(id)` executes its exact legacy path.
- When enabled, the connector constructs the same encounter URL and normalizes the same `response.data` reference, while the existing `DDBApi.fetchJsonWithToken` remains solely responsible for tokens, expiry, headers, errors, and transport.
- One logical fetch produces exactly one network request; diagnostic comparison never performs a shadow request.
- Protocol capabilities remain `false` because this compatibility extraction does not expose a transport-facing connector feature.
- Diagnostics copy only normalized campaign/character labels, readiness booleans, and aggregate parity counters. They never retain IDs, URLs, bodies, tokens, or raw legacy objects.
- Reloading always restores the default-off state.

## Inspect in the browser console

```js
GraftConnectorRegistry.list()
GraftConnectorRegistry.diagnostics('dndbeyond')
DndBeyondConnector.createHelloEnvelope()
```

Temporarily enable the inert adapter:

```js
GraftConnectorRegistry.setEnabled('dndbeyond', true)
```

Immediate kill switch:

```js
GraftConnectorRegistry.setEnabled('dndbeyond', false)
```

Disabled state is the exact legacy rollback. Enabled state changes only pure request construction and response normalization for `DDBApi.fetchEncounter(id)`; callers, transport, logging, errors, and returned object identity remain compatible.

## Automated checks

Requires Node 24; no dependency installation is needed.

```bash
node --test connectors/test/*.test.mjs
```

The tests cover strict protocol metadata/envelope assertions, default-off behavior, duplicate registration, diagnostic normalization, side-effect isolation, all DDB page-mode load positions, manifest exposure, sanitized encounter fixtures, enabled/disabled compatibility, invalid-ID and rejection parity, exactly-one transport call, and privacy-safe side-by-side counters.

## Manual verification

Run the root repository's `docs/ddb-smoke-test.md` checklist with the adapter disabled and enabled. Phase 3 must include encounter loading plus token-expiry/reconnect behavior. Record Phase 3 results in `connectors/test/phase3-smoke-results.md`; do not record authentication tokens, campaign secrets, or private character data.
