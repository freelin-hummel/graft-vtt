# Phase 3 D&D Beyond smoke results

## Candidate

- Baseline fork commit: `c978399d`
- Candidate runtime commit: pending
- Parent review commit: pending
- Selected boundary: `DDBApi.fetchEncounter(id)`
- Automated Node 24 result: pending
- Independent review: pending

## Authenticated browser gate

Test an actual `/campaigns/<id>` or supported VTT/encounter flow; `/my-campaigns` is outside the existing injection targets.

### Adapter disabled

- Full DDB smoke checklist: **PENDING USER REVIEW**
- Encounter loads through legacy path: **PENDING USER REVIEW**
- Token expiry/reconnect behavior: **PENDING USER REVIEW**
- Duplicate requests/listeners/messages: **PENDING USER REVIEW**

### Adapter enabled

Enable in the top-frame page console:

```js
GraftConnectorRegistry.setEnabled('dndbeyond', true)
```

Then inspect privacy-safe counters:

```js
GraftConnectorRegistry.diagnostics('dndbeyond').detail.apiDiagnostics
```

- Full DDB smoke checklist: **PENDING USER REVIEW**
- Encounter loads through connector-owned request/normalization: **PENDING USER REVIEW**
- `totalChecks` increases only when `fetchEncounter` is exercised: **PENDING USER REVIEW**
- `mismatches` remains `0`: **PENDING USER REVIEW**
- Token expiry/reconnect behavior remains unchanged: **PENDING USER REVIEW**
- Exactly one encounter request per logical fetch: **PENDING USER REVIEW**

### Rollback

```js
GraftConnectorRegistry.setEnabled('dndbeyond', false)
```

- Existing encounter flow restores immediately without rebuild: **PENDING USER REVIEW**

Record only PASS/FAIL and sanitized console/request-count evidence. Never record cobalt tokens, Authorization headers, cookies, campaign secrets, private encounter bodies, or character data.
