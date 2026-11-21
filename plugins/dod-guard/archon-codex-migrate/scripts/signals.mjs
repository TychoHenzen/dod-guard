// The skill's scanner rules for a slice: compare the scanner findings before
// and after it, per file and signal.
import { GENERATED } from "./common.mjs";

const SEPARATOR = "\u001f";

// Per file and signal, how many findings the scanner reported.
export function counts(report) {
  const table = new Map();
  for (const finding of report.findings ?? []) {
    const key = `${finding.file}${SEPARATOR}${finding.signal}`;
    table.set(key, (table.get(key) ?? 0) + 1);
  }
  return table;
}

function total(table, files, signals = null) {
  let sum = 0;
  for (const [key, value] of table) {
    const [file, signal] = key.split(SEPARATOR);
    if (files.includes(file) && (signals === null || signals.includes(signal))) {
      sum += value;
    }
  }
  return sum;
}

function bySignal(table, files) {
  const out = new Map();
  for (const [key, value] of table) {
    const [file, signal] = key.split(SEPARATOR);
    if (files.includes(file)) {
      out.set(signal, (out.get(signal) ?? 0) + value);
    }
  }
  return out;
}

function delta(minuend, subtrahend) {
  const out = new Map();
  for (const signal of new Set([...minuend.keys(), ...subtrahend.keys()])) {
    const value = (minuend.get(signal) ?? 0) - (subtrahend.get(signal) ?? 0);
    if (value > 0) {
      out.set(signal, value);
    }
  }
  return out;
}

function same(left, right) {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

function format(table) {
  return [...table].map(([signal, value]) => `${signal} x${value}`).join(", ") || "none";
}

function untouchedElsewhere(before, after, files) {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].every((key) => {
    const file = key.split(SEPARATOR)[0];
    return files.includes(file) || file.startsWith(GENERATED) || before.get(key) === after.get(key);
  });
}

// The skill's scanner rules for one slice. Returns null on a pass.
export function signalProblem(slice, beforeReport, afterReport) {
  const before = counts(beforeReport);
  const after = counts(afterReport);
  // Text the scanner does not flag cannot lower a count; the tests and the
  // session's diff check are all that verify it, and the report says so.
  if (slice.kind === "reword" && slice.signals.length === 0) {
    return null;
  }
  if (slice.kind === "reword") {
    const was = total(before, slice.files, slice.signals);
    const now = total(after, slice.files, slice.signals);
    return now < was ? null : `the target signals did not drop (${was} before, ${now} after)`;
  }
  if (slice.kind === "agents") {
    return null;
  }
  const removed = delta(bySignal(before, slice.from), bySignal(after, slice.from));
  const added = delta(bySignal(after, slice.to), bySignal(before, slice.to));
  if (!same(removed, added)) {
    return (
      `signals removed from ${slice.from.join(", ")} (${format(removed)}) ` +
      `do not equal those added to ${slice.to.join(", ")} (${format(added)})`
    );
  }
  if (!untouchedElsewhere(before, after, [...slice.from, ...slice.to])) {
    return "scanner findings changed in files outside the move";
  }
  if (slice.kind === "reduce-claude" && afterReport.claudeAdapter !== "canonical") {
    return `claudeAdapter reads ${afterReport.claudeAdapter}, not canonical`;
  }
  return null;
}
