#!/usr/bin/env node
// The deterministic steps of the clean-house workflow. A survey session
// writes candidates.json; this script turns it into the approval form, keeps
// the later sessions to what was approved, and writes the report.
//
//   options --dir=<artifacts> --repo=<root>        validate candidates.json; print the form as JSON
//   approve --dir=<artifacts> --answer=<json>      record the multi-select answer; print it as JSON
//   checks  --dir=<artifacts>                      print the check command
//   ports   --dir=<artifacts> --repo=<root>        revert port edits that delete files or touch dying ones
//   gate    --dir=<artifacts> --repo=<root>        revert deletion edits the approval did not name
//   report  --dir=<artifacts> --repo=<root>        write and print report.md
//
// Exit 2 on any error.
import { runCli } from "../../archon-shared/scripts/cli.mjs";
import { approve, checks, options } from "./form.mjs";
import { gate, ports } from "./gates.mjs";
import { report } from "./report.mjs";

export { approve, checks, NONE, options } from "./form.mjs";
export { changes, gate, MANIFESTS, ports } from "./gates.mjs";
export { report } from "./report.mjs";

runCli({
  url: import.meta.url,
  name: "clean",
  required: ["dir"],
  commands: {
    options: (args) => JSON.stringify(options(args)),
    approve: (args) => JSON.stringify(approve(args)),
    checks: (args) => checks(args),
    ports: (args) => JSON.stringify(ports(args)),
    gate: (args) => JSON.stringify(gate(args)),
    report: (args) => report(args).trimEnd(),
  },
});
