# Graft connector compatibility seam

Phase 2 adds an inert, plain-JavaScript connector registry to AboveVTT. It does not replace or wrap any legacy D&D Beyond behavior.

## Runtime scripts

`Load.js` injects these scripts, in order, after each page mode's legacy dependencies on VTT, character, gamelog, and campaign pages:

1. `ConnectorEnvelope.js` — focused protocol-v1 `connector.hello` construction and frozen assertions.
2. `ConnectorRegistry.js` — registration, diagnostics, and an in-memory kill switch.
3. `dndbeyond/DndBeyondConnector.js` — disabled-by-default metadata and read-only diagnostics.

The scripts use browser IIFEs and JSDoc. There is no module loader, package manager, or build step.

## Safety contract

- Existing AboveVTT globals, DDB APIs, `MessageBroker`, and `custom/myVTT/*` events remain authoritative.
- Loading, enabling, inspecting, and disabling the connector creates no listener, timer, storage, network, WebSocket, XHR, roll, chat, or update side effect.
- All no-op capabilities report `false` until a later extraction implements them.
- Diagnostics copy only normalized campaign/character labels and readiness booleans. They do not retain or expose raw legacy objects.
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

Because Phase 2 has no dispatch path, both enabled and disabled states retain the exact legacy behavior.

## Automated checks

Requires Node 24; no dependency installation is needed.

```bash
node --test connectors/test/*.test.mjs
```

The tests cover strict protocol metadata/envelope assertions, default-off behavior, duplicate registration, diagnostic normalization, side-effect isolation, all DDB page-mode load positions, and manifest exposure.

## Manual verification

Run the root repository's `docs/ddb-smoke-test.md` checklist with the adapter disabled and enabled. Record both results in `connectors/test/smoke-results.md`; do not record authentication tokens, campaign secrets, or private character data.
