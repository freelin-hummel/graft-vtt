# Phase 2 D&D Beyond smoke results

## Pre-change baseline

- Baseline fork commit: `1d75b6ea67e5c1c17ec42163463047643082bd84`
- Baseline root commit: `109bd1f`
- Automated source baseline: PASS — clean fork, no Graft connector scripts or connector globals present.
- Manual authenticated campaign baseline: accepted as the existing known-good AboveVTT behavior; it was not separately re-run during this review.

## Phase 2 candidate

- Tested runtime commit: `c26733e8`
- Root review commit: `bfa7bb4`
- Automated no-op tests: PASS — 22 tests under Node `v24.18.0`.
- Canonical protocol compatibility: PASS — generated Ajv validator accepted the connector hello envelope.
- Manual disabled result: PASS — an authenticated campaign page showed one `dndbeyond` connector with `enabled: false` and no connector-related error was reported.
- Manual enabled result: PASS — the runtime toggle changed the same connector to `enabled: true`; the user approved the milestone and reported no new error or duplicate behavior.
- Unsupported-page diagnostic: `/my-campaigns` correctly had no connector scripts because it is outside the existing AboveVTT injection targets.
- Unrelated console evidence: a DDB page Facebook frame CSP warning was observed and identified as pre-existing site content, not connector activity.

Use `/docs/ddb-smoke-test.md` in the parent Graft repository. Record browser/version, campaign roles, PASS/FAIL, and sanitized console evidence. Never record credentials, campaign secrets, tokens, or private character data.
