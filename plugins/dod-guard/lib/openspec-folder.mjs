// Reads and writes an OpenSpec change folder as { proposal, design, specs:
// { [capability]: text }, tasks }, the shape openspec-issue-map.mjs maps.
// The format check, the spec merge, and the publish step all move change
// folders through these two functions.
// biome-ignore lint/correctness/noNodejsModules: change folders are files on disk
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: change paths are joined per platform
import { join } from "node:path";

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

// Capability folders directly under specs/, each holding a spec.md. OpenSpec
// also reads nested area folders; this mapper does not, so a nested spec is
// not read.
function readSpecs(changeDir) {
  const specsDir = join(changeDir, "specs");
  if (!existsSync(specsDir)) return {};
  const specs = {};
  for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
    const text = entry.isDirectory() ? readOptional(join(specsDir, entry.name, "spec.md")) : null;
    if (text !== null) specs[entry.name] = text;
  }
  return specs;
}

function readChangeFolder(changeDir) {
  return {
    proposal: readOptional(join(changeDir, "proposal.md")) ?? "",
    design: readOptional(join(changeDir, "design.md")) ?? "",
    specs: readSpecs(changeDir),
    tasks: readOptional(join(changeDir, "tasks.md")),
  };
}

// Writes proposal.md and every spec, plus design.md and tasks.md when they
// hold text. A missing tasks.md is valid: `openspec archive` accepts it.
function writeChangeFolder(changeDir, files) {
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, "proposal.md"), files.proposal ?? "");
  if (files.design) writeFileSync(join(changeDir, "design.md"), files.design);
  if (files.tasks) writeFileSync(join(changeDir, "tasks.md"), files.tasks);
  for (const [capability, text] of Object.entries(files.specs ?? {})) {
    const specDir = join(changeDir, "specs", capability);
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "spec.md"), text);
  }
}

export { readChangeFolder, writeChangeFolder };
