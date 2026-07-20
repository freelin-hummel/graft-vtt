import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../../', import.meta.url);

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertConnectorAfterDdbApi(section, label) {
  const connectorIndex = section.indexOf('...graftConnectorScripts');
  const ddbApiIndex = section.indexOf('"DDBApi.js"');
  assert.notEqual(connectorIndex, -1, `${label} does not load the connector scripts`);
  assert.notEqual(ddbApiIndex, -1, `${label} does not load DDBApi.js`);
  assert.ok(connectorIndex > ddbApiIndex, `${label} must register after its legacy DDBApi dependency`);
}

test('all DDB page modes register the same connector scripts after legacy dependencies', async () => {
  const source = await readFile(new URL('Load.js', repo), 'utf8');
  const definition = between(source, 'const graftConnectorScripts', 'const avttScripts');
  const expectedOrder = [
    'connectors/ConnectorEnvelope.js',
    'connectors/ConnectorRegistry.js',
    'connectors/dndbeyond/DndBeyondConnector.js',
  ];
  let previous = -1;
  for (const script of expectedOrder) {
    const index = definition.indexOf(script);
    assert.ok(index > previous, `${script} is missing or out of order`);
    previous = index;
  }

  assertConnectorAfterDdbApi(
    between(source, 'const avttScripts', 'const avttCharacterScripts'),
    'VTT',
  );
  assertConnectorAfterDdbApi(
    between(source, 'const avttCharacterScripts', 'const avttStyles'),
    'character',
  );
  assertConnectorAfterDdbApi(
    between(source, 'pgType === "gamelog"', ': pgType === "campaign"'),
    'gamelog',
  );
  assertConnectorAfterDdbApi(
    between(source, ': pgType === "campaign"', ': ['),
    'campaign',
  );
  assert.equal(source.match(/\.\.\.graftConnectorScripts/g)?.length, 4);
});

test('manifest exposes every injected connector page script', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', repo), 'utf8'));
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  for (const script of [
    'connectors/ConnectorEnvelope.js',
    'connectors/ConnectorRegistry.js',
    'connectors/dndbeyond/DndBeyondConnector.js',
  ]) {
    assert.ok(resources.includes(script), `${script} is not web-accessible`);
  }
});
