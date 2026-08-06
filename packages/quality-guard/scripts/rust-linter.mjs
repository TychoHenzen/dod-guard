/**
 * Clippy findings for one Rust file, checked against the whole crate.
 *
 * Clippy has no single-file mode: it always looks at the whole crate, so
 * this module gets its own much longer timeout than the shared per-file
 * linters in project-linter.mjs, and only ever runs when the repository is
 * a cargo crate. `--no-deps` keeps the run to a check of this crate rather
 * than a build of every dependency, and there is no `--fix`, so nothing is
 * ever written.
 *
 * `spawn` mirrors node:child_process's spawnSync so a test can stub the
 * clippy invocation directly, without a module-mock flag.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { WHOLE_PROJECT_TIMEOUT_MS as TIMEOUT_MS } from './linter-timeout.mjs';

function run(spawn, args, cwd) {
  const result = spawn('cargo', args, {
    cwd, encoding: 'utf8', timeout: TIMEOUT_MS, shell: false,
  });
  return result.stdout || '';
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A path, resolved against the crate root, with backslashes normalised. */
function normalizedPath(repoRoot, candidate) {
  return resolve(repoRoot, candidate).replace(/\\/g, '/');
}

/** The span clippy marks as primary, or null when the diagnostic has none. */
function primarySpan(message) {
  return (message.spans || []).find((span) => span.is_primary) || null;
}

/**
 * One clippy diagnostic from one line of `--message-format=json` output, or
 * null when the line is not an error-level diagnostic on the target file.
 * Most lines in the stream are build artefacts, not diagnostics, and clippy
 * also reports warnings and notes on the same stream.
 */
function diagnosticAt(line, target, repoRoot) {
  const parsed = parseJson(line);
  if (!parsed || parsed.reason !== 'compiler-message') return null;
  const message = parsed.message;
  if (!message || message.level !== 'error') return null;
  const span = primarySpan(message);
  if (!span || !span.file_name) return null;
  if (normalizedPath(repoRoot, span.file_name) !== target) return null;
  return {
    line: span.line_start,
    rule: message.code?.code || 'clippy',
    message: message.message,
  };
}

/** Error-level clippy diagnostics whose primary span names the edited file. */
function clippyFindings(stdout, filePath, repoRoot) {
  const target = normalizedPath(repoRoot, filePath);
  return stdout.split('\n').flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const finding = diagnosticAt(trimmed, target, repoRoot);
    return finding ? [finding] : [];
  });
}

/**
 * Clippy, only when the repository is a cargo crate. Fails open: a timeout,
 * a missing cargo binary, or unparsable output all read the same as clippy
 * finding nothing.
 */
export function rustFindings(filePath, repoRoot, spawn = spawnSync) {
  if (!existsSync(join(repoRoot, 'Cargo.toml'))) return [];
  try {
    const stdout = run(spawn, ['clippy', '--message-format=json', '--no-deps'], repoRoot);
    return clippyFindings(stdout, filePath, repoRoot);
  } catch {
    return [];
  }
}
