export function linterResult(findings = []) {
  return { findings, unavailable: null };
}

export function linterUnavailable(detail) {
  return { findings: [], unavailable: detail };
}
