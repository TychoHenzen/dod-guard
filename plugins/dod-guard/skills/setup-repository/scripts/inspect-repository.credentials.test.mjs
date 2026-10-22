import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fixture, SAMPLE_GITHUB_TOKEN } from "./fixtures/inspector-fixtures.mjs";
import { inspectRepository } from "./inspect-repository.mjs";

test("reports likely credentials without returning their values", async (t) => {
  const root = await fixture(t, "credentials");
  await writeFile(path.join(root, ".env"), "TOKEN=secret\n");
  await writeFile(path.join(root, "config.txt"), `${SAMPLE_GITHUB_TOKEN}\n`);

  const report = await inspectRepository(root);

  assert.deepEqual(report.credentialFindings, [
    { file: ".env", line: null, signal: "secret-like-filename" },
    { file: "config.txt", line: 1, signal: "github-token" },
  ]);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(SAMPLE_GITHUB_TOKEN));
});

test("skips the content scan for oversized and binary files but keeps filename findings", async (t) => {
  const root = await fixture(t, "credential-skips");
  const tokenLine = `${SAMPLE_GITHUB_TOKEN}\n`;
  await writeFile(path.join(root, "server.key"), tokenLine + "x".repeat(1024 * 1024));
  await writeFile(path.join(root, "data.txt"), `${tokenLine}\0`);
  await writeFile(path.join(root, "ok.txt"), tokenLine);

  const report = await inspectRepository(root);

  assert.deepEqual(report.credentialFindings, [
    { file: "ok.txt", line: 1, signal: "github-token" },
    { file: "server.key", line: null, signal: "secret-like-filename" },
  ]);
});

test("flags secret-like file names by pattern and ignores look-alikes and examples", async (t) => {
  const root = await fixture(t, "credential-names");
  const flagged = [".env.local", "credentials.json", "keys/server.KEY", "nested/id_ed25519", "secret", "secrets.yml"];
  const ignored = [".env.example", ".envrc", "id_rsa.pub", "keyring.txt", "secretary.txt"];
  for (const name of [...flagged, ...ignored]) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), "x\n");
  }

  const report = await inspectRepository(root);

  assert.deepEqual(report.credentialFindings.map((finding) => finding.file).sort(), [...flagged].sort());
  assert.ok(report.credentialFindings.every((finding) => finding.line === null));
  assert.ok(report.credentialFindings.every((finding) => finding.signal === "secret-like-filename"));
});
