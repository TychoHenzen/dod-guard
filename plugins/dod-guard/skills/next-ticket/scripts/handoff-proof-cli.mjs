// Argument and file reading for handoff-proof.mjs. Every problem the caller can
// fix is a UsageError, which the entry point reports as exit 2.
import { readFileSync } from "node:fs";
import { parseArgs } from "../../../lib/args.mjs";
import { decodeText, NOT_UTF8, TextEncodingError } from "../../../lib/read-text.mjs";

class UsageError extends Error {}

const SUBCOMMAND_HINT = "the first argument must be the refinement, post-push, or finalization subcommand";
const POST_PUSH_ONLY = new Set(["handoff-file", "head-sha"]);
const BODY = ["body-file", "path"];
const POST_PUSH = {
  allowed: new Set(["body-file", "children", "handoff-file", "head-sha"]),
  required: [BODY, ["handoff-file", "path"], ["head-sha", "sha"]],
};
const SUBCOMMANDS = Object.freeze({
  refinement: { allowed: new Set(["body-file", "children"]), required: [BODY] },
  "post-push": POST_PUSH,
  finalization: POST_PUSH,
});

function unknownOptionError(unknown, subcommand) {
  if (subcommand === "refinement" && POST_PUSH_ONLY.has(unknown)) {
    return new UsageError(`--${unknown} only applies to post-push`);
  }
  return new UsageError(`unknown option --${unknown}`);
}

// An option given without a value parses as "true" or "", and neither names a
// file or a head.
function requireOptions(options, required) {
  for (const [name, placeholder] of required) {
    if (!options[name] || options[name] === "true") {
      throw new UsageError(`--${name}=<${placeholder}> is required`);
    }
  }
}

function optionsFrom(argv) {
  const [subcommand, ...rest] = argv;
  if (!Object.hasOwn(SUBCOMMANDS, subcommand)) {
    throw new UsageError(SUBCOMMAND_HINT);
  }
  const spec = SUBCOMMANDS[subcommand];
  const options = parseArgs(rest);
  if (options === null) {
    throw new UsageError(`unexpected argument ${rest.find((item) => !item.startsWith("--"))}`);
  }
  const unknown = Object.keys(options).find((name) => !spec.allowed.has(name));
  if (unknown) {
    throw unknownOptionError(unknown, subcommand);
  }
  requireOptions(options, spec.required);
  return { subcommand, options };
}

// Windows PowerShell 5.1 `>` writes UTF-16 with a byte-order mark; the shared
// decoder reads that and a UTF-8 mark. A file it cannot decode, such as UTF-16
// without a mark or Latin-1, is refused by name rather than read as text full
// of NUL characters that report present records as missing.
function readText(file, option) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new UsageError(`cannot read --${option} ${file}`);
  }
  try {
    return decodeText(bytes);
  } catch (error) {
    if (error instanceof TextEncodingError) {
      throw new UsageError(`--${option} ${file} ${NOT_UTF8}`);
    }
    throw error;
  }
}

function readChildren(file) {
  if (file === undefined) return [];
  let children;
  try {
    children = JSON.parse(readText(file, "children"));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError("--children file is not valid JSON");
  }
  if (!Array.isArray(children)) throw new UsageError("--children file must hold a JSON array");
  return children;
}

export { optionsFrom, readChildren, readText, UsageError };
