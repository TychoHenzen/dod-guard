#!/usr/bin/env node
// Checks one saved text against its GitHub cap before it is posted:
//   node <plugin-root>/lib/github-text-check.mjs --kind=<kind> --file=<path>
// Exit 0 prints { ok: true, kind, length, cap }. Exit 1 prints the problem: the
// text is over its cap, nothing may be posted, and it must be written again
// shorter. Exit 2 is a usage error, an unknown kind, or an unreadable file.
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import { parseArgs } from "./args.mjs";
import { CAPS, capOf, capProblem } from "./github-text.mjs";
import { readTextFile } from "./read-text.mjs";

const USAGE = `usage: github-text-check.mjs --kind=<${Object.keys(CAPS).join("|")}> --file=<path>`;

function run(argv) {
  const args = parseArgs(argv);
  if (!(args?.kind && args.file && Object.keys(args).length === 2)) {
    return { code: 2, out: { ok: false, problem: USAGE } };
  }
  try {
    const cap = capOf(args.kind);
    const text = readTextFile(args.file);
    const problem = capProblem(args.kind, text, args.file);
    const out = { ok: problem === null, kind: args.kind, length: text.length, cap };
    return problem === null ? { code: 0, out } : { code: 1, out: { ...out, problem } };
  } catch (error) {
    return { code: 2, out: { ok: false, problem: error.message } };
  }
}

const result = run(process.argv.slice(2));
process.stdout.write(`${JSON.stringify(result.out, null, 2)}\n`);
process.exitCode = result.code;
