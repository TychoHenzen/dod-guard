#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { credentialFindings } from "./credential-scan.mjs";
import { inspectGit } from "./git-inspection.mjs";
import { assessGitHubSnapshot } from "./github-snapshot.mjs";
import { collectFiles, relative } from "./repository-files.mjs";
import { isConfiguration, isInstruction, isManifest } from "./repository-markers.mjs";
import { classifySources } from "./source-classification.mjs";

async function resolveProjectRoot(rootPath) {
  if (typeof rootPath !== "string" || rootPath.length === 0) {
    throw new Error("Project root must be a non-empty path");
  }
  const root = path.resolve(rootPath);
  const rootStats = await stat(root).catch(() => null);
  if (!rootStats?.isDirectory()) throw new Error("Project root is not a directory");
  return root;
}

export async function inspectRepository(rootPath) {
  const root = await resolveProjectRoot(rootPath);
  const files = await collectFiles(root);
  const relativeFiles = files.map((file) => relative(root, file));
  return {
    root,
    git: await inspectGit(root),
    files: relativeFiles,
    manifests: relativeFiles.filter(isManifest),
    configurations: relativeFiles.filter(isConfiguration),
    instructions: relativeFiles.filter(isInstruction),
    ...classifySources(relativeFiles),
    credentialFindings: await credentialFindings(root, files),
  };
}

export function summarizeRepository(report) {
  return {
    root: report.root,
    git: {
      repository: report.git.repository,
      hasCommits: report.git.hasCommits,
      branch: report.git.branch,
      remotes: report.git.remotes.length,
    },
    counts: {
      files: report.files.length,
      manifests: report.manifests.length,
      configurations: report.configurations.length,
      instructions: report.instructions.length,
      sourceExtensions: Object.keys(report.sourceExtensions).length,
      languages: Object.keys(report.languageSignals).length,
      unclassifiedExtensions: report.unclassifiedSourceExtensions.length,
      credentialFindings: report.credentialFindings.length,
    },
  };
}

export { assessGitHubSnapshot };

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runGithubSnapshot(args) {
  if (args.length !== 2 || args.indexOf("--github-snapshot") !== 0) {
    throw new Error("Usage: inspect-repository.mjs --github-snapshot <snapshot.json>");
  }
  writeJson(assessGitHubSnapshot(JSON.parse(await readFile(path.resolve(args[1]), "utf8"))));
}

async function runSummary(args) {
  if (args.length !== 2) throw new Error("Usage: inspect-repository.mjs --summary <project-root>");
  writeJson(summarizeRepository(await inspectRepository(args[1])));
}

async function runFullReport(args) {
  if (args.length > 1) throw new Error("Usage: inspect-repository.mjs [project-root]");
  writeJson(await inspectRepository(args[0] ?? process.cwd()));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--github-snapshot")) return runGithubSnapshot(args);
  if (args[0] === "--summary") return runSummary(args);
  return runFullReport(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
