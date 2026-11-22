import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./finish-check.mjs", import.meta.url));

const ORIGINAL = [
  "---",
  "name: sample",
  "---",
  "Run the sync:",
  "```bash",
  'git branch -D "$name"',
  "```",
  "Then call `gh api repos/o/r/issues` and read `tools`.",
  "Fetch https://dev.example.com/api/items first.",
].join("\n");
const FAITHFUL = [
  "Run the sync:",
  "```bash",
  'git branch -D "$name"',
  "```",
  "Then call gh api repos/o/r/issues.",
  "Fetch https://dev.example.com/api/items first.",
].join("\n");
const GOOD_AUDIT = "## Gap audit: sample\n### Approved cuts\nnone\n### Verdict\nCLEAN\n";
const GOOD_APPROVALS = JSON.stringify({ approvedCuts: [] });
const CONTRACT = "Keep every command exact.\n";
const VERBATIM = "https://dev.example.com/api/items\n";
const BLOCK = 'git branch -D "$name"';
const SPAN = "gh api repos/o/r/issues";
const URL_LINE = "https://dev.example.com/api/items";

describe("finish-check", () => {
  let dir;
  let counter = 0;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "finish-check-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  // Writes each file that is not null into a fresh case folder, then returns the six paths.
  function materialize(overrides = {}) {
    const caseDir = join(dir, `case-${counter++}`);
    const values = {
      original: ORIGINAL,
      rewrite: FAITHFUL,
      contract: CONTRACT,
      verbatim: VERBATIM,
      approvals: GOOD_APPROVALS,
      audit: GOOD_AUDIT,
      ...overrides,
    };
    const names = {
      original: "original.md",
      rewrite: "rewrite.md",
      contract: "contract.txt",
      verbatim: "verbatim.txt",
      approvals: "approvals.json",
      audit: "audit.md",
    };
    const paths = {};
    for (const [key, name] of Object.entries(names)) {
      paths[key] = join(caseDir, name);
      if (values[key] === null) continue;
      mkdirSync(caseDir, { recursive: true });
      writeFileSync(paths[key], values[key]);
    }
    return paths;
  }

  function toArgs(paths) {
    return [
      `--original=${paths.original}`,
      `--rewrite=${paths.rewrite}`,
      `--contract=${paths.contract}`,
      `--verbatim=${paths.verbatim}`,
      `--approvals=${paths.approvals}`,
      `--audit=${paths.audit}`,
    ];
  }

  function runArgs(args) {
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, json: JSON.parse(stdout) };
    } catch (error) {
      const stdout = error.stdout ?? "";
      return { code: error.status, json: stdout ? JSON.parse(stdout) : null };
    }
  }

  function scenario(overrides) {
    return runArgs(toArgs(materialize(overrides)));
  }

  test("passes a faithful rewrite", () => {
    const result = scenario({});
    assert.equal(result.code, 0);
    assert.equal(result.json.ok, true);
  });

  test("ignores a single-word inline span", () => {
    // The original's `tools` span is one word and is never checked; FAITHFUL omits it.
    assert.equal(scenario({}).code, 0);
  });

  test("fails when the code block is dropped", () => {
    const result = scenario({
      rewrite: "Then call gh api repos/o/r/issues.\nFetch https://dev.example.com/api/items first.\n",
    });
    assert.equal(result.code, 1);
    assert.ok(result.json.dropped.some((item) => item.kind === "fenced"));
  });

  test("fails when the URL (a verbatim line) is dropped", () => {
    const result = scenario({ rewrite: "Run the sync.\nThen call gh api repos/o/r/issues.\n" });
    assert.equal(result.code, 1);
    assert.ok(result.json.dropped.some((item) => item.kind === "verbatim"));
  });

  test("fails when the gh api inline span is dropped", () => {
    const result = scenario({
      rewrite: 'Run the sync:\n```bash\ngit branch -D "$name"\n```\nFetch https://dev.example.com/api/items first.\n',
    });
    assert.equal(result.code, 1);
    assert.ok(result.json.dropped.some((item) => item.kind === "inline"));
  });

  test("passes once the drops are approved cuts", () => {
    const approvals = JSON.stringify({
      approvedCuts: [
        { text: BLOCK, reason: "block moved to the helper script" },
        { text: SPAN, reason: "span replaced by the list command" },
        { text: URL_LINE, reason: "URL now lives in the reference file" },
      ],
    });
    const result = scenario({ rewrite: "Run the helper.\n", approvals });
    assert.equal(result.code, 0);
  });

  test("an approved cut holding a whole block approves each line inside it", () => {
    const approvals = JSON.stringify({
      approvedCuts: [{ text: `${BLOCK}\necho done`, reason: "block replaced by a helper" }],
    });
    const result = scenario({
      rewrite: "Then call gh api repos/o/r/issues.\nFetch https://dev.example.com/api/items first.\n",
      approvals,
    });
    assert.equal(result.code, 0);
  });

  test("ignores indentation and CRLF", () => {
    const rewrite = FAITHFUL.split("\n")
      .map((line) => `    ${line}`)
      .join("\r\n");
    assert.equal(scenario({ rewrite }).code, 0);
  });

  test("exits 1 for a missing contract, an empty audit, and an audit without the Approved cuts heading", () => {
    const missingContract = scenario({ contract: null });
    assert.equal(missingContract.code, 1);
    assert.ok(missingContract.json.missing.some((item) => item.file.endsWith("contract.txt")));

    const emptyAudit = scenario({ audit: "" });
    assert.equal(emptyAudit.code, 1);
    assert.ok(emptyAudit.json.missing.some((item) => item.file.endsWith("audit.md")));

    const noHeading = scenario({ audit: "## Gap audit: sample\n### Verdict\nCLEAN\n" });
    assert.equal(noHeading.code, 1);
    assert.ok(noHeading.json.missing.some((item) => item.problem === "no ### Approved cuts heading"));
  });

  test("exits 1 for approvals that are not JSON, and for an entry without a reason or without text and claim", () => {
    const notJson = scenario({ approvals: "not json{" });
    assert.equal(notJson.code, 1);
    assert.ok(notJson.json.missing.some((item) => item.file.endsWith("approvals.json")));

    const noReason = scenario({ approvals: JSON.stringify({ approvedCuts: [{ text: BLOCK }] }) });
    assert.equal(noReason.code, 1);
    assert.ok(noReason.json.missing.some((item) => item.problem.includes("reason")));

    const noTextOrClaim = scenario({ approvals: JSON.stringify({ approvedCuts: [{ reason: "r" }] }) });
    assert.equal(noTextOrClaim.code, 1);
    assert.ok(noTextOrClaim.json.missing.some((item) => item.problem.includes("text or claim")));
  });

  test("exits 1 for a missing verbatim file but 0 for an empty one", () => {
    const missingVerbatim = scenario({ verbatim: null });
    assert.equal(missingVerbatim.code, 1);
    assert.ok(missingVerbatim.json.missing.some((item) => item.problem === "missing"));

    assert.equal(scenario({ verbatim: "" }).code, 0);
  });

  test("reads a UTF-16LE verbatim file with a byte-order mark", () => {
    const bom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${VERBATIM}`, "utf16le")]);
    const result = scenario({ verbatim: bom });
    assert.equal(result.code, 0);
  });

  test("exits 2 when --rewrite is missing, and when the original path does not exist", () => {
    const paths = materialize({});
    const withoutRewrite = toArgs(paths).filter((arg) => !arg.startsWith("--rewrite="));
    assert.equal(runArgs(withoutRewrite).code, 2);

    const absent = materialize({ original: null });
    assert.equal(runArgs(toArgs(absent)).code, 2);
  });

  test("a claim-only approved cut passes the shape check and approves nothing", () => {
    const approvals = JSON.stringify({ approvedCuts: [{ reason: "r", claim: "the block is gone" }] });
    assert.equal(
      scenario({
        rewrite: "Then call gh api repos/o/r/issues.\nFetch https://dev.example.com/api/items first.\n",
        approvals,
      }).code,
      1,
    );
  });
});
