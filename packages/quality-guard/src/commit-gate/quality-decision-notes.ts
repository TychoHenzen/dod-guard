import { execFileSync, spawnSync } from "node:child_process";

export const QUALITY_DECISION_NOTES_REF = "refs/notes/quality-decisions";

const COMMIT_SHA = /^[0-9a-f]{40}$/i;

export interface QualityDecisionAttestation {
  findingId: string;
  fingerprint: string;
  baseSha: string;
  targetSha: string;
  reason: string;
  author: string;
  time: string;
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function required(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${location} must be a non-empty string`);
  return value.trim();
}

function commitSha(value: unknown, location: string): string {
  const sha = required(value, location);
  if (!COMMIT_SHA.test(sha)) throw new Error(`${location} must be a commit SHA`);
  return sha;
}

function parseRecord(item: unknown, index: number): QualityDecisionAttestation {
  if (item === null || typeof item !== "object" || Array.isArray(item))
    throw new Error(`quality decision note[${index}] must be an object`);
  const record = item as Record<string, unknown>;
  const allowed = new Set(
    "findingId fingerprint baseSha targetSha reason author time".split(" "),
  );
  const unexpected = Object.keys(record).find((key) => !allowed.has(key));
  if (unexpected)
    throw new Error(`quality decision note[${index}].${unexpected} is not supported`);
  return {
    findingId: required(record.findingId, `quality decision note[${index}].findingId`),
    fingerprint: required(record.fingerprint, `quality decision note[${index}].fingerprint`),
    baseSha: commitSha(record.baseSha, `quality decision note[${index}].baseSha`),
    targetSha: commitSha(record.targetSha, `quality decision note[${index}].targetSha`),
    reason: required(record.reason, `quality decision note[${index}].reason`),
    author: required(record.author, `quality decision note[${index}].author`),
    time: required(record.time, `quality decision note[${index}].time`),
  };
}

function parse(source: string): QualityDecisionAttestation[] {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("quality decision note must contain valid JSON");
  }
  if (!Array.isArray(value)) throw new Error("quality decision note must contain an array");
  return value.map(parseRecord);
}

function validateTarget(root: string, record: QualityDecisionAttestation) {
  const targetSha = git(root, ["rev-parse", record.targetSha]);
  const baseSha = git(root, ["rev-parse", `${record.targetSha}^`]);
  if (targetSha !== record.targetSha)
    throw new Error("quality decision attestation target does not resolve exactly");
  if (baseSha !== record.baseSha)
    throw new Error("quality decision attestation base does not match the target parent");
}

export function readQualityDecisionNotes(
  root: string,
  targetSha: string,
): QualityDecisionAttestation[] {
  const result = spawnSync(
    "git",
    ["notes", `--ref=${QUALITY_DECISION_NOTES_REF}`, "show", targetSha],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    if (/failed to resolve|no note found/.test(result.stderr)) return [];
    throw new Error(result.stderr.trim());
  }
  const records = parse(result.stdout.trim());
  if (records.some((record) => record.targetSha !== targetSha))
    throw new Error("quality decision note target does not match its Git note key");
  return records;
}

export function writeQualityDecisionNote(
  root: string,
  record: QualityDecisionAttestation,
) {
  validateTarget(root, record);
  const records = [...readQualityDecisionNotes(root, record.targetSha), record];
  execFileSync(
    "git",
    [
      "notes",
      `--ref=${QUALITY_DECISION_NOTES_REF}`,
      "add",
      "--force",
      "--message",
      `${JSON.stringify(records, null, 2)}\n`,
      record.targetSha,
    ],
    { cwd: root, stdio: "ignore" },
  );
}
