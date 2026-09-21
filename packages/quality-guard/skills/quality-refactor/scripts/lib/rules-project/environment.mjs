import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readText } from "../walk.mjs";

const BUILD_SYSTEM = /\[build-system\]/;
const DOTNET_PROJECT = /\.csproj$/i;
const DOTNET_SOLUTION = /\.sln$/i;
const PYTEST_CONFIGURATION = /\[tool\.pytest(?:\.|\])/i;
const ROOT_EVIDENCE = "<repository root>";
const SUPPORTED_ROOT_EVIDENCE = "package.json, Cargo.toml, pyproject.toml, .sln, or .csproj";

function read(root, name) {
  return readText(join(root, name));
}

function packageJson(root) {
  const text = read(root, "package.json");
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function dotnetFiles(root) {
  try {
    return readdirSync(root).sort();
  } catch {
    return [];
  }
}

function command(value, name) {
  return typeof value === "string" && value.trim() !== "" ? name : null;
}

function nodeEntrypoints(root) {
  const node = packageJson(root);
  if (node === null) return [];
  const scripts = node.scripts ?? {};
  return [{ file: "package.json", build: command(scripts.build, "npm run build"), test: command(scripts.test, "npm test") }];
}

function cargoEntrypoints(root) {
  return existsSync(join(root, "Cargo.toml")) ? [{ file: "Cargo.toml", build: "cargo build", test: "cargo test" }] : [];
}

function dotnetEntrypoints(root) {
  const files = dotnetFiles(root);
  const solutions = files.filter((name) => DOTNET_SOLUTION.test(name));
  if (solutions.length === 1) return [dotnetCommand(solutions[0])];
  if (solutions.length > 1) return [ambiguousDotnet(solutions[0], "solution", solutions)];
  const projects = files.filter((name) => DOTNET_PROJECT.test(name));
  if (projects.length === 1) return [dotnetCommand(projects[0])];
  if (projects.length > 1) return [ambiguousDotnet(projects[0], "project", projects)];
  return [];
}

const dotnetCommand = (file) => ({ file, build: `dotnet build ${file}`, test: `dotnet test ${file}` });
const ambiguousDotnet = (file, kind, files) => ({ file, build: null, test: null, reason: `multiple root .NET ${kind} files (${files.join(", ")})` });

function pythonEntrypoints(root) {
  const python = read(root, "pyproject.toml");
  if (python === null) return [];
  return [{ file: "pyproject.toml", build: BUILD_SYSTEM.test(python) ? "python -m build" : null, test: PYTEST_CONFIGURATION.test(python) ? "python -m pytest" : null }];
}

function rootEntrypoints(root) {
  return [...nodeEntrypoints(root), ...cargoEntrypoints(root), ...dotnetEntrypoints(root), ...pythonEntrypoints(root)];
}

function finding(input) {
  const { file, rule, severity, message } = input;
  return { file, line: 1, rule, severity, message, metric: 1 };
}

export function resolveEntrypoints(root) {
  return rootEntrypoints(root)[0] ?? null;
}

export function checkEnvironment(root, config) {
  const manifests = rootEntrypoints(root);
  if (manifests.length === 0) {
    const reason = `no supported root entry point declaration found; inspected ${SUPPORTED_ROOT_EVIDENCE}`;
    return [["build-entrypoint", "E1", "build"], ["test-entrypoint", "E2", "test"]].map(([rule, prefix, kind]) =>
      finding({ file: ROOT_EVIDENCE, rule, severity: config.presence[rule], message: `${prefix}: ${reason} — add one documented root ${kind} entry point` }),
    );
  }
  return manifests.flatMap((manifest) => {
    const found = [];
    const reason = manifest.reason || `no declared ${manifest.file} entry point`;
    if (manifest.build === null) found.push(finding({ file: manifest.file, rule: "build-entrypoint", severity: config.presence["build-entrypoint"], message: `E1: ${reason} — add one root build entry point` }));
    if (manifest.test === null) found.push(finding({ file: manifest.file, rule: "test-entrypoint", severity: config.presence["test-entrypoint"], message: `E2: ${reason} — add one root test entry point` }));
    return found;
  });
}
