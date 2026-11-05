// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { scannerPath } from "./scanner-location.mjs";

const SCANNER = "skills/quality-refactor/scripts/quality-scan.mjs";
const FOUND_ZERO_PATTERN = /found 0/;
const FOUND_TWO_PATTERN = /found 2/;

// Entry shapes copied from `claude plugin list --json` and `codex plugin list
// --json` on 2026-10-07.
test("finds the scanner under Claude's quality-guard installPath", () => {
  const registry = [
    {
      id: "dod-guard@dod-guard",
      enabled: true,
      installPath: "C:\\cache\\dod-guard\\dod-guard\\5.4.59",
    },
    {
      id: "quality-guard@dod-guard",
      enabled: true,
      installPath: "C:\\cache\\dod-guard\\quality-guard\\0.5.15",
    },
  ];
  assert.equal(scannerPath("claude", registry), `C:/cache/dod-guard/quality-guard/0.5.15/${SCANNER}`);
});

test("finds the scanner under Codex's quality-guard source path", () => {
  const registry = {
    installed: [
      {
        pluginId: "quality-guard@dod-guard-monorepo",
        enabled: true,
        source: { path: "C:\\m\\packages\\quality-guard" },
      },
    ],
    available: [],
  };
  assert.equal(scannerPath("codex", registry), `C:/m/packages/quality-guard/${SCANNER}`);
});

test("refuses a missing, disabled, or ambiguous quality-guard install", () => {
  assert.throws(() => scannerPath("claude", []), /found 0/);
  assert.throws(() => scannerPath("claude", [{ id: "quality-guard@x", enabled: false, installPath: "a" }]), /found 0/);
  const twice = [
    { id: "quality-guard@a", enabled: true, installPath: "a" },
    { id: "quality-guard@b", enabled: true, installPath: "b" },
  ];
  assert.throws(() => scannerPath("claude", twice), /found 2/);
});

test("a disabled Claude install names the one enable command, and nothing else does", () => {
  const disabled = [{ id: "quality-guard@dod-guard", enabled: false, installPath: "a" }];
  assert.throws(
    () => scannerPath("claude", disabled),
    (error) =>
      FOUND_ZERO_PATTERN.test(error.message) && error.message.includes("claude plugin enable quality-guard@dod-guard"),
  );
  assert.throws(
    () => scannerPath("claude", []),
    (error) => FOUND_ZERO_PATTERN.test(error.message) && !error.message.includes("plugin enable"),
  );
  const codexDisabled = { installed: [{ pluginId: "quality-guard@x", enabled: false, source: { path: "a" } }] };
  assert.throws(
    () => scannerPath("codex", codexDisabled),
    (error) => FOUND_ZERO_PATTERN.test(error.message) && !error.message.includes("plugin enable"),
  );
  const twice = [
    { id: "quality-guard@a", enabled: true, installPath: "a" },
    { id: "quality-guard@b", enabled: true, installPath: "b" },
  ];
  assert.throws(
    () => scannerPath("claude", twice),
    (error) => FOUND_TWO_PATTERN.test(error.message) && !error.message.includes("plugin enable"),
  );
});

test("a Claude list with no quality-guard entry names the install command", () => {
  assert.throws(
    () => scannerPath("claude", []),
    (error) =>
      error.message.includes("found 0") && error.message.includes("claude plugin install quality-guard@dod-guard"),
  );
  assert.throws(
    () => scannerPath("claude", [{ id: "dod-guard@market-x", enabled: true, installPath: "a" }]),
    (error) => error.message.includes("claude plugin install quality-guard@market-x"),
  );
});

test("a malformed Claude list gets the install command with the default marketplace", () => {
  const malformed = [null, {}, [{ enabled: true }], [{ id: "dod-guard@", enabled: true, installPath: "a" }]];
  for (const registry of malformed) {
    assert.throws(
      () => scannerPath("claude", registry),
      (error) =>
        error.message.includes("found 0") &&
        error.message.includes("claude plugin install quality-guard@dod-guard") &&
        !(error instanceof TypeError),
    );
  }
});

test("no install command is named when an entry exists or the client is Codex", () => {
  const disabled = [{ id: "quality-guard@dod-guard", enabled: false, installPath: "a" }];
  assert.throws(
    () => scannerPath("claude", disabled),
    (error) => error.message.includes("plugin enable") && !error.message.includes("plugin install"),
  );
  const noPath = [{ id: "quality-guard@dod-guard", enabled: true }];
  assert.throws(
    () => scannerPath("claude", noPath),
    (error) => error.message.includes("found 0") && !error.message.includes("plugin install"),
  );
  const twice = [
    { id: "quality-guard@a", enabled: true, installPath: "a" },
    { id: "quality-guard@b", enabled: true, installPath: "b" },
  ];
  assert.throws(
    () => scannerPath("claude", twice),
    (error) => error.message.includes("found 2") && !error.message.includes("plugin install"),
  );
  assert.throws(
    () => scannerPath("codex", { installed: [], available: [] }),
    (error) => error.message.includes("found 0") && !error.message.includes("plugin install"),
  );
});

test("an enabled install resolves the scanner after the install command was followed", () => {
  const registry = [{ id: "quality-guard@dod-guard", enabled: true, installPath: "C:\\cache\\quality-guard" }];
  assert.equal(scannerPath("claude", registry), `C:/cache/quality-guard/${SCANNER}`);
});
