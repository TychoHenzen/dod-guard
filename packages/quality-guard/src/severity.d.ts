declare module "#quality-guard-severity" {
  export type Severity = "high" | "medium" | "low";
  export function requireSeverity(severity: unknown): Severity;
}
