import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const disposition = await readFile(
  new URL(
    "../../../../../skills/quality-refactor/reference/dispositions.md",
    import.meta.url,
  ),
  "utf8",
);
const skill = await readFile(
  new URL("../../../../../skills/quality-refactor/SKILL.md", import.meta.url),
  "utf8",
);

test("records the null-like argument not-planned boundary", () => {
  const normalizedDisposition = disposition.replace(/\s+/g, " ");
  for (const signal of [
    "Generic Quality Guard remains quiet",
    "resolved call target and overload",
    "nullability or other explicit contract metadata",
    "unsupported fixtures for every supported language",
    "actionable remediation tied to the resolved contract",
    "does not weaken a future explicit contract rule",
    "does not duplicate the separate Chapter 7 disposition for null-like return values",
  ]) {
    assert.ok(
      normalizedDisposition.includes(signal),
      `disposition must contain ${signal}`,
    );
  }
});

test("wires chapter-only dispositions into the quality-refactor skill", () => {
  assert.ok(skill.includes("reference/dispositions.md"));
});

test("records source-backed dispositions for the four edge rules", () => {
  const normalizedDisposition = disposition.replace(/\s+/g, " ");
  for (const signal of [
    "Wildcard imports — retain only syntax-proven forms",
    "Retain `wildcard-import` for Python",
    "Else branches — review signal, not blanket ban",
    "a genuine two-way branch with equally normal outcomes is legitimate",
    "Stateless methods — syntax-only candidate",
    "must not infer ownership intent",
    "Assumption markers — retired from generic scanning",
    "has no source/use semantic contract",
    "quiet rather than a policy finding",
  ]) {
    assert.ok(
      normalizedDisposition.includes(signal),
      `edge-rule disposition must contain ${signal}`,
    );
  }
});

const WHITESPACE = /\s+/g;

test("records the else, wildcard, and stateless boundaries", () => {
  const normalizedDisposition = disposition.replace(WHITESPACE, " ");
  for (const signal of [
    "Only else branches that close an if are counted",
    "Rust let-else and Python loop or try else clauses are quiet",
    "The cross-language fixtures live with the scanner tests",
    // biome-ignore lint/security/noSecrets: Rust attribute text, not a credential
    "A Rust `use path::*` inside a `#[cfg(test)]` region",
    "Bodiless TypeScript signatures",
    "are not methods with a body and are quiet",
  ]) {
    assert.ok(
      normalizedDisposition.includes(signal),
      `disposition must contain ${signal}`,
    );
  }
});
