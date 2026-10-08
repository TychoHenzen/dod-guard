const SEVERITIES = new Set(["high", "medium", "low"]);

export function requireSeverity(severity) {
  if (SEVERITIES.has(severity)) {
    return severity;
  }
  throw new Error(`unknown quality severity: ${severity}`);
}
