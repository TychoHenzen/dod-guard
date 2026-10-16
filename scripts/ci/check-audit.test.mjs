import assert from "node:assert/strict";
import { test } from "node:test";
import { advisories, fixHint, main, parseAuditReport } from "./check-audit.mjs";

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

test("fixHint covers object, true, and false", () => {
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

test("parseAuditReport accepts a report with a vulnerabilities object", () => {
  const report = parseAuditReport('{"vulnerabilities":{}}');
  assert.deepEqual(report, { vulnerabilities: {} });
});

test("parseAuditReport rejects an npm error object and keeps its summary", () => {
  const text = JSON.stringify({ error: { code: "ENOTFOUND", summary: "registry unreachable" } });
  assert.throws(() => parseAuditReport(text), /registry unreachable/);
});

test("parseAuditReport rejects a report without a vulnerabilities object", () => {
  assert.throws(() => parseAuditReport('{"metadata":{}}'), /no vulnerabilities/);
  assert.throws(() => parseAuditReport("null"), /no vulnerabilities/);
});

test("main reports unavailable when npm audit fails with an error object", () => {
  const npmFailure = Object.assign(new Error("Command failed"), {
    stdout: JSON.stringify({ error: { code: "ENOTFOUND", summary: "registry unreachable" } }),
  });
  const result = run([], {
    exec: () => {
      throw npmFailure;
    },
    summaryPath: "summary.md",
  });
  assert.equal(result.code, 0);
  assert.match(result.out, /audit advisory unavailable - .*registry unreachable/);
  assert.doesNotMatch(result.out, /0 production advisory/);
  assert.match(result.summary[0][1], /audit advisory unavailable/);
});

test("main reports unavailable when npm audit exits zero with an error object", () => {
  const result = run([], {
    exec: () => JSON.stringify({ error: { summary: "bad registry response" } }),
    summaryPath: "",
  });
  assert.equal(result.code, 0);
  assert.match(result.out, /audit advisory unavailable - .*bad registry response/);
});

test("main reports advisories parsed from the npm audit output", () => {
  const output = JSON.stringify({
    vulnerabilities: {
      sdk: { fixAvailable: true, via: [{ source: 9, name: "sdk", severity: "high", title: "Bad sdk", range: "<2" }] },
    },
  });
  const result = run([], { exec: () => output, summaryPath: "" });
  assert.match(result.out, /high \(1\):/);
  assert.match(result.out, /advisory 9/);
});

test("advisories picks the same fix hint whatever order npm lists the packages", () => {
  const via = { source: 7, name: "shared", severity: "high", title: "Shared", range: "<2" };
  const withFix = { severity: "high", fixAvailable: { name: "a-pkg", version: "2.0.0" }, via: [via] };
  const withoutFix = { severity: "high", fixAvailable: false, via: [via] };
  const forward = advisories({ vulnerabilities: { "a-pkg": withFix, "b-pkg": withoutFix } });
  const reversed = advisories({ vulnerabilities: { "b-pkg": withoutFix, "a-pkg": withFix } });
  assert.deepEqual(forward, reversed);
  assert.equal(forward.length, 1);
});
