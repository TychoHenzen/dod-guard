import assert from "node:assert/strict";
import { test } from "node:test";
import { advisories, fixHint, main } from "./check-audit.mjs";

function run(argv, deps = {}) {
  let out = "";
  let err = "";
  const summary = [];
  const code = main(argv, {
    stdout: {
      write: (chunk) => {
        out += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        err += chunk;
      },
    },
    appendFile: (path, text) => {
      summary.push([path, text]);
    },
    ...deps,
  });
  return { code, out, err, summary };
}

const high = {
  id: "123",
  package: "sdk",
  severity: "high",
  title: "Bad sdk",
  range: "<1.2.3",
  fix: "fix: sdk@1.2.3",
};
const critical = { ...high, id: "200", package: "core", severity: "critical", title: "Worst" };
const moderate = { ...high, id: "300", package: "util", severity: "moderate", title: "Mild" };

test("clean audit reports zero advisories", () => {
  const result = run([], { advisories: () => [], summaryPath: "" });
  assert.equal(result.code, 0);
  assert.match(result.out, /0 production advisory/);
  assert.equal(result.summary.length, 0);
});

test("high advisory is listed with package, id, and fix hint", () => {
  const result = run([], { advisories: () => [high], summaryPath: "" });
  assert.match(result.out, /high \(1\):/);
  assert.match(result.out, /advisory 123/);
  assert.match(result.out, /fix: sdk@1\.2\.3/);
  assert.equal(result.code, 0);
});

test("critical advisory is listed before high", () => {
  const result = run([], { advisories: () => [high, critical], summaryPath: "" });
  assert.ok(result.out.indexOf("critical (1):") < result.out.indexOf("high (1):"));
});

test("moderate-only audit lists a moderate group", () => {
  const result = run([], { advisories: () => [moderate], summaryPath: "" });
  assert.match(result.out, /moderate \(1\):/);
  assert.match(result.out, /1 moderate/);
  assert.equal(result.code, 0);
});

test("audit failure is reported and exits zero", () => {
  const result = run([], {
    advisories: () => {
      throw new Error("offline");
    },
    summaryPath: "",
  });
  assert.match(result.out, /audit advisory unavailable - offline/);
  assert.equal(result.code, 0);
});

test("step summary receives the same report when the path is set", () => {
  const result = run([], { advisories: () => [high], summaryPath: "summary.md" });
  assert.equal(result.summary.length, 1);
  const [[path, text]] = result.summary;
  assert.equal(path, "summary.md");
  assert.match(text, /### Dependency audit/);
  for (const line of result.out.trimEnd().split("\n")) {
    assert.ok(text.includes(line), `summary is missing line: ${line}`);
  }
});

test("step summary is untouched when the path is unset", () => {
  const result = run([], { advisories: () => [high], summaryPath: "" });
  assert.equal(result.summary.length, 0);
});

test("summary write failure does not change the exit code", () => {
  const result = run([], {
    advisories: () => [],
    summaryPath: "summary.md",
    appendFile: () => {
      throw new Error("read-only");
    },
  });
  assert.equal(result.code, 0);
  assert.match(result.out, /audit summary not written/);
});

test("unknown argument exits 3 and writes nothing", () => {
  const result = run(["--bogus"], { advisories: () => [high], summaryPath: "summary.md" });
  assert.equal(result.code, 3);
  assert.match(result.err, /unknown option: --bogus/);
  assert.equal(result.summary.length, 0);
  assert.equal(result.out, "");
});

test("fixHint covers object, true, and absent", () => {
  assert.equal(fixHint({ name: "a", version: "2.0.0" }), "fix: a@2.0.0");
  assert.equal(fixHint(true), "fix: npm audit fix");
  assert.equal(fixHint(false), "no fix available");
});

test("advisories parsed from an npm audit report keep moderate and drop low", () => {
  const report = {
    vulnerabilities: {
      pkg: {
        severity: "moderate",
        fixAvailable: true,
        via: [{ source: 1, name: "pkg", severity: "moderate", title: "t", range: "<1" }, "string-via"],
      },
      low: {
        severity: "low",
        via: [{ source: 2, name: "low", severity: "low", title: "x", range: "<1" }],
      },
    },
  };
  const items = advisories(report);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "1");
  assert.equal(items[0].fix, "fix: npm audit fix");
});
