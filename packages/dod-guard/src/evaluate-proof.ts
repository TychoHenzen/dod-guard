console.debug("evaluate-proof: module loaded", { pid: process.pid });

import type { TaskNode, LeafResult, Predicate } from "./types.js";
import type { AssertionReport } from "./assertions.js";
import type { ObservabilityReport } from "./observability.js";
import type { BrevityReport, BrevityOpts, BrevityViolation } from "./brevity.js";
import { perProofFingerprint } from "./manual.js";
import { extractNumber } from "./regression.js";
import { analyseAssertions } from "./assertions.js";
import { analyseObservability, analyseObservabilityFromOutput } from "./observability.js";
import { analyseBrevity, analyseBrevityFromOutput, DEFAULT_BREVITY_OPTS } from "./brevity.js";
function parseStryker(o: string): number | null {
  const lines = o.split(/\r?\n/);
  const hi = lines.findIndex((l) => l.includes("|") && /#\s*survived/i.test(l));
  if (hi === -1) return null;
  const col = lines[hi].split("|").map((c) => c.trim().toLowerCase())
    .findIndex((c) => /survived/.test(c));
  if (col === -1) return null;
  const dl = lines.find(
    (l) => l.includes("|") && l.trim().toLowerCase().startsWith("all files"),
  );
  if (!dl) return null;
  const v = Number(dl.split("|").map((c) => c.trim())[col]);
  return Number.isFinite(v) ? v : null;
}
function parseMutmut(o: string): number | null {
  const m = o.match(/🙁[^\d]*(\d+)/); return m ? Number(m[1]) : null; }
function parseCargoMutants(o: string): number | null {
  const m = o.match(/(\d+)\s+missed\b/); return m ? Number(m[1]) : null; }
export function parseSurvivors(o: string): number | null {
  for (const p of [parseStryker, parseMutmut, parseCargoMutants]) {
    const s = p(o);
    if (s !== null) return s;
  }
  return null;
}
export type RunResult = {
  exitCode: number; combined: string; duration: number;
  error?: string; killed?: boolean; notFound?: boolean;
};
export type ExecFn = (cmd: string, cwd: string) => Promise<RunResult>;
function mk(b: Record<string, unknown>, ov: Partial<LeafResult>): LeafResult {
  return { ...b, ...ov } as LeafResult;
}
function buildManualOut(
  mr: NonNullable<TaskNode["manual_result"]>, label: string,
): string {
  const n = mr.note ? ` — "${mr.note}"` : "";
  return `${mr.answer === "fail" ? "✗" : "✓"} ${label} ${
    mr.answer.toUpperCase()
  } (dod_verify) ${mr.confirmed_at}/${mr.channel}${n}`;
}
function buildAssertFail(r: AssertionReport, min: number): string {
  const pf = r.perFile.map((f) =>
    `  ${f.file}: ${f.total} tot, ${f.trivial} triv, ${f.total - f.trivial} nt`).join("\n");
  const hdr = r.nonTrivial === 0
    ? "ASSERTION QUALITY FAIL: all " + r.total + " assertions trivial"
    : "ASSERTION QUALITY FAIL: only " + r.nonTrivial + " nt, need " + min;
  return [hdr, "", "Per-file:", pf].join("\n");
}
function buildObsFail(r: ObservabilityReport, min: number): string {
  const l: string[] = [];
  if (r.totalLogStatements < min) l.push(`observability: ${r.totalLogStatements} logs—need ${min}`);
  const u = r.totalErrorHandlers - r.errorHandlersLogged;
  if (u > 0) l.push(`observability: ${u}/${r.totalErrorHandlers} handlers lack logs`);
  if (r.antiPatterns.length > 0)
    l.push("observability: " + r.antiPatterns.length + " anti-pattern(s)"
      + r.antiPatterns.map((a) => `  ${a.file}:${a.line}: ${a.kind} — ${a.snippet}`).join(""));
  return l.join("\n");
}
function buildBrev(r: BrevityReport, passed: boolean, max: number): string {
  const l: string[] = [
    passed ? `brevity: ${r.totalViolations} ≤ ${max}` : `BREVITY FAIL: ${r.totalViolations} > ${max}`, "",
  ];
  for (const f of r.perFile) {
    const p = [`  ${f.file}: ${f.lineCount}L, ${f.functionCount} funcs`];
    if (f.longFunctions > 0) p.push(`${f.longFunctions} long`);
    if (f.highComplexityFunctions > 0) p.push(`${f.highComplexityFunctions} CC>5`);
    if (f.unnecessaryElseCount > 0) p.push(`${f.unnecessaryElseCount} unnec else`);
    if (f.elseAvoidableCount > 0) p.push(`${f.elseAvoidableCount} avoid else`);
    if (f.insertions !== undefined && f.deletions !== undefined)
      p.push(`+${f.insertions}/-${f.deletions}`);
    l.push(p.join(", "));
    for (const v of f.violations)
      l.push(`    • L${v.line}: ${v.kind} — ${v.detail}`);
  }
  if (!passed) l.push("", "Remediation:",
    `  • Split functions >${DEFAULT_BREVITY_OPTS.maxFunctionLines}L into single-purpose units`,
    "  • Reduce cyclomatic complexity — extract decision-heavy blocks into helpers",
    "  • Prefer guard clauses — if-block exits → no else needed",
    "  • Delete old code when replacing (low deletion ratio = accretion)",
    `  • Keep lines under ${DEFAULT_BREVITY_OPTS.maxLineLength} chars — break long expressions`,
    `  • Split files >${DEFAULT_BREVITY_OPTS.maxFileLines} lines into modules`);
  return l.join("\n");
}
async function hManual(n: TaskNode, b: Record<string, unknown>): Promise<LeafResult> {
  const label = n.predicate!.type === "review"
    ? "Code review" : "Manual verification";
  const mr = n.manual_result;
  if (mr && mr.proof_fingerprint === perProofFingerprint(n))
    return mk(b, { status: mr.answer, output: buildManualOut(mr, label),
      error: mr.answer === "fail" ? `${label} confirmed failing.` : undefined });
  return mk(b, { status: "skipped",
    output: `${label} not verified — dod_verify(dod_id, "${n.id}")` });
}
function hExecFail(
  r: RunResult, b: Record<string, unknown>,
): LeafResult | null {
  if (!r.killed && !r.notFound) return null;
  return mk(b, { status: "fail", output: r.combined, error: r.error,
    exit_code: r.exitCode, duration_ms: r.duration });
}
async function hMutate(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
): Promise<LeafResult> {
  const max = (n.predicate!.value as number) ?? 0;
  const sv = parseSurvivors(r.combined);
  if (sv === null)
    return mk(b, { status: "fail", output: r.combined,
      error: "could not parse mutation results (no recognized tool)",
      exit_code: r.exitCode, duration_ms: r.duration });
  const passed = sv <= max;
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: passed ? undefined : `mutation: ${sv} > max ${max}`,
    exit_code: r.exitCode, duration_ms: r.duration });
}
async function hRegress(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
): Promise<LeafResult> {
  const m = extractNumber(r.combined, n.predicate!.extract);
  if (m === null)
    return mk(b, { status: "fail", output: r.combined,
      error: "regression: no metric (fail-safe)",
      exit_code: r.exitCode, duration_ms: r.duration });
  if (n.baseline_value === undefined) {
    n.baseline_value = m; n.baseline_captured_at = new Date().toISOString();
    return mk(b, { status: "pass", output: r.combined,
      error: `regression: N0=${m}. Re-run.`,
      exit_code: r.exitCode, duration_ms: r.duration });
  }
  // Coverage metrics default to "higher is better" unless explicitly overridden.
  const lib = n.predicate!.lower_is_better ?? (n.category !== "coverage");
  const tol = (n.predicate!.value as number) ?? 0;
  const bl = n.baseline_value;
  const th = lib ? bl * (1 + tol) : bl * (1 - tol);
  const passed = lib ? m <= th : m >= th;
  const dir = lib ? "≤" : "≥";
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: passed ? undefined : `regression: ${m} ${dir} ${th} (baseline=${bl}, lower_is_better=${lib})`,
    exit_code: r.exitCode, duration_ms: r.duration });
}
async function hStream(n: TaskNode, r: RunResult, b: Record<string, unknown>): Promise<LeafResult> {
  const max = (n.predicate!.value as number) ?? 0;
  if (r.exitCode > 1)
    return mk(b, { status: "fail", output: r.combined,
      error: `streamline: exit ${r.exitCode} (fail-safe)`,
      exit_code: r.exitCode, duration_ms: r.duration });
  if (r.exitCode === 1)
    return mk(b, { status: "pass", output: r.combined,
      error: "streamline: no matches",
      exit_code: r.exitCode, duration_ms: r.duration });
  const mc = r.combined.split(/\r?\n/).filter((l) => l.trim()).length;
  const passed = mc <= max;
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: passed ? undefined : `streamline: ${mc} > max ${max}`,
    exit_code: r.exitCode, duration_ms: r.duration });
}
async function hAssert(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  cmd: string, cwd: string,
): Promise<LeafResult> {
  const min = (n.predicate!.value as number) ?? 1;
  const report = analyseAssertions(cmd, cwd);
  if (!report)
    return mk(b, { status: "fail", output: r.combined,
      error: "assertions: no test files found",
      exit_code: r.exitCode, duration_ms: r.duration });
  if (report.nonTrivial < min)
    return mk(b, { status: "fail", output: r.combined,
      error: buildAssertFail(report, min),
      exit_code: r.exitCode, duration_ms: r.duration });
  const s = report.nonTrivial + " non-trivial (" + report.total + " tot, " + report.trivial + " triv)";
  return mk(b, { status: "pass", output: r.combined, error: "assertions: " + s,
    exit_code: r.exitCode, duration_ms: r.duration });
}
async function hObs(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  cmd: string, cwd: string,
): Promise<LeafResult> {
  const min = (n.predicate!.value as number) ?? 1;
  let report = analyseObservability(cmd, cwd);
  if (!report) report = analyseObservabilityFromOutput(r.combined, cwd);
  if (!report)
    return mk(b, { status: "fail", output: r.combined,
      error: "observability: no source files",
      exit_code: r.exitCode, duration_ms: r.duration });
  if (report.totalLogStatements >= min
    && report.totalErrorHandlers - report.errorHandlersLogged === 0
    && report.antiPatterns.length === 0) {
    const s = report.totalLogStatements + " logs, " + report.totalErrorHandlers + " handlers, clean";
    return mk(b, { status: "pass", output: r.combined, error: "observability: " + s,
      exit_code: r.exitCode, duration_ms: r.duration });
  }
  return mk(b, { status: "fail", output: r.combined,
    error: buildObsFail(report, min),
    exit_code: r.exitCode, duration_ms: r.duration });
}
async function hBrev(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  cmd: string, cwd: string,
): Promise<LeafResult> {
  const max = (n.predicate!.value as number) ?? 0;
  const p = n.predicate!;
  const opts: BrevityOpts = {
    maxLineLength: p.max_line_length ?? DEFAULT_BREVITY_OPTS.maxLineLength,
    maxFunctionLines: p.max_function_lines ?? DEFAULT_BREVITY_OPTS.maxFunctionLines,
    maxFileLines: p.max_file_lines ?? DEFAULT_BREVITY_OPTS.maxFileLines,
    maxComplexity: p.max_complexity ?? DEFAULT_BREVITY_OPTS.maxComplexity,
    requireGuardClauses: p.require_guard_clauses ?? DEFAULT_BREVITY_OPTS.requireGuardClauses,
    suggestGuardClauses: p.suggest_guard_clauses ?? DEFAULT_BREVITY_OPTS.suggestGuardClauses,
    minReplacementRatio: p.min_replacement_ratio ?? DEFAULT_BREVITY_OPTS.minReplacementRatio,
  };
  let report = analyseBrevity(cmd, cwd, opts);
  if (!report) report = analyseBrevityFromOutput(r.combined, cwd, opts);
  if (!report)
    return mk(b, { status: "fail", output: r.combined,
      error: "brevity: no source files",
      exit_code: r.exitCode, duration_ms: r.duration });
  const passed = report.totalViolations <= max;
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: buildBrev(report, passed, max),
    exit_code: r.exitCode, duration_ms: r.duration });
}
// ── Decomposed brevity handlers (one per violation kind) ───────────────

function buildLineLenFail(r: BrevityReport, max: number, maxChars: number): string {
  const vl = r.violations.filter(v => v.kind === "line_too_long");
  const l: string[] = [
    `line_length FAIL: ${vl.length} line(s) > ${maxChars} chars`, "",
  ];
  for (const f of r.perFile) {
    const fv = f.violations.filter(v => v.kind === "line_too_long");
    if (fv.length === 0) continue;
    l.push(`  ${f.file}: ${f.lineCount}L, ${fv.length} long line(s)`);
    for (const v of fv) l.push(`    • L${v.line}: ${v.detail}`);
  }
  l.push("", `Remediation: break long lines at ≤${DEFAULT_BREVITY_OPTS.maxLineLength} chars.`);
  return l.join("\n");
}

function buildFnSizeFail(r: BrevityReport, max: number, maxLines: number): string {
  const vl = r.violations.filter(v => v.kind === "function_too_long");
  const l: string[] = [
    `function_size FAIL: ${vl.length} function(s) > ${maxLines} lines`, "",
  ];
  for (const f of r.perFile) {
    const fv = f.violations.filter(v => v.kind === "function_too_long");
    if (fv.length === 0) continue;
    l.push(`  ${f.file}: ${f.functionCount} funcs, ${fv.length} long`);
    for (const v of fv) l.push(`    • L${v.line}: ${v.detail}`);
  }
  l.push("", `Remediation: split functions >${DEFAULT_BREVITY_OPTS.maxFunctionLines} lines into single-purpose units.`);
  return l.join("\n");
}

function buildFileSizeFail(r: BrevityReport, max: number, maxLines: number): string {
  const vl = r.violations.filter(v => v.kind === "file_too_long");
  const l: string[] = [
    `file_size FAIL: ${vl.length} file(s) > ${maxLines} lines`, "",
  ];
  for (const f of r.perFile) {
    const fv = f.violations.filter(v => v.kind === "file_too_long");
    if (fv.length === 0) continue;
    l.push(`  ${f.file}: ${f.lineCount}L (max ${maxLines})`);
    for (const v of fv) l.push(`    • ${v.detail}`);
  }
  l.push("", `Remediation: split files >${DEFAULT_BREVITY_OPTS.maxFileLines} lines into modules.`);
  return l.join("\n");
}

function buildCohesionFail(r: BrevityReport, max: number): string {
  const kinds: BrevityViolation["kind"][] = ["high_complexity", "unnecessary_else", "else_avoidable"];
  const vl = r.violations.filter(v => kinds.includes(v.kind));
  const l: string[] = [
    `cohesion FAIL: ${vl.length} violation(s) (max ${max} allowed)`, "",
  ];
  for (const f of r.perFile) {
    const fv = f.violations.filter(v => kinds.includes(v.kind));
    if (fv.length === 0) continue;
    const parts = [`  ${f.file}: ${f.functionCount} funcs`];
    if (f.highComplexityFunctions > 0) parts.push(`${f.highComplexityFunctions} CC>5`);
    if (f.unnecessaryElseCount > 0) parts.push(`${f.unnecessaryElseCount} unnec else`);
    if (f.elseAvoidableCount > 0) parts.push(`${f.elseAvoidableCount} avoid else`);
    l.push(parts.join(", "));
    for (const v of fv) l.push(`    • L${v.line}: ${v.kind} — ${v.detail}`);
  }
  l.push("", "Remediation:",
    "  • Reduce cyclomatic complexity — extract decision-heavy blocks into helpers",
    "  • Prefer guard clauses — if-block exits → no else needed",
    "  • Refactor if/else to use early returns, eliminate else");
  return l.join("\n");
}

function buildReplRatioFail(r: BrevityReport, max: number, minRatio: number): string {
  const vl = r.violations.filter(v => v.kind === "low_replacement_ratio");
  const l: string[] = [
    `replacement_ratio FAIL: ${vl.length} file(s) below min ratio ${(minRatio * 100).toFixed(0)}%`, "",
  ];
  for (const v of vl) l.push(`  • ${v.file} L${v.line}: ${v.detail}`);
  l.push("", "Remediation: delete old code when replacing (low deletion ratio = accretion).");
  return l.join("\n");
}

async function hLineLength(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  cmd: string, cwd: string,
): Promise<LeafResult> {
  const max = (n.predicate!.value as number) ?? 0;
  const opts: BrevityOpts = {
    ...DEFAULT_BREVITY_OPTS,
    maxLineLength: n.predicate!.max_line_length ?? DEFAULT_BREVITY_OPTS.maxLineLength,
  };
  let report = analyseBrevity(cmd, cwd, opts);
  if (!report) report = analyseBrevityFromOutput(r.combined, cwd, opts);
  if (!report)
    return mk(b, { status: "fail", output: r.combined,
      error: "line_length: no source files",
      exit_code: r.exitCode, duration_ms: r.duration });
  const count = report.violations.filter(v => v.kind === "line_too_long").length;
  const passed = count <= max;
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: passed
      ? `line_length: all lines ≤ ${opts.maxLineLength} chars`
      : buildLineLenFail(report, max, opts.maxLineLength),
    exit_code: r.exitCode, duration_ms: r.duration });
}

async function hFunctionSize(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  cmd: string, cwd: string,
): Promise<LeafResult> {
  const max = (n.predicate!.value as number) ?? 0;
  const opts: BrevityOpts = {
    ...DEFAULT_BREVITY_OPTS,
    maxFunctionLines: n.predicate!.max_function_lines ?? DEFAULT_BREVITY_OPTS.maxFunctionLines,
  };
  let report = analyseBrevity(cmd, cwd, opts);
  if (!report) report = analyseBrevityFromOutput(r.combined, cwd, opts);
  if (!report)
    return mk(b, { status: "fail", output: r.combined,
      error: "function_size: no source files",
      exit_code: r.exitCode, duration_ms: r.duration });
  const count = report.violations.filter(v => v.kind === "function_too_long").length;
  const passed = count <= max;
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: passed
      ? `function_size: all functions ≤ ${opts.maxFunctionLines} lines`
      : buildFnSizeFail(report, max, opts.maxFunctionLines),
    exit_code: r.exitCode, duration_ms: r.duration });
}

async function hFileSize(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  cmd: string, cwd: string,
): Promise<LeafResult> {
  const max = (n.predicate!.value as number) ?? 0;
  const opts: BrevityOpts = {
    ...DEFAULT_BREVITY_OPTS,
    maxFileLines: n.predicate!.max_file_lines ?? DEFAULT_BREVITY_OPTS.maxFileLines,
  };
  let report = analyseBrevity(cmd, cwd, opts);
  if (!report) report = analyseBrevityFromOutput(r.combined, cwd, opts);
  if (!report)
    return mk(b, { status: "fail", output: r.combined,
      error: "file_size: no source files",
      exit_code: r.exitCode, duration_ms: r.duration });
  const count = report.violations.filter(v => v.kind === "file_too_long").length;
  const passed = count <= max;
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: passed
      ? `file_size: all files ≤ ${opts.maxFileLines} lines`
      : buildFileSizeFail(report, max, opts.maxFileLines),
    exit_code: r.exitCode, duration_ms: r.duration });
}

async function hCohesion(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  cmd: string, cwd: string,
): Promise<LeafResult> {
  const max = (n.predicate!.value as number) ?? 0;
  const p = n.predicate!;
  const opts: BrevityOpts = {
    ...DEFAULT_BREVITY_OPTS,
    maxComplexity: p.max_complexity ?? DEFAULT_BREVITY_OPTS.maxComplexity,
    requireGuardClauses: p.require_guard_clauses ?? DEFAULT_BREVITY_OPTS.requireGuardClauses,
    suggestGuardClauses: p.suggest_guard_clauses ?? DEFAULT_BREVITY_OPTS.suggestGuardClauses,
  };
  let report = analyseBrevity(cmd, cwd, opts);
  if (!report) report = analyseBrevityFromOutput(r.combined, cwd, opts);
  if (!report)
    return mk(b, { status: "fail", output: r.combined,
      error: "cohesion: no source files",
      exit_code: r.exitCode, duration_ms: r.duration });
  const kinds: BrevityViolation["kind"][] = ["high_complexity", "unnecessary_else", "else_avoidable"];
  const count = report.violations.filter(v => kinds.includes(v.kind)).length;
  const passed = count <= max;
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: passed
      ? `cohesion: 0 violations (CC≤${opts.maxComplexity}, guards checked)`
      : buildCohesionFail(report, max),
    exit_code: r.exitCode, duration_ms: r.duration });
}

async function hReplacementRatio(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  _cmd: string, cwd: string,
): Promise<LeafResult> {
  const max = (n.predicate!.value as number) ?? 0;
  const minRatio = n.predicate!.min_replacement_ratio ?? DEFAULT_BREVITY_OPTS.minReplacementRatio;
  const opts: BrevityOpts = {
    ...DEFAULT_BREVITY_OPTS,
    minReplacementRatio: minRatio,
  };
  // replacement_ratio needs diff output — try command output first, then file scan as fallback
  let report = analyseBrevityFromOutput(r.combined, cwd, opts);
  if (!report) report = analyseBrevity(_cmd, cwd, opts);
  if (!report)
    return mk(b, { status: "fail", output: r.combined,
      error: "replacement_ratio: no diff data in command output",
      exit_code: r.exitCode, duration_ms: r.duration });
  const count = report.violations.filter(v => v.kind === "low_replacement_ratio").length;
  const passed = count <= max;
  return mk(b, { status: passed ? "pass" : "fail", output: r.combined,
    error: passed
      ? `replacement_ratio: all files above ${(minRatio * 100).toFixed(0)}% deletion ratio`
      : buildReplRatioFail(report, max, minRatio),
    exit_code: r.exitCode, duration_ms: r.duration });
}

async function hTdd(
  n: TaskNode, r: RunResult, b: Record<string, unknown>,
  cmd: string, cwd: string,
): Promise<LeafResult> {
  const exp = (n.predicate!.value as number) ?? 0;
  const g = r.exitCode === exp;
  if (g && !n.seen_failing)
    return mk(b, { status: "fail", output: r.combined,
      error: "TDD: GREEN w/o prior RED — tautology?",
      exit_code: r.exitCode, duration_ms: r.duration });
  if (!g && !n.seen_failing) {
    n.seen_failing = true; n.seen_failing_at = new Date().toISOString();
    return mk(b, { status: "fail", output: r.combined,
      error: "TDD RED: test fails. Implement fix.",
      exit_code: r.exitCode, duration_ms: r.duration });
  }
  if (g && n.seen_failing) {
    const ar = analyseAssertions(cmd, cwd);
    if (ar && ar.nonTrivial === 0)
      return mk(b, { status: "fail", output: r.combined,
        error: "TDD: GREEN but assertions trivial.",
        exit_code: r.exitCode, duration_ms: r.duration });
    return mk(b, { status: "pass", output: r.combined,
      error: "TDD verified" + (ar ? " (" + ar.nonTrivial + " nt)" : ""),
      exit_code: r.exitCode, duration_ms: r.duration });
  }
  return mk(b, { status: "fail", output: r.combined,
    error: `TDD: failed (exit=${r.exitCode}, exp=${exp})`,
    exit_code: r.exitCode, duration_ms: r.duration });
}
export async function executeProof(
  node: TaskNode, cwd: string, execFn: ExecFn,
): Promise<LeafResult> {
  const cmd = node.command!;
  const base = { node_path: "", id: node.id, title: node.title,
    description: node.description!, command: cmd };
  if (node.predicate!.type === "manual" || node.predicate!.type === "review")
    return hManual(node, base);
  const run = await execFn(cmd, cwd);
  const ef = await hExecFail(run, base);
  if (ef) return ef;
  switch (node.predicate!.type) {
    case "mutation": return hMutate(node, run, base);
    case "regression": return hRegress(node, run, base);
    case "streamline": return hStream(node, run, base);
    case "assertions": return hAssert(node, run, base, cmd, cwd);
    case "observability": return hObs(node, run, base, cmd, cwd);
    case "brevity": return hBrev(node, run, base, cmd, cwd);
    case "line_length": return hLineLength(node, run, base, cmd, cwd);
    case "function_size": return hFunctionSize(node, run, base, cmd, cwd);
    case "file_size": return hFileSize(node, run, base, cmd, cwd);
    case "cohesion": return hCohesion(node, run, base, cmd, cwd);
    case "replacement_ratio": return hReplacementRatio(node, run, base, cmd, cwd);
    case "tdd": return hTdd(node, run, base, cmd, cwd);
    default: break;
  }
  const passed = evaluatePredicate(node.predicate!, run.exitCode, run.combined);
  return mk(base, { status: passed ? "pass" : "fail", output: run.combined,
    error: passed ? undefined
      : `pred ${node.predicate!.type} fail (exit=${run.exitCode})`,
    exit_code: run.exitCode, duration_ms: run.duration });
}
function evaluatePredicate(
  predicate: Predicate, exitCode: number, stdout: string,
): boolean {
  switch (predicate.type) {
    case "exit_code": return exitCode === (predicate.value as number);
    case "exit_code_not": return exitCode !== (predicate.value as number);
    case "output_contains": return stdout.includes(predicate.value as string);
    case "output_matches":
      return new RegExp(predicate.value as string, "m").test(stdout);
    case "output_not_contains":
      return !stdout.includes(predicate.value as string);
    case "output_not_matches":
      return !new RegExp(predicate.value as string, "m").test(stdout);
    case "tdd": return exitCode === ((predicate.value as number) ?? 0);
    default: return true;
  }
}
