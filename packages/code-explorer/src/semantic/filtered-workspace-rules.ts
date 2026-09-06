export function relativePathFor(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

export function isBackendIrrelevant(path: string): boolean {
  return path.split("/").some((part) => BACKEND_IRRELEVANT.test(part));
}

const BACKEND_IRRELEVANT = new RegExp(
  [
    "^(node_modules|dist|target|bin|obj|\\.venv|coverage|docs|reports|",
    "\\.serena|\\.idea|\\.claude|\\.codex|\\.github|\\.data|",
    "\\.evo|\\.skill-migrate|\\.tighten)$",
  ].join(""),
  "iu",
);

export function isBackendSourceFile(path: string): boolean {
  return (
    /\.(rs|cs|csx|fs|vb|toml|json|sln|csproj|props|targets)$/iu.test(path) ||
    /(^|\/)(Cargo\.lock|Cargo\.toml|Directory\.Build\.props)$/iu.test(path)
  );
}
