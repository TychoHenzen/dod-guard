import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { REGISTRY_CASES } from "./harness/preflight-golden-cases.mjs";
import { INSTALL_CASES } from "./harness/preflight-golden-install-cases.mjs";
import { normalizeRun } from "./harness/preflight-golden-normalize.mjs";
import { CLIENTS, createInstall, runPreflight } from "./harness/preflight-fixture.mjs";
import { registryFor } from "./harness/preflight-registry.mjs";

const SNAPSHOT = new URL("./fixtures/preflight-golden.snapshot.json", import.meta.url);
const UPDATE = process.env.UPDATE_SNAPSHOT === "1";

const EXPANDED = [...REGISTRY_CASES, ...INSTALL_CASES].flatMap((item) =>
  (item.clients ?? CLIENTS).map((client) => ({ key: `${client}: ${item.name}`, client, item })),
);

const records = {};

async function loadSnapshot() {
  return JSON.parse(await readFile(SNAPSHOT, "utf8"));
}

async function saveRecord(key, record) {
  records[key] = record;
  await writeFile(SNAPSHOT, `${JSON.stringify(records, null, 2)}\n`);
}

function pinsOf(item, fixture) {
  if (typeof item.pins === "function") return item.pins(fixture);
  return item.pins ?? [];
}

function registryOf(item, fixture) {
  if (item.registry) return item.registry(fixture);
  return registryFor(fixture.client, fixture.pluginRoot);
}

for (const { key, client, item } of EXPANDED) {
  test(key, async (t) => {
    const fixture = await createInstall(t, client);
    await item.setup?.(fixture);
    const result = runPreflight(fixture, registryOf(item, fixture), {
      pins: pinsOf(item, fixture),
      rawInput: item.rawInput,
    });
    const record = await normalizeRun(result, fixture);
    if (UPDATE) await saveRecord(key, record);
    assert.deepStrictEqual(record, (await loadSnapshot())[key]);
  });
}

if (!UPDATE) {
  test("the snapshot holds exactly the golden cases", async () => {
    const expected = EXPANDED.map((entry) => entry.key).sort();
    assert.deepStrictEqual(Object.keys(await loadSnapshot()).sort(), expected);
  });
}
