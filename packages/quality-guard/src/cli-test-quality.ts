import { runTestQualityReport } from "./test-quality/report.js";

function optionValue(args: string[], name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function runTestQualityCommand(args: string[]): void {
  const result = runTestQualityReport({
    root: optionValue(args, "--root"),
    evidence: optionValue(args, "--evidence"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "invalid") process.exitCode = 3;
}
