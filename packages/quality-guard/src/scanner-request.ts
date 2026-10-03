export interface ScanRequest {
  paths: string[];
  root?: string;
  rules?: string[];
  excludes?: string[];
  testPaths?: string[];
  profile?: "default" | "strict";
  baseline?: string;
  writeBaseline?: string;
  failOn?: "none" | "error" | "regression" | "any";
}

export function buildArgs(request: ScanRequest): string[] {
  return [
    ...request.paths,
    "--format=json",
    ...optionalArgs(request),
    ...repeatedArgs("--exclude", request.excludes),
    ...repeatedArgs("--test-path", request.testPaths),
  ];
}

function optionalArgs(request: ScanRequest): string[] {
  return [
    flag("--root", request.root),
    flag("--profile", request.profile),
    flag(
      "--rules",
      request.rules?.length ? request.rules.join(",") : undefined,
    ),
    flag("--baseline", request.baseline),
    flag("--write-baseline", request.writeBaseline),
    flag("--fail-on", request.failOn),
  ].filter((value): value is string => value !== undefined);
}

function flag(name: string, value: string | undefined): string | undefined {
  return value === undefined ? undefined : `${name}=${value}`;
}

function repeatedArgs(name: string, values: string[] | undefined): string[] {
  return (values ?? []).map((value) => `${name}=${value}`);
}
