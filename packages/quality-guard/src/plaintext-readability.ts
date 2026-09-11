import { type SpawnSyncReturns, spawnSync } from "node:child_process";

export const READABILITY_POLICY = {
  minimumWords: 20,
  threshold: 80,
  maximumSentenceWords: 25,
  weights: {
    fleschReadingEase: 0.6,
    fleschKincaidGrade: 0.4,
  },
  targets: {
    fleschReadingEase: 60,
    fleschKincaidGrade: 9,
  },
} as const;

export type TextstatMeasures = {
  fleschReadingEase: number;
  fleschKincaidGrade: number;
};

export type TextstatResult =
  | {
      status: "ok";
      measures: TextstatMeasures;
    }
  | {
      status: "unavailable";
      reason: string;
    };

export type ReadabilityStatus = "pass" | "fail" | "skipped" | "unavailable";

export type ReadabilityResult = {
  status: ReadabilityStatus;
  reason: string;
  message: string;
  wordCount: number;
  score?: number;
  threshold: number;
  measures?: TextstatMeasures;
  constraintFailures: string[];
  context?: string;
  policy: typeof READABILITY_POLICY;
};

export type TextstatProvider = (text: string) => TextstatResult;

type Spawn = (
  command: string,
  args: string[],
  options: {
    encoding: "utf8";
    input: string;
    timeout: number;
    windowsHide: boolean;
  },
) => SpawnSyncReturns<string>;

const TEXTSTAT_TIMEOUT_MS = 2_000;
const TEXTSTAT_PYTHON = [
  "import json, sys, textstat",
  "text = sys.stdin.read()",
  "print(json.dumps({",
  "  'measures': {",
  "    'fleschReadingEase': textstat.flesch_reading_ease(text),",
  "    'fleschKincaidGrade': textstat.flesch_kincaid_grade(text),",
  "  }",
  "}))",
].join("\n");

function textOf(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function commandArgs(): string[] | TextstatResult {
  const configured = process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
  if (!configured) return ["-c", TEXTSTAT_PYTHON];
  try {
    const parsed: unknown = JSON.parse(configured);
    if (
      !Array.isArray(parsed) ||
      parsed.some((argument) => typeof argument !== "string")
    ) {
      return {
        status: "unavailable",
        reason: "QUALITY_GUARD_TEXTSTAT_ARGS must be a JSON array of strings",
      };
    }
    return parsed;
  } catch {
    return {
      status: "unavailable",
      reason: "QUALITY_GUARD_TEXTSTAT_ARGS is not valid JSON",
    };
  }
}

function finiteMeasures(value: unknown): TextstatMeasures | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const fleschReadingEase = candidate.fleschReadingEase;
  const fleschKincaidGrade = candidate.fleschKincaidGrade;
  if (typeof fleschReadingEase !== "number") return undefined;
  if (!Number.isFinite(fleschReadingEase)) return undefined;
  if (typeof fleschKincaidGrade !== "number") return undefined;
  if (!Number.isFinite(fleschKincaidGrade)) return undefined;
  return { fleschReadingEase, fleschKincaidGrade };
}

function providerResponse(stdout: string): TextstatResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      status: "unavailable",
      reason: "textstat returned malformed JSON",
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      status: "unavailable",
      reason: "textstat returned a non-object response",
    };
  }
  const object = parsed as Record<string, unknown>;
  if (object.languageSupported === false) {
    return {
      status: "unavailable",
      reason: "textstat reported that the input language is unsupported",
    };
  }
  const measures = finiteMeasures(object.measures ?? object);
  if (!measures) {
    return {
      status: "unavailable",
      reason: "textstat returned missing or non-finite measures",
    };
  }
  return { status: "ok", measures };
}

export function runTextstat(
  text: string,
  options: { command?: string; args?: string[]; spawn?: Spawn } = {},
): TextstatResult {
  const args = options.args ?? commandArgs();
  if (!Array.isArray(args)) return args;
  const command =
    options.command ?? process.env.QUALITY_GUARD_TEXTSTAT_COMMAND ?? "python";
  const spawn = options.spawn ?? (spawnSync as Spawn);
  let result: SpawnSyncReturns<string>;
  try {
    result = spawn(command, args, {
      encoding: "utf8",
      input: text,
      timeout: TEXTSTAT_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch (error) {
    return {
      status: "unavailable",
      reason: `textstat could not start: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (result.error || result.status !== 0) {
    const detail = textOf(result.stderr).trim() || result.error?.message;
    return {
      status: "unavailable",
      reason: detail
        ? `textstat failed: ${detail.slice(0, 300)}`
        : `textstat exited with code ${result.status ?? "unknown"}`,
    };
  }
  return providerResponse(textOf(result.stdout));
}

function normalizePlaintext(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`]*`/gu, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[[0-9]+(?:\s*[,;-]\s*[0-9]+)*\]/gu, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/gmu, "")
    .replace(/\b[A-Za-z][A-Za-z0-9]*[_$][A-Za-z0-9_$]*\b/gu, " ")
    .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*(?:[./][A-Za-z0-9_$-]+)+\b/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function wordsIn(text: string): string[] {
  return text.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [];
}

function sentenceWordCounts(text: string): number[] {
  return text
    .split(/[.!?]+|\n+/u)
    .map((sentence) => wordsIn(sentence).length)
    .filter((count) => count > 0);
}

function hasUnsupportedScript(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.some((letter) => !/\p{Script=Latin}/u.test(letter));
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function scoreMeasures(measures: TextstatMeasures): number {
  const easeScore = clamp(
    (measures.fleschReadingEase /
      READABILITY_POLICY.targets.fleschReadingEase) *
      100,
  );
  const gradeScore = clamp(
    ((12 - measures.fleschKincaidGrade) /
      (12 - READABILITY_POLICY.targets.fleschKincaidGrade)) *
      100,
  );
  return rounded(
    easeScore * READABILITY_POLICY.weights.fleschReadingEase +
      gradeScore * READABILITY_POLICY.weights.fleschKincaidGrade,
  );
}

function contextFor(text: string): string {
  const context = text.slice(0, 240);
  return context.length === text.length ? context : `${context}...`;
}

function messageFor(
  status: ReadabilityStatus,
  reason: string,
  measures?: TextstatMeasures,
  score?: number,
  constraintFailures: string[] = [],
  context?: string,
): string {
  if (status !== "fail") return `Readability check ${status}: ${reason}.`;
  const values = measures
    ? `Flesch Reading Ease ${measures.fleschReadingEase}; ` +
      `Flesch-Kincaid Grade ${measures.fleschKincaidGrade}; ` +
      `combined score ${score}; threshold ${READABILITY_POLICY.threshold}.`
    : "No readability measures were available.";
  const constraints = constraintFailures.length
    ? ` Constraints failed: ${constraintFailures.join("; ")}.`
    : "";
  return `Readability check failed. ${values}${constraints} Context: ${JSON.stringify(context ?? "")}`;
}

function baseResult(
  status: ReadabilityStatus,
  reason: string,
  wordCount: number,
  extra: Partial<ReadabilityResult> = {},
): ReadabilityResult {
  return {
    status,
    reason,
    message: messageFor(
      status,
      reason,
      extra.measures,
      extra.score,
      extra.constraintFailures,
      extra.context,
    ),
    wordCount,
    threshold: READABILITY_POLICY.threshold,
    constraintFailures: [],
    policy: READABILITY_POLICY,
    ...extra,
  };
}

export function checkPlaintextReadability(
  text: string,
  provider: TextstatProvider = runTextstat,
): ReadabilityResult {
  const normalized = normalizePlaintext(text);
  const wordCount = wordsIn(normalized).length;
  if (wordCount === 0) {
    return baseResult("skipped", "input is empty after normalization", 0);
  }
  if (hasUnsupportedScript(normalized)) {
    return baseResult(
      "unavailable",
      "input uses a language script outside the supported Latin policy",
      wordCount,
    );
  }
  if (wordCount < READABILITY_POLICY.minimumWords) {
    return baseResult(
      "skipped",
      `input has ${wordCount} words and needs at least ${READABILITY_POLICY.minimumWords}`,
      wordCount,
    );
  }

  let providerResult: TextstatResult;
  try {
    providerResult = provider(normalized);
  } catch (error) {
    return baseResult(
      "unavailable",
      `textstat provider failed: ${error instanceof Error ? error.message : String(error)}`,
      wordCount,
    );
  }
  if (providerResult.status === "unavailable") {
    return baseResult("unavailable", providerResult.reason, wordCount);
  }

  const measures = providerResult.measures;
  const score = scoreMeasures(measures);
  const sentenceCounts = sentenceWordCounts(normalized);
  const longestSentence = Math.max(0, ...sentenceCounts);
  const constraintFailures =
    longestSentence > READABILITY_POLICY.maximumSentenceWords
      ? [
          `a sentence has ${longestSentence} words, over the ${READABILITY_POLICY.maximumSentenceWords}-word limit`,
        ]
      : [];
  const status =
    score >= READABILITY_POLICY.threshold && constraintFailures.length === 0
      ? "pass"
      : "fail";
  const reason =
    status === "pass"
      ? "combined score and sentence-length policy passed"
      : score < READABILITY_POLICY.threshold
        ? "combined score is below the threshold"
        : "dyslexia-friendly sentence-length policy failed";
  return baseResult(status, reason, wordCount, {
    score,
    measures,
    constraintFailures,
    context: status === "fail" ? contextFor(normalized) : undefined,
  });
}

export function readabilityExitCode(status: ReadabilityStatus): number {
  return status === "fail" ? 2 : 0;
}
