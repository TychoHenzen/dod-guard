import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const OUTPUT_LINE_COUNT = 120;
const FIXTURE_ARGUMENT_START = 3;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}

function requireValue(value, usage) {
  if (!value) {
    fail(usage);
    return false;
  }
  return true;
}

function runPathFixture(args) {
  if (args.some((value) => value.includes("*"))) {
    fail("path expansion: wildcard must be expanded before execution");
    return;
  }
  if (args.length < 2) {
    fail("argv: paths must be separate arguments");
    return;
  }
  process.stdout.write(`${JSON.stringify({ paths: args })}\n`);
}

function runOutputFixture() {
  for (let index = 1; index <= OUTPUT_LINE_COUNT; index += 1) {
    process.stdout.write(`line-${index}\n`);
  }
}

function runRequiredFixture(args) {
  if (!requireValue(args[0], "preflight: missing required package argument; usage: smoke-bundle.mjs <package-name>")) {
    return;
  }
  process.stdout.write(`${JSON.stringify({ package: args[0] })}\n`);
}

function runDestinationFixture(args) {
  const [source, destination] = args;
  if (!requireValue(source, "preflight: missing source argument")) {
    return;
  }
  if (!requireValue(destination, "preflight: missing destination argument")) {
    return;
  }
  const parent = dirname(destination);
  if (!existsSync(parent)) {
    fail(`preflight: destination parent missing: ${parent}`);
    return;
  }
  renameSync(source, destination);
  process.stdout.write(`${JSON.stringify({ source, destination })}\n`);
}

function runPolicyFixture(args) {
  const [operation, marker] = args;
  if (operation === "recursive-cleanup") {
    fail("policy preflight: recursive cleanup was refused before execution");
    return;
  }
  if (!requireValue(marker, "preflight: safe probe requires a marker path")) {
    return;
  }
  writeFileSync(marker, "safe probe\n");
  process.stdout.write(`${JSON.stringify({ marker })}\n`);
}

function runPatchFixture(args) {
  const payload = args[0] ?? "";
  if (!payload.endsWith("*** End Patch")) {
    fail("wrapper: patch payload must end with *** End Patch");
    return;
  }
  process.stdout.write("patch accepted\n");
}

function runFixture(mode, args) {
  switch (mode) {
    case "paths":
      runPathFixture(args);
      break;
    case "output":
      runOutputFixture();
      break;
    case "required":
      runRequiredFixture(args);
      break;
    case "destination":
      runDestinationFixture(args);
      break;
    case "policy":
      runPolicyFixture(args);
      break;
    case "patch":
      runPatchFixture(args);
      break;
    default:
      fail(`fixture: unknown mode ${mode ?? "<missing>"}`);
  }
}

function mutationEntry(path) {
  const exists = existsSync(path);
  let content = null;
  if (exists) {
    content = readFileSync(path, "utf8");
  }
  return { path, exists, content };
}

function mutationState(paths) {
  return paths.map(mutationEntry);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runFixture(process.argv[2], process.argv.slice(FIXTURE_ARGUMENT_START));
}

export { mutationState };
