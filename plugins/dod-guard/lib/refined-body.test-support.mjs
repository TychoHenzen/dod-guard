import { readFile } from "node:fs/promises";

// A refined issue body: parseIssueBodyRecords reads it with no error and no remainder, so a queue test
// that needs a selectable Todo issue gives it this body.
export const REFINED_BODY = await readFile(new URL("./fixtures/issue-904-body.md", import.meta.url), "utf8");
