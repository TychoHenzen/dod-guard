import { sameRepository } from "./project-reads.mjs";
import { issueRecord } from "./snapshot-issues.mjs";
import { readJson } from "./snapshot-runner.mjs";

// Follows the sub-issues of the snapshot's issues that are not Project items, so a parent is judged
// from what its children are instead of being held for a Project item they never had. Each followed
// issue is read once with one REST GET and its own sub-issues are followed in turn. Sub-issues of
// another repository are left alone: the snapshot is one repository's.
export function followSubIssues({ issues, repository, read }) {
  const known = new Map(issues.map((issue) => [issue.number, issue]));
  const followed = [];
  const pending = [...issues];
  while (pending.length > 0) {
    const issue = pending.shift();
    for (const child of issue.children) {
      if (!sameRepository(child.repository, repository) || known.has(child.number)) {
        continue;
      }
      const endpoint = `repos/${repository}/issues/${child.number}`;
      const record = issueRecord(readJson(read, endpoint, ["api", endpoint]), repository, read);
      known.set(record.number, record);
      followed.push(record);
      pending.push(record);
    }
  }
  return [...issues, ...followed];
}
