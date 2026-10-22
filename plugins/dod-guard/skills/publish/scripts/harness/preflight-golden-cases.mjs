import { registrationCases } from "./preflight-registrations.mjs";
import { registryFor, wrapRegistry } from "./preflight-registry.mjs";

const RELATIVE_INSTALL_PATH = {
  codex: { source: { path: "relative/dir" } },
  claude: { installPath: "relative/dir" },
};

function registrationItem(fixture, name) {
  return registrationCases(fixture.client, fixture.pluginRoot).find((item) => item.name === name);
}

// Each registration case is generated per client so a case that only one client has
// is not run against the other, and the snapshot keys follow the same split.
function registrationGoldens() {
  return ["codex", "claude"].flatMap((client) =>
    registrationCases(client, "unused").map((item) => ({
      name: item.name,
      clients: [client],
      registry: (fixture) => registrationItem(fixture, item.name).registry,
    })),
  );
}

export const REGISTRY_CASES = [
  { name: "success" },
  { name: "success with --registered-root", pins: ["--registered-root"] },
  { name: "success pinned", pins: (fixture) => ["--version", "5.4.56", "--skill-path", fixture.skillFile] },
  { name: "malformed stdin", rawInput: "{" },
  { name: "empty stdin", rawInput: "" },
  { name: "BOM then malformed", rawInput: "﻿{" },
  { name: "registry of the wrong shape", rawInput: "{}" },
  ...registrationGoldens(),
  {
    name: "registration with no version",
    registry: (fixture) => registryFor(fixture.client, fixture.pluginRoot, { version: undefined }),
  },
  {
    name: "registration with a relative install path",
    registry: (fixture) => registryFor(fixture.client, fixture.pluginRoot, RELATIVE_INSTALL_PATH[fixture.client]),
  },
  { name: "unknown flag", pins: ["--bogus"] },
  { name: "duplicate value flag", pins: ["--version", "1", "--version", "2"] },
  { name: "value flag without value", pins: ["--version"] },
  { name: "value flag followed by a flag", pins: ["--version", "--registered-root"] },
  { name: "inventory status abc", pins: ["--inventory-status", "abc"] },
  { name: "inventory status 0 with a valid registration", pins: ["--inventory-status", "0"] },
  { name: "inventory status 3 with a valid registration", pins: ["--inventory-status", "3"] },
  {
    name: "inventory status 3 with a missing registration",
    pins: ["--inventory-status", "3"],
    registry: (fixture) => wrapRegistry(fixture.client, []),
  },
  {
    name: "inventory status 0 with a missing registration",
    pins: ["--inventory-status", "0"],
    registry: (fixture) => wrapRegistry(fixture.client, []),
  },
  { name: "inventory status 3 with malformed stdin", pins: ["--inventory-status", "3"], rawInput: "{" },
];
