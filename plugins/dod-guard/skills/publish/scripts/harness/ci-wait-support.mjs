export const SHA = "a".repeat(40);
export const REPOSITORY = "TychoHenzen/dod-guard";

export function checks(list) {
  return JSON.stringify({ check_runs: list });
}

export function checkRun(id, status, conclusion = null) {
  return { id, name: "build-test", status, conclusion };
}

export function fakeGh(responses) {
  const calls = [];
  async function gh(args) {
    calls.push(args);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  }
  return { gh, calls };
}
