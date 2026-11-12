// biome-ignore lint/correctness/noNodejsModules: the carry-forward check reads revisions from git
import { spawnSync } from "node:child_process";
import { sameBehavior } from "../../../lib/source-normalize.mjs";

const REVISION = /^[0-9a-f]{7,64}$/;
const MAX_BUFFER = 67_108_864; // 64 MB, the largest revision text read
// ASSUMPTION: newHead gets the same sha check as baseHead, because it is also interpolated into a git argument.
function textAt({ root, revision, file }) {
  const result = spawnSync("git", ["-C", root, "show", `${revision}:${file}`], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  if (result.status === 0) {
    return result.stdout;
  }
  return null;
}
function changedProblem({ file, before, after }) {
  if (sameBehavior({ before, after, file })) {
    return null;
  }
  return `${file} changed code or has no comment-only reading`;
}
function pathProblem({ root, baseHead, newHead, file }) {
  const before = textAt({ root, revision: baseHead, file });
  const after = textAt({ root, revision: newHead, file });
  if (before === null) {
    return `${file} is missing at ${baseHead}`;
  }
  if (after === null) {
    return `${file} is missing at ${newHead}`;
  }
  return changedProblem({ file, before, after });
}
function headProblem(baseHead, newHead) {
  if (!REVISION.test(baseHead)) {
    return "fromHead is not a commit sha";
  }
  if (!REVISION.test(newHead)) {
    return "newHead is not a commit sha";
  }
  if (baseHead === newHead) {
    return "fromHead equals the new head";
  }
  return null;
}
function firstPathProblem({ root, baseHead, newHead, paths }) {
  for (const file of paths) {
    const problem = pathProblem({ root, baseHead, newHead, file });
    if (problem !== null) {
      return problem;
    }
  }
  return null;
}
function checkCarryForward({ root, baseHead, newHead, paths }) {
  const problem = headProblem(baseHead, newHead) ?? firstPathProblem({ root, baseHead, newHead, paths });
  if (problem === null) {
    return { ok: true };
  }
  return { ok: false, reason: problem };
}

export { checkCarryForward };
