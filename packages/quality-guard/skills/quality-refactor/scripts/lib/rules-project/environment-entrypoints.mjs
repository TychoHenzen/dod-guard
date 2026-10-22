import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readText } from "../walk.mjs";

const BUILD_SYSTEM = /\[build-system\]/;
const DOTNET_PROJECT = /\.csproj$/i;
const DOTNET_SOLUTION = /\.sln$/i;
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

function rootFiles(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
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
  return [
    {
      file: "package.json",
      build: command(scripts.build, "npm run build"),
      test: command(scripts.test, "npm test"),
    },
  ];
}

function cargoEntrypoints(root) {
  return rootFiles(root).includes("Cargo.toml")
    ? [{ file: "Cargo.toml", build: "cargo build", test: "cargo test" }]
    : [];
}

function dotnetEntrypoints(root) {
  const files = rootFiles(root);
  const solutions = files.filter((name) => DOTNET_SOLUTION.test(name));
  if (solutions.length === 1) return [dotnetCommand(solutions[0])];
  if (solutions.length > 1)
    return [ambiguousDotnet(solutions[0], "solution", solutions)];
  const projects = files.filter((name) => DOTNET_PROJECT.test(name));
  if (projects.length === 1) return [dotnetCommand(projects[0])];
  if (projects.length > 1)
    return [ambiguousDotnet(projects[0], "project", projects)];
  return [];
}

const dotnetCommand = (file) => {
  const build = `dotnet build ${file}`;
  const test = `dotnet test ${file}`;
  return { file, build, test };
};
const ambiguousDotnet = (file, kind, files) => ({
  file,
  build: null,
  test: null,
  reason: `multiple root .NET ${kind} files (${files.join(", ")})`,
});

function pythonEntrypoints(root) {
  const python = read(root, "pyproject.toml");
  if (python === null) return [];
  const build = BUILD_SYSTEM.test(python) ? "python -m build" : null;
  const test = PYTEST_CONFIGURATION.test(python) ? "python -m pytest" : null;
  return [{ file: "pyproject.toml", build, test }];
}

export function rootEntrypoints(root) {
  return [
    ...nodeEntrypoints(root),
    ...cargoEntrypoints(root),
    ...dotnetEntrypoints(root),
    ...pythonEntrypoints(root),
  ];
}
