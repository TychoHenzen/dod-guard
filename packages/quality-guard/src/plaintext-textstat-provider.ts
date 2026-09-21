import type { TextstatMeasures } from "./plaintext-textstat-measures.js";
import type { TextstatResult } from "./plaintext-textstat-result.js";

type ProviderObject = Record<string, unknown>;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteMeasures(value: unknown): TextstatMeasures | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    !finiteNumber(candidate.fleschReadingEase) ||
    !finiteNumber(candidate.fleschKincaidGrade)
  )
    return undefined;
  return {
    fleschReadingEase: candidate.fleschReadingEase,
    fleschKincaidGrade: candidate.fleschKincaidGrade,
  };
}

function parseProviderJson(stdout: string): ProviderObject | string {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (parsed && typeof parsed === "object") return parsed as ProviderObject;
    return "textstat returned a non-object response";
  } catch {
    return "textstat returned malformed JSON";
  }
}

function unsupportedLanguage(value: ProviderObject): TextstatResult | null {
  return value.languageSupported === false
    ? {
        status: "unavailable",
        reason: "textstat reported that the input language is unsupported",
      }
    : null;
}

function missingMeasures(): TextstatResult {
  return {
    status: "unavailable",
    reason: "textstat returned missing or non-finite measures",
  };
}

function measuresResult(value: ProviderObject): TextstatResult {
  const measures = finiteMeasures(value.measures ?? value);
  return measures ? { status: "ok", measures } : missingMeasures();
}

export function providerResponse(stdout: string): TextstatResult {
  const parsed = parseProviderJson(stdout);
  if (typeof parsed === "string")
    return { status: "unavailable", reason: parsed };
  const languageFailure = unsupportedLanguage(parsed);
  if (languageFailure) return languageFailure;
  return measuresResult(parsed);
}
