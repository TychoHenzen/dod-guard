import path from "node:path";
import { isMaintainedSource } from "./repository-files.mjs";

const LANGUAGE_BY_EXTENSION = new Map([
  [".c", "C/C++"],
  [".cc", "C/C++"],
  [".cpp", "C/C++"],
  [".cs", ".NET"],
  [".fs", ".NET"],
  [".go", "Go"],
  [".h", "C/C++"],
  [".hpp", "C/C++"],
  [".java", "Java/Kotlin"],
  [".js", "JavaScript/TypeScript"],
  [".jsx", "JavaScript/TypeScript"],
  [".kt", "Java/Kotlin"],
  [".kts", "Java/Kotlin"],
  [".php", "PHP"],
  [".py", "Python"],
  [".rb", "Ruby"],
  [".rs", "Rust"],
  [".sh", "Shell"],
  [".swift", "Swift"],
  [".ts", "JavaScript/TypeScript"],
  [".tsx", "JavaScript/TypeScript"],
  [".vb", ".NET"],
]);

const NON_SOURCE_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".json",
  ".jsonc",
  ".lock",
  ".md",
  ".svg",
  ".toml",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

function sourceExtension(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension) return extension;
  return null;
}

function sortedObject(map) {
  return Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b)));
}

function recordLanguage(tally, file, extension) {
  const language = LANGUAGE_BY_EXTENSION.get(extension);
  if (language) {
    const evidence = tally.languageSignals.get(language) ?? [];
    evidence.push(file);
    tally.languageSignals.set(language, evidence);
    return;
  }
  if (!NON_SOURCE_EXTENSIONS.has(extension)) tally.unclassified.add(extension);
}

function tallySources(relativeFiles) {
  const tally = { extensionCounts: new Map(), languageSignals: new Map(), unclassified: new Set() };
  for (const file of relativeFiles.filter(isMaintainedSource)) {
    const extension = sourceExtension(file);
    if (!extension) continue;
    tally.extensionCounts.set(extension, (tally.extensionCounts.get(extension) ?? 0) + 1);
    recordLanguage(tally, file, extension);
  }
  return tally;
}

export function classifySources(relativeFiles) {
  const tally = tallySources(relativeFiles);
  return {
    sourceExtensions: sortedObject(tally.extensionCounts),
    languageSignals: sortedObject(tally.languageSignals),
    unclassifiedSourceExtensions: [...tally.unclassified].sort(),
  };
}
