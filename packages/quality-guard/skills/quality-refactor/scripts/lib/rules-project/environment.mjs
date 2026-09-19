import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readText } from "../walk.mjs";

const BUILD_SYSTEM = /\[build-system\]/;
const DOTNET_PROJECT = /\.(?:sln|csproj)$/i;
const PYTEST_CONFIGURATION = /\[tool\.pytest(?:\.|\])/i;

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

function dotnetProjects(root) {
  try {
    return readdirSync(root).filter((name) => DOTNET_PROJECT.test(name)).sort();
  } catch {
    return [];
  }
}

function command(value, name) {
  return typeof value === "string" && value.trim() !== "" ? name : null;
}

function rootEntrypoints(root) {
  const found = [];
  const node = packageJson(root);
  if (node !== null) {
    const scripts = node.scripts ?? {};
    found.push({ file: "package.json", build: command(scripts.build, "npm run build"), test: command(scripts.test, "npm test") });
  }
  if (existsSync(join(root, "Cargo.toml"))) found.push({ file: "Cargo.toml", build: "cargo build", test: "cargo test" });
  const dotnet = dotnetProjects(root);
  if (dotnet.length === 1) found.push({ file: dotnet[0], build: `dotnet build ${dotnet[0]}`, test: `dotnet test ${dotnet[0]}` });
  else if (dotnet.length > 1) found.push({ file: dotnet[0], build: null, test: null, reason: `multiple root .NET project files (${dotnet.join(", ")})` });
  const python = read(root, "pyproject.toml");
  if (python !== null) found.push({ file: "pyproject.toml", build: BUILD_SYSTEM.test(python) ? "python -m build" : null, test: PYTEST_CONFIGURATION.test(python) ? "python -m pytest" : null });
  return found;
}

function finding(rule, severity, message) {
  return { file: "package.json", line: 1, rule, severity, message, metric: 1 };
}

export function resolveEntrypoints(root) {
  return rootEntrypoints(root)[0] ?? null;
}

export function checkEnvironment(root, config) {
  return rootEntrypoints(root).flatMap((manifest) => {
    const found = [];
    const reason = manifest.reason ?? `no declared ${manifest.file} entry point`;
    if (manifest.build === null) found.push(finding("build-entrypoint", config.presence["build-entrypoint"], `E1: ${reason} — add one root build entry point`));
    if (manifest.test === null) found.push(finding("test-entrypoint", config.presence["test-entrypoint"], `E2: ${reason} — add one root test entry point`));
    return found.map((violation) => ({ ...violation, file: manifest.file }));
  });
}
