import process from "node:process";
export function printChecks(checks, score, kind) {
  process.stdout.write(`kind: ${kind}\n`);
  const maxLabel = Math.max(...checks.map((c) => c.label.length));
  for (const c of checks) {
    const mark = c.pass ? (c.warn ? "~" : "+") : "-";
    const pad = " ".repeat(maxLabel - c.label.length);
    process.stdout.write(`[${mark}] ${c.label}${pad}  ${c.score.toFixed(2)}  ${c.detail}\n`);
  }
  const passed = checks.filter((c) => c.pass).length;
  process.stdout.write(`\n${passed}/${checks.length} passed\n`);
  process.stdout.write(`5.0-readiness: ${score}/100\n`);
}

export function printComparison(rows, scores) {
  process.stdout.write("\n  Before / After migration check\n");
  process.stdout.write("  " + "-".repeat(70) + "\n");
  for (const r of rows) {
    const icon = { FIXED: "+", REGRESSED: "!", PASS: "=", FAIL: "x" }[r.status];
    process.stdout.write(
      `  [${icon}] ${r.status.padEnd(10)} ${r.label}\n` +
        `      before: ${r.before.detail}\n` +
        `      after:  ${r.after.detail}\n`,
    );
  }
  const fixed = rows.filter((r) => r.status === "FIXED").length;
  const regressed = rows.filter((r) => r.status === "REGRESSED").length;
  const passing = rows.filter((r) => r.status === "PASS" || r.status === "FIXED").length;
  const delta = scores.after - scores.before;
  process.stdout.write(`\n  ${passing}/${rows.length} passing, ${fixed} fixed, ${regressed} regressed\n`);
  process.stdout.write(
    `  5.0-readiness: ${scores.before}/100 -> ${scores.after}/100 (${delta >= 0 ? "+" : ""}${delta})\n`,
  );
}
