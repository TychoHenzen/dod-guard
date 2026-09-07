import type { ErrorDetails } from "./error-details.js";

const detailKeys = new Set<keyof ErrorDetails>([
  "field",
  "limit",
  "actual",
  "view_generation",
  "current_generation",
  "state",
  "path",
]);

function isNormalizedProjectRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

function validDetail(key: string, value: unknown): boolean {
  if (!detailKeys.has(key as keyof ErrorDetails)) return false;
  if (key === "path")
    return typeof value === "string" && isNormalizedProjectRelativePath(value);
  return typeof value === "string" || typeof value === "number";
}

export function sanitizeDetails(details: ErrorDetails): ErrorDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([key, value]) => validDetail(key, value)),
  ) as ErrorDetails;
}
