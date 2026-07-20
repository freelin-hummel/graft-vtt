/**
 * D&D Beyond API — Phase 3 pure boundary slice.
 * @fileoverview Plain browser IIFE; no imports, build, or runtime dependencies.
 * Exposes frozen window.DndBeyondApi with pure request construction,
 * response normalization, and aggregate diagnostic counters.
 *
 * Load order: after legacy DDBApi.js, before DndBeyondConnector.js.
 */
(function installDndBeyondApi(global) {
  'use strict';

  /** @const {string} */
  var ENCOUNTER_URL_PREFIX = 'https://encounter-service.dndbeyond.com/v1/encounters/';

  /**
   * Aggregate compatibility counters.
   * Never stores encounter IDs, URLs, response bodies, tokens,
   * or character/campaign data.
   * @type {{totalChecks: number, requestMatches: number, responseMatches: number, mismatches: number}}
   */
  var _compatibility = {
    totalChecks: 0,
    requestMatches: 0,
    responseMatches: 0,
    mismatches: 0
  };

  /**
   * Builds an encounter request object from the given encounter id.
   * Preserves the exact legacy validation predicate and error message.
   * @param {*} id The encounter id to validate and use.
   * @return {!Object<string, string>} A frozen request object with a `url` property.
   * @throws {Error} If typeof id !== 'string' or id.length <= 1.
   */
  function buildEncounterRequest(id) {
    if (typeof id !== 'string' || id.length <= 1) {
      throw new Error('Invalid id: ' + id);
    }
    return Object.freeze({ url: ENCOUNTER_URL_PREFIX + id });
  }

  /**
   * Normalizes an encounter API response by returning the data property.
   * Preserves the exact legacy behavior of `return response.data`.
   * @param {!Object} response The raw API response object.
   * @return {*} The response.data value (reference identity preserved).
   */
  function normalizeEncounterResponse(response) {
    return response.data;
  }

  /**
   * Fetches an encounter using the injected authenticated fetch function.
   * Calls authenticatedFetch exactly once with the legacy URL.
   * Preserves rejection identity — the caller's rejection propagates unchanged.
   * @param {*} id The encounter id.
   * @param {function(string): Promise<Object>} authenticatedFetch
   * @return {Promise<*>} A promise resolving to the normalized encounter data.
   */
  function fetchEncounter(id, authenticatedFetch) {
    var request = buildEncounterRequest(id);
    return authenticatedFetch(request.url).then(normalizeEncounterResponse);
  }

  /**
   * Records a compatibility check result with aggregate counters only.
   * Never stores IDs, URLs, response bodies, tokens, or character/campaign data.
   * @param {boolean} requestMatches Whether the request URL matched.
   * @param {boolean} responseMatches Whether the response data matched.
   * @return {void}
   */
  function recordCompatibilityCheck(requestMatches, responseMatches) {
    _compatibility.totalChecks++;
    if (requestMatches) {
      _compatibility.requestMatches++;
    }
    if (responseMatches) {
      _compatibility.responseMatches++;
    }
    if (!requestMatches || !responseMatches) {
      _compatibility.mismatches++;
    }
  }

  /**
   * Returns a frozen diagnostic snapshot of aggregate counters only.
   * Never contains encounter IDs, URLs, response bodies, tokens,
   * or character/campaign data.
   * @return {!Object} A frozen diagnostic object with counter properties.
   */
  function diagnostics() {
    return Object.freeze({
      totalChecks: _compatibility.totalChecks,
      requestMatches: _compatibility.requestMatches,
      responseMatches: _compatibility.responseMatches,
      mismatches: _compatibility.mismatches
    });
  }

  /** @const {!Object} */
  var api = Object.freeze({
    buildEncounterRequest: buildEncounterRequest,
    normalizeEncounterResponse: normalizeEncounterResponse,
    fetchEncounter: fetchEncounter,
    recordCompatibilityCheck: recordCompatibilityCheck,
    diagnostics: diagnostics
  });

  Object.defineProperty(global, 'DndBeyondApi', {
    configurable: true,
    enumerable: false,
    value: api,
    writable: false
  });
})(typeof window === 'undefined' ? globalThis : window);
