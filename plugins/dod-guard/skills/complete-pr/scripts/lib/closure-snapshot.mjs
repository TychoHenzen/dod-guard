// The closure snapshot that standards/project-workflow.md defines, built from
// GitHub REST GET requests plus the one read-only GraphQL read that resolves
// the linked Project, which REST cannot read. Every read goes through one
// injected runner in gh-runner's convention, so the tests answer the same calls
// from fixtures. The shaping functions take data already read and return
// snapshot records; nothing here writes to GitHub.
// biome-ignore lint/correctness/noNodejsModules: This shipped command writes the snapshot file.
import { renameSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command reads its process id for the partial file.
import process from "node:process";
import { sameRepository } from "./project-reads.mjs";
import { projectFields } from "./snapshot-fields.mjs";
import { issueRecord } from "./snapshot-issues.mjs";
import { readShapedItems } from "./snapshot-items.mjs";
import { itemsEndpoint, projectRecord, readRepository, snapshotProject } from "./snapshot-project.mjs";
import { pullRequestRecords } from "./snapshot-pulls.mjs";
import { guardedRunner } from "./snapshot-runner.mjs";

const JSON_INDENT = 2;

// Builds the snapshot for one repository. Every read goes through the runner and nothing is written.
export function buildClosureSnapshot({ repository, runner }) {
  const read = guardedRunner(runner);
  const repo = readRepository(read, repository);
  const { basePath, project } = snapshotProject(read, repo.fullName);
  const fields = projectFields(read, basePath, project.number);
  const endpoint = itemsEndpoint(basePath, project.number, fields.fieldIds);
  const shaped = readShapedItems(read, endpoint, fields.fieldIds);
  const targets = shaped.filter(({ item }) => sameRepository(item.repository, repo.fullName));
  const issues = targets
    .filter(({ item }) => item.contentType === "Issue")
    // ASSUMPTION: the Project item's content carries the issue fields the snapshot keeps, so no
    // per-issue read is made.
    .map(({ content }) => issueRecord(content, repo.fullName, read));
  return {
    repository: repo.fullName,
    defaultBranch: repo.defaultBranch,
    project: projectRecord(repo.fullName, project, fields),
    items: shaped.map(({ item }) => item),
    issues,
    pullRequests: pullRequestRecords(targets, { repository: repo.fullName, read, endpoint }),
  };
}

// Writes the snapshot through a sibling partial file that is renamed onto the output, and a failed
// write removes that partial file. The CLI removes any earlier output before the read starts.
export function writeClosureSnapshot(output, snapshot) {
  const partial = `${output}.partial-${process.pid}`;
  try {
    writeFileSync(partial, `${JSON.stringify(snapshot, null, JSON_INDENT)}\n`);
    renameSync(partial, output);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
}
