# Phase 3 DDB API inventory and first-boundary selection

Baseline: `graft-vtt` commit `c978399d`. Scope: every `DDBApi` method, its callers, global coupling, retry/error behavior, and token side effects before selecting the first extraction.

## Shared behavior that every authenticated boundary inherits

- `#refreshToken()` reads `MYCOBALT_TOKEN` and `MYCOBALT_TOKEN_EXPIRATION`; on expiry it POSTs with credentials to the cobalt-token endpoint, logs only that a refresh started, writes the replacement token/expiry, and subtracts 30 seconds from the server TTL.
- `lookForErrors()` preserves responses below 400. Status 410 presents the existing cache-clearing message and throws `noLogError`; other failures parse DDB JSON where possible and throw `DDB API Error`. Network failures propagate unchanged.
- `fetchJsonWithToken()` obtains the shared token, installs the existing Bearer header, runs `lookForErrors()`, and returns parsed JSON. Phase 3 must continue to use this function rather than handling tokens in connector code.
- There is no automatic retry in the shared authenticated transport. The only explicit retries are in `fetchCampaignCharacterIds()`.

## Complete surface map

| Surface | Kind and callers | Global coupling / side effects | Error and retry behavior | Phase 3 assessment |
|---|---|---|---|---|
| `#refreshToken` | private auth primitive used by authenticated helpers | Reads/writes cobalt token globals; one credentialed POST on expiry | Fetch/JSON errors propagate; no retry | Preserve unchanged |
| `lookForErrors` | shared response primitive | Calls existing `showError`, `noLogError`, `navigator`, and console paths | Special 410 behavior; parses other error JSON | Preserve unchanged |
| `fetchJsonWithToken` | shared GET/custom-config primitive; 11 internal callers | Authorization header; no application global writes | Shared errors; no retry | Inject into connector boundary, do not move |
| `fetchItemsJsonWithToken` | read; `Startup.mjs:115`, recursive self-call | Reads `find_game_id`; writes `window.ITEMS_CACHE` | Warns/returns accumulated array on empty response; pagination recursion | Reject: cache/pagination coupling |
| `debounceGetPartyInventory` | read; `MessageBroker.js:987`, `Startup.mjs:118`, `CoreFunctions.js:2809` | Reads campaign ID; writes `window.PARTY_INVENTORY_DATA`; updates `window.JOURNAL`; 500 ms debounce | Shared errors through debounced async function | Reject: globals and timing |
| `addItemsToPartyInventory` | write; `CoreFunctions.js:2848` | POST inventory mutation | Existing shared errors | Non-goal: write boundary |
| `addCurrenciesToPartyInventory` | write; `CoreFunctions.js:2905` | PUT currency mutation | Existing shared errors | Non-goal: write boundary |
| `addCustomItemToPartyInventory` | write; `CoreFunctions.js:2888` | POST custom-item mutation | Existing shared errors | Non-goal: write boundary |
| `fetchHtmlWithToken` | read primitive; `fetchMoreInfo` | Bearer header; logs sanitized URL warning on failure | Swallows failures and returns `undefined` | Reject: distinct error semantics |
| `fetchJsonWithTokenOmitCred` | write helper; internal POST/PUT callers | Bearer and JSON headers, credentials omitted | Shared errors | Preserve unchanged |
| `postJsonWithToken` | write helper; three internal callers | Serializes body | Shared errors | Non-goal |
| `putJsonWithToken` | write helper; one internal caller | Serializes body | Shared errors | Non-goal |
| `deleteWithToken` | write helper; one internal caller | DELETE with Bearer header | Deliberately bypasses `lookForErrors` | Non-goal |
| `fetchMoreInfo` | HTML read; `EncounterHandler.js:98`, `MonsterStatBlock.js:1813` | None beyond inherited token helper | Swallows transport failures via HTML helper | Reject: HTML/parser coupling |
| `fetchCharacter` | read; `CoreFunctions.js:2111` | Caller writes `window.characterData` during campaign-ID discovery | Exact invalid-ID throw; shared auth errors; logs raw response | Low caller count, but startup-critical |
| `fetchEncounter` | read; `EncounterHandler.js:43` | No method globals; caller updates encounter cache and catches failures | Exact invalid-ID throw; shared auth errors; logs raw response | **Selected** |
| `fetchAllEncounters` | read; `EncounterHandler.js:29` | No global writes in method | Shared errors; logs start | Reject: large collection/startup behavior |
| `deleteAboveVttEncounters` | write/dead external surface | Reads page/location/localStorage; deletes remotely; writes failure cache | Custom 401 bookkeeping | Non-goal |
| `createAboveVttEncounter` | write/dead external surface | Reads game ID; fetches campaign; creates remote encounter | Explicit campaign validation plus shared errors | Non-goal |
| `fetchCampaignInfo` | read; `Startup.mjs:65`, `CharactersPage.js:1535`, `CampaignPage.mjs:19`, internal create | No method writes; callers populate `window.CAMPAIGN_INFO` | Some caller-level retries; shared errors | Reject: four external/startup callers |
| `fetchMonsters` | read; `EncounterHandler.js:91` | No globals; deduplicates IDs and logs IDs | Invalid non-array returns `[]`; shared errors | Low risk, but feeds HTML enrichment pipeline |
| `fetchCampaignCharacters` | read; internal `fetchCampaignCharacterIds` | Reads `window.playerUsers` cache | Participates in fallback/retry flow | Reject: cache/retry coupling |
| `fetchCampaignCharacterDetails` | composite read; `CoreFunctions.js:1939` | Inherits player/campaign globals from child calls | Inherits retry and validation semantics | Reject: composite boundary |
| `fetchCharacterDetails` | POST-shaped read; `CoreFunctions.js:2076`, `CharactersPage.js:21`, `TokensPanel.js:1645`, internal composite | No direct globals; coerces IDs with `parseInt` | Invalid input warns and returns `[]`; shared errors | Reject: multiple callers and POST body |
| `fetchConfigJson` | read; `Startup.mjs:476`, `CharactersPage.js:1526`, `CampaignPage.mjs:32` | Reads `window.ddbConfigJson`; uniquely returns full response | Shared errors | Reject: cache and return-shape exception |
| `fetchActiveCharacters` | fallback read; internal `fetchCampaignCharacterIds` | Caller writes `window.playerUsers` | Shared errors inside three-attempt fallback | Reject: retry coupling |
| `fetchCampaignCharacterIds` | composite read; internal `fetchCampaignCharacterDetails` | Reads/writes `window.playerUsers` and `window.myUser`; reads player/campaign globals | Three attempts, fallback endpoint, 1/2/4 second backoff, final UI error | Reject: highest state/timing risk |

## Selected boundary: `fetchEncounter(id)`

Why this method is first:

1. One external caller (`EncounterHandler.js:43`) and no internal callers.
2. Read-only authenticated GET with no method-level global reads or writes.
3. The caller already catches errors and converts them to the existing callback contract.
4. It is not part of startup token discovery, campaign caching, fallback retries, writes, HTML parsing, dice, chat, or MessageBroker transport.
5. Adapter-off can retain the exact legacy method body.

## Detailed implementation contract

- Add `connectors/dndbeyond/api.js` as a page-script IIFE loaded before `DndBeyondConnector.js` and after legacy dependencies.
- Expose a frozen `DndBeyondApi` object with pure `buildEncounterRequest(id)`, pure `normalizeEncounterResponse(response)`, and async `fetchEncounter(id, authenticatedFetch)` functions.
- Preserve the exact invalid-ID predicate and `Error("Invalid id: ...")` text.
- The injected `authenticatedFetch` remains `DDBApi.fetchJsonWithToken`; connector code never reads, stores, logs, or refreshes cobalt tokens.
- Keep `DDBApi.fetchEncounter(id)` as the compatibility surface. Adapter off executes the original body. Adapter on delegates request construction and normalization to `DndBeyondApi` while preserving the original raw-response debug label and rejection identity.
- Side-by-side diagnostics compare only pure request URL and normalized-result parity; counters contain no encounter IDs, URLs, response bodies, tokens, or character/campaign data. Never duplicate the network request.
- Add sanitized request/response fixtures, Node VM tests, canonical load-order tests, compatibility tests for enabled/disabled behavior, and rejection/invalid-ID parity.
- Do not modify `EncounterHandler.js`, MessageBroker, dice, stat blocks, rule vocabulary, token refresh, retry timing, or the shared DDB error path.
- Rollback: set `dndbeyond` disabled for the exact legacy path, or revert the isolated fork commit.
