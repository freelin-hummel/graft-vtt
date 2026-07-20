# Phase 3 D&D Beyond smoke results

## Candidate

- Baseline fork commit: `c978399d`
- Candidate runtime commit: `69dfb239`
- Parent review commit: pending
- Selected boundary: `DDBApi.fetchEncounter(id)`
- Automated Node 24 result: PASS — 53 tests.
- Independent review: PASS — no code blockers.

## Authenticated browser gate

Test an actual `/campaigns/<id>` or supported VTT/encounter flow; `/my-campaigns` is outside the existing injection targets.

### Adapter disabled

- Existing campaign/VTT behavior: PASS — accepted by the user.
- Adapter-off rollback: PASS — accepted by the user; automated tests prove the original path.
- Token/error handling: PASS — shared token and error implementation is unchanged.
- Duplicate requests/listeners/messages: PASS — no connector duplicate was reported.

### Adapter enabled

Enable in the top-frame page console:

```js
GraftConnectorRegistry.setEnabled('dndbeyond', true)
```

Then inspect privacy-safe counters:

```js
GraftConnectorRegistry.diagnostics('dndbeyond').detail.apiDiagnostics
```

- Connector registration and runtime enable: PASS.
- Enabled path execution: PASS — the browser stack showed `api.js` and the compatibility wrapper.
- Error semantics: PASS — a forced read used a non-service encounter identifier, received one 404, and flowed through the unchanged `DDBApi.lookForErrors` path.
- Successful-response parity: PASS by automated fixture/compatibility tests; the forced browser read had no successful body to compare, so aggregate counters correctly remained zero.
- Token expiry/reconnect implementation: PASS by unchanged shared code and automated rejection parity; no new authentication error was reported.
- Exactly one encounter request per logical fetch: PASS — browser evidence showed one GET and no shadow request.

### Rollback

```js
GraftConnectorRegistry.setEnabled('dndbeyond', false)
```

- Existing encounter flow restores immediately without rebuild: PASS — user approved the rollback gate.

Two unrelated legacy errors were observed: a user-closed Patreon login popup and a `TokensPanel.js` `alternativeImages` failure. Their four stack files are byte-identical between baseline `c978399d` and candidate `69dfb239`; neither is attributed to this extraction.

Record only PASS/FAIL and sanitized console/request-count evidence. Never record cobalt tokens, Authorization headers, cookies, campaign secrets, encounter identifiers, private encounter bodies, or character data.
